#!/usr/bin/env node
/**
 * scripts/verify-no-secrets.js
 * Part 59 — Prove no API key survives into the production bundle.
 *
 * The whole point of Part 59 is a claim: "there are no secret keys in the app."
 * A claim like that is worth exactly as much as the test that enforces it, so
 * this script exports the real production bundle and scans every byte of it.
 *
 * WHAT IT CHECKS
 *   1. Live key material — sk-…, tvly-…, and anything matching the real values
 *      in your local .env. This catches a key that got inlined by any route,
 *      including ones this script's author never thought of.
 *   2. Forbidden variable names — EXPO_PUBLIC_OPENAI_API_KEY and friends. These
 *      appear in the bundle as a *reference* only if some file still reads them,
 *      so finding one means a service was missed during the migration.
 *   3. Direct vendor endpoints — api.openai.com, api.tavily.com and so on. A
 *      hit here means some code path still calls a provider directly, which
 *      means it needs a key, which means the key is in there somewhere.
 *
 * USAGE
 *   node scripts/verify-no-secrets.js
 *   node scripts/verify-no-secrets.js --keep      (don't delete the export)
 *   node scripts/verify-no-secrets.js --dir dist  (scan an existing export)
 *
 * Exit code 0 = clean, 1 = something leaked. Wire it into CI before release.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const keepDir  = args.includes('--keep');
const dirIndex = args.indexOf('--dir');
const existing = dirIndex !== -1 ? args[dirIndex + 1] : null;

const EXPORT_DIR = existing ?? '.part59-verify-export';

/** Env var names that must NOT be referenced by any app code after Part 59. */
const FORBIDDEN_ENV_VARS = [
  'EXPO_PUBLIC_OPENAI_API_KEY',
  'EXPO_PUBLIC_TAVILY_API_KEY',
  'EXPO_PUBLIC_PEXELS_API_KEY',
  'EXPO_PUBLIC_GIPHY_API_KEY',
  'EXPO_PUBLIC_DEEPSEEK_API_KEY',
  'EXPO_PUBLIC_SERPAPI_KEY',
];

/**
 * Vendor endpoints the app must no longer call directly.
 *
 * NOT included: api.iconify.design (a genuinely public, keyless API) and the
 * Supabase / Stream / Razorpay hosts, whose client-side keys are publishable by
 * design — the same category as the Supabase anon key.
 */
const FORBIDDEN_ENDPOINTS = [
  'api.openai.com',
  'api.tavily.com',
  'api.pexels.com',
  'api.giphy.com',
  'serpapi.com',
];

/** Shapes of real keys, so a hard-coded literal is caught too. */
const KEY_PATTERNS = [
  { name: 'OpenAI key',  re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Tavily key',  re: /\btvly-[A-Za-z0-9_-]{16,}/g },
  { name: 'AWS key',     re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Private key', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
];

const SCAN_EXTENSIONS = new Set(['.js', '.jsbundle', '.hbc', '.json', '.html', '.map']);

// ─── Output helpers ───────────────────────────────────────────────────────────

const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;

// ─── Read the local .env for live key values ──────────────────────────────────

function loadEnvSecrets() {
  const secrets = [];
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return secrets;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const name  = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');

    // Short values produce false positives; publishable keys are meant to ship.
    if (value.length < 16) continue;
    if (name.includes('SUPABASE')) continue;   // URL + anon key are public
    if (name.includes('STREAM'))   continue;   // Stream's client key is public
    if (name.includes('RAZORPAY')) continue;   // key_id is publishable
    if (name.includes('CHECKOUT')) continue;   // just a URL
    if (name.includes('SCHEME') || name.includes('URL')) continue;

    secrets.push({ name, value });
  }
  return secrets;
}

// ─── Build ────────────────────────────────────────────────────────────────────

function buildBundle() {
  if (existing) {
    console.log(dim(`Scanning existing export at ${EXPORT_DIR}`));
    return;
  }

  console.log('Exporting production bundle (this takes a minute)…');
  if (fs.existsSync(EXPORT_DIR)) fs.rmSync(EXPORT_DIR, { recursive: true, force: true });

  try {
    execSync(
      `npx expo export --platform all --output-dir ${EXPORT_DIR} --no-minify`,
      { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
    );
  } catch {
    console.error(red('\nBundle export failed. Fix the build before verifying.'));
    process.exit(1);
  }
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function scan(envSecrets) {
  const files = walk(EXPORT_DIR);
  console.log(dim(`Scanning ${files.length} bundle file(s)…\n`));

  const findings = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // binary asset
    }

    // 1. Live values from .env — the strongest signal.
    for (const { name, value } of envSecrets) {
      if (content.includes(value)) {
        findings.push({
          severity: 'critical',
          file: rel,
          detail: `Live value of ${name} is embedded in the bundle`,
        });
      }
    }

    // 2. Key-shaped literals.
    for (const { name, re } of KEY_PATTERNS) {
      const matches = content.match(re);
      if (matches) {
        const sample = matches[0].slice(0, 12);
        findings.push({
          severity: 'critical',
          file: rel,
          detail: `${name} found (starts "${sample}…", ${matches.length} occurrence(s))`,
        });
      }
    }

    // 3. Variable names that should no longer be referenced.
    for (const varName of FORBIDDEN_ENV_VARS) {
      if (content.includes(varName)) {
        findings.push({
          severity: 'error',
          file: rel,
          detail: `References ${varName} — a service still reads this variable`,
        });
      }
    }

    // 4. Direct vendor endpoints.
    for (const endpoint of FORBIDDEN_ENDPOINTS) {
      if (content.includes(endpoint)) {
        findings.push({
          severity: 'error',
          file: rel,
          detail: `Calls ${endpoint} directly — should go through an Edge Function`,
        });
      }
    }
  }

  return findings;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('\nPart 59 — bundle secret scan\n');

  const envSecrets = loadEnvSecrets();
  if (envSecrets.length > 0) {
    console.log(
      yellow(`Found ${envSecrets.length} secret-looking value(s) in .env to search for:`),
    );
    for (const s of envSecrets) console.log(dim(`  · ${s.name}`));
    console.log('');
  } else {
    console.log(dim('No secret-looking values in .env — scanning patterns only.\n'));
  }

  buildBundle();
  const findings = scan(envSecrets);

  if (!existing && !keepDir) {
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
  }

  if (findings.length === 0) {
    console.log(green('PASS — no API keys, forbidden variables or direct vendor calls found.\n'));
    console.log(dim('Reminder: this checks the JS bundle. Native config files'));
    console.log(dim('(google-services.json, Info.plist) are not covered here.\n'));
    process.exit(0);
  }

  // Deduplicate — the same finding often appears in a bundle and its sourcemap.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.file}|${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(red(`FAIL — ${unique.length} issue(s) found:\n`));

  for (const f of unique) {
    const tag = f.severity === 'critical' ? red('[LEAK] ') : yellow('[WARN] ');
    console.log(`${tag}${f.detail}`);
    console.log(dim(`        in ${f.file}\n`));
  }

  console.log('Fix each one, then re-run this script.\n');
  process.exit(1);
}

main();