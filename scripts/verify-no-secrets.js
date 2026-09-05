#!/usr/bin/env node
/**
 * scripts/verify-no-secrets.js
 * Part 59   — Prove no API key survives into the production bundle.
 * Part 59.1 — Fixed the export, and added a source scan that runs first.
 *
 * ── WHY THIS FILE CHANGED (Part 59.1) ────────────────────────────────────────
 *
 * The Part 59 version ran `expo export --platform all`. "all" includes web, and
 * this project has `web.output: "static"` in app.json, so Expo tried to
 * server-render every route in Node. `app/_layout.tsx` pulls in Stream Chat and
 * the Supabase client, both of which touch `window` at module scope, and Node
 * has no `window`. Result:
 *
 *     Metro error: window is not defined
 *     Bundle export failed. Fix the build before verifying.
 *
 * Note what the log said just before that: iOS Bundled (3393 modules), Android
 * Bundled (3480 modules). The native bundles — the only ones that ship in the
 * APK and IPA, and therefore the only ones this script is supposed to inspect —
 * built perfectly. The scan was being blocked by a web build it never needed.
 *
 * So: export ios and android separately, never web. This is not a workaround
 * that weakens the check; it narrows it to exactly the artifacts that reach a
 * user's phone. (If you ever ship the Expo web build, scan it with a separate
 * `--dir` run against your real web export.)
 *
 * Two other corrections while we were in here:
 *
 *   • `--no-bytecode` is now passed. By default `expo export` compiles native
 *     bundles to Hermes bytecode (.hbc), which is binary. Reading a .hbc file
 *     as UTF-8 and grepping it for "sk-…" is close to useless — string literals
 *     survive, but not reliably, and the utf8 decode mangles them. Exporting
 *     plain JS means the scanner actually sees what it claims to check.
 *
 *   • Minification is ON (this corrects a `--no-minify` in the first 59.1 pass).
 *     Minification is what strips comments, and comments were the only source
 *     of false positives in Phase 2: the Part 59.1 fixes document the exact
 *     variable names and endpoints they removed, right above the code that
 *     removed them, and `--no-minify` preserved all of that prose into the
 *     bundle. Three comments produced three "leaks" that were nothing but
 *     documentation.
 *
 *     Nothing is lost by minifying, because every check here is about string
 *     CONTENT, and minifiers do not touch string contents:
 *       - live .env values      → string literals, preserved
 *       - sk-… / tvly-… shapes  → string literals, preserved
 *       - vendor endpoints      → string literals, preserved
 *     Only identifier and property names get mangled, and nothing below
 *     depends on those.
 *
 *     The one check minification does weaken is FORBIDDEN_ENV_VARS in Phase 2,
 *     and that check was already close to decorative there: Babel inlines
 *     `process.env.EXPO_PUBLIC_FOO` into its literal value at transform time,
 *     so the variable NAME never reaches the bundle even when a file genuinely
 *     reads it. What reaches the bundle is the value — which is exactly what
 *     the .env scan catches. Name detection belongs to Phase 1, at source
 *     level, and that is where it now lives.
 *
 *     Pass --no-minify to opt back into unminified output when you need to read
 *     the bundle by hand. Expect comment-derived findings if you do.
 *
 *   • A SOURCE SCAN now runs before the build. It greps src/ and app/ for
 *     forbidden env var names and direct vendor endpoints, and finishes in
 *     under a second. This is what catches a service that was missed during a
 *     migration, and it catches it without waiting eleven minutes for Metro.
 *     Part 59.1's podcast/debate bug was exactly this class of mistake, and a
 *     source scan would have flagged all five files instantly.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 *
 *   PHASE 1 — Source scan (fast, no build)
 *     Forbidden env var names and direct vendor endpoints anywhere in src/ or
 *     app/. Reports file and line number.
 *
 *   PHASE 2 — Bundle scan (slow, requires an export)
 *     1. Live key material — sk-…, tvly-…, and anything matching the real
 *        values in your local .env. Catches a key inlined by any route,
 *        including ones this script's author never thought of.
 *     2. Forbidden variable names, again — this time proving they didn't reach
 *        the bundle through a transitive import.
 *     3. Direct vendor endpoints in the shipped JavaScript.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/verify-no-secrets.js                  full check (both platforms)
 *   node scripts/verify-no-secrets.js --source-only    source scan only, ~1s
 *   node scripts/verify-no-secrets.js --platform android   one platform, ~half the time
 *   node scripts/verify-no-secrets.js --keep           don't delete the export
 *   node scripts/verify-no-secrets.js --dir dist       scan an existing export
 *
 * Exit code 0 = clean, 1 = something leaked. Wire it into CI before release.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const keepDir  = args.includes('--keep');
const srcOnly  = args.includes('--source-only');
const bundleOnly = args.includes('--bundle-only');

/**
 * Opt back into unminified output for hand-inspection. Off by default — see the
 * header: unminified bundles keep comments, and this repo's comments document
 * the very strings this script hunts for.
 */
const noMinify = args.includes('--no-minify');

const dirIndex = args.indexOf('--dir');
const existing = dirIndex !== -1 ? args[dirIndex + 1] : null;

const platIndex = args.indexOf('--platform');
const platArg   = platIndex !== -1 ? (args[platIndex + 1] ?? '').toLowerCase() : 'both';

const EXPORT_DIR = existing ?? '.part59-verify-export';

/**
 * Native platforms only. `web` is deliberately excluded — see the header. Expo's
 * --platform takes ONE value, so multiple platforms means multiple exports into
 * separate subdirectories, which the scanner then walks together.
 */
function resolvePlatforms() {
  if (platArg === 'ios' || platArg === 'android') return [platArg];
  if (platArg === 'both' || platArg === 'all' || platArg === '') return ['android', 'ios'];
  console.error(red(`Unknown --platform "${platArg}". Use ios, android, or both.`));
  process.exit(1);
}

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

// ─── Source scan config ───────────────────────────────────────────────────────

/** Directories that make up the shipped React Native app. */
const SOURCE_ROOTS = ['src', 'app'];

/** Root-level files worth checking too. */
const SOURCE_FILES = ['app.json', 'app.config.js', 'app.config.ts', 'babel.config.js', 'metro.config.js'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs']);

/**
 * Excluded from the SOURCE scan, with reasons:
 *   scripts/           — this file lists the forbidden names on purpose
 *   supabase/          — Edge Functions legitimately hold keys and call vendors
 *   Admin-Dashboard/   — a separate Next.js app with its own server-side secrets
 *   Public-Reports/    — likewise
 *   checkout/          — static Vercel page, no bundled secrets
 */
const SOURCE_IGNORE = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', 'android', 'ios',
  'scripts', 'supabase', 'Admin-Dashboard', 'admin-dashboard',
  'Public-Reports', 'public-reports', 'checkout', 'coverage',
]);

// ─── Output helpers ───────────────────────────────────────────────────────────

const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
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

// ─── Generic directory walk ───────────────────────────────────────────────────

function walk(dir, extensions, ignore, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignore && ignore.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      walk(full, extensions, ignore, files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

// ─── PHASE 1: source scan ─────────────────────────────────────────────────────

/**
 * Decide which lines of a file are live code.
 *
 * Comments are excluded, and that is not a loophole — a commented-out
 * `process.env.EXPO_PUBLIC_OPENAI_API_KEY` does not execute, and Metro strips
 * comments during bundling so it never reaches a device either. It matters
 * practically: the Part 59.1 fixes document the exact variable names they
 * removed, right above the code that removed them. Flagging that would train
 * everyone to either delete the explanation or ignore the scanner, and both
 * outcomes are worse than the risk this rule creates.
 *
 * Returns an array of { lineNumber, text } for code lines only.
 */
function codeLines(content) {
  const out = [];
  let inBlockComment = false;

  content.split('\n').forEach((line, i) => {
    const trimmed = line.trim();

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (trimmed === '') return;

    out.push({ lineNumber: i + 1, text: line });
  });

  return out;
}

function scanSource() {
  const files = [];

  for (const root of SOURCE_ROOTS) {
    const abs = path.join(process.cwd(), root);
    if (fs.existsSync(abs)) walk(abs, SOURCE_EXTENSIONS, SOURCE_IGNORE, files);
  }
  for (const f of SOURCE_FILES) {
    const abs = path.join(process.cwd(), f);
    if (fs.existsSync(abs)) files.push(abs);
  }

  console.log(dim(`Phase 1 — scanning ${files.length} source file(s) in src/ and app/…`));

  const findings = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Cheap pre-filter so we only split into lines when there is something to find.
    const hasVar = FORBIDDEN_ENV_VARS.some(v => content.includes(v));
    const hasEnd = FORBIDDEN_ENDPOINTS.some(e => content.includes(e));
    if (!hasVar && !hasEnd) continue;

    for (const { lineNumber, text } of codeLines(content)) {
      for (const varName of FORBIDDEN_ENV_VARS) {
        if (text.includes(varName)) {
          findings.push({
            severity: 'error',
            file: `${rel}:${lineNumber}`,
            detail: `Reads ${varName} — this variable no longer exists after Part 59`,
            hint: 'Delete the check, or route the call through apiGateway.ts.',
          });
        }
      }
      for (const endpoint of FORBIDDEN_ENDPOINTS) {
        if (text.includes(endpoint)) {
          findings.push({
            severity: 'error',
            file: `${rel}:${lineNumber}`,
            detail: `Calls ${endpoint} directly from app code`,
            hint: 'Route it through ai-gateway, ai-audio-gateway or search-gateway.',
          });
        }
      }
    }
  }

  return findings;
}

// ─── PHASE 2: build ───────────────────────────────────────────────────────────

function buildBundle(platforms) {
  if (existing) {
    console.log(dim(`Scanning existing export at ${EXPORT_DIR}`));
    return;
  }

  if (fs.existsSync(EXPORT_DIR)) fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  for (const platform of platforms) {
    const outDir = path.join(EXPORT_DIR, platform);

    console.log('');
    console.log(bold(`Exporting ${platform} bundle (this takes a few minutes)…`));

    // --platform <one>  : never "all". "all" includes web, and this project uses
    //                     web.output "static", which server-renders every route
    //                     in Node and dies on `window is not defined`. The web
    //                     bundle is not shipped to phones, so it is not in scope.
    // --no-bytecode     : keep the native bundle as readable JavaScript instead
    //                     of Hermes .hbc, so the scan below can actually read it.
    // (minified)        : minification is LEFT ON deliberately. It strips
    //                     comments — the only false-positive source here — while
    //                     preserving every string literal, which is all this
    //                     scan actually inspects. See the header.
    const cmd = [
      'npx expo export',
      `--platform ${platform}`,
      `--output-dir "${outDir}"`,
      '--no-bytecode',
      noMinify ? '--no-minify' : '',
    ].filter(Boolean).join(' ');

    try {
      execSync(cmd, {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
      });
    } catch {
      console.error('');
      console.error(red(`Bundle export failed for ${platform}.`));
      console.error(dim('If the error mentions "window is not defined", a web'));
      console.error(dim('static render slipped in — this script never asks for'));
      console.error(dim('web, so check for a custom export script or eas.json hook.'));
      console.error(dim('Otherwise, fix the build error and re-run.'));
      process.exit(1);
    }
  }
}

// ─── PHASE 2: scan ────────────────────────────────────────────────────────────

/**
 * Pull the surrounding characters for a match.
 *
 * A minified bundle is effectively one enormous line, so "found in entry-….js"
 * on its own is not an actionable report — you cannot grep your way from that
 * to a source file. Sixty characters either side is usually enough to recognise
 * the call site, or at least to paste into a search.
 */
function excerpt(content, needle, pad = 60) {
  const i = content.indexOf(needle);
  if (i === -1) return null;
  const start = Math.max(0, i - pad);
  const end   = Math.min(content.length, i + needle.length + pad);
  return (start > 0 ? '…' : '')
    + content.slice(start, end).replace(/\s+/g, ' ')
    + (end < content.length ? '…' : '');
}

function scanBundle(envSecrets) {
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error(red(`Export directory ${EXPORT_DIR} does not exist.`));
    process.exit(1);
  }

  const files = walk(EXPORT_DIR, SCAN_EXTENSIONS, null);
  console.log('');
  console.log(dim(`Phase 2 — scanning ${files.length} bundle file(s)…`));

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
    //
    // Weak on a minified bundle by design — Babel inlines process.env.X into its
    // value at transform time, so the name never survives even when a file does
    // read it. Phase 1 owns name detection; this stays as a backstop for a name
    // that reached the bundle as an actual string literal.
    for (const varName of FORBIDDEN_ENV_VARS) {
      if (content.includes(varName)) {
        findings.push({
          severity: 'error',
          file: rel,
          detail: `References ${varName} — a service still reads this variable`,
          context: excerpt(content, varName),
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
          context: excerpt(content, endpoint),
        });
      }
    }
  }

  return findings;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function report(findings) {
  // Deduplicate — the same finding often appears in a bundle and its sourcemap.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.file}|${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log('');
  console.log(red(`FAIL — ${unique.length} issue(s) found:`));
  console.log('');

  for (const f of unique) {
    const tag = f.severity === 'critical' ? red('[LEAK] ') : yellow('[WARN] ');
    console.log(`${tag}${f.detail}`);
    console.log(dim(`        in ${f.file}`));
    if (f.context) console.log(dim(`        ${f.context}`));
    if (f.hint)    console.log(dim(`        → ${f.hint}`));
    console.log('');
  }

  if (noMinify) {
    console.log(yellow('Note: --no-minify keeps comments in the bundle. If the excerpts'));
    console.log(yellow('above look like prose rather than code, that is what you are'));
    console.log(yellow('seeing — re-run without the flag to confirm.'));
    console.log('');
  }

  console.log('Fix each one, then re-run this script.');
  console.log('');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log(bold('Part 59.1 — secret scan'));
  console.log('');

  // ── PHASE 1 ────────────────────────────────────────────────────────────────

  let sourceFindings = [];
  if (!bundleOnly) {
    sourceFindings = scanSource();

    if (sourceFindings.length > 0) {
      console.log(red(`Phase 1 found ${sourceFindings.length} issue(s) in source.`));
      console.log(dim('Skipping the bundle export — fix these first, since the'));
      console.log(dim('bundle would fail on the same findings after ten minutes.'));
      report(sourceFindings);
      process.exit(1);
    }

    console.log(green('Phase 1 passed — no forbidden variables or direct vendor calls in source.'));
  }

  if (srcOnly) {
    console.log('');
    console.log(dim('--source-only: skipping the bundle export.'));
    console.log(dim('Run without the flag before a release.'));
    console.log('');
    process.exit(0);
  }

  // ── PHASE 2 ────────────────────────────────────────────────────────────────

  const envSecrets = loadEnvSecrets();
  console.log('');
  if (envSecrets.length > 0) {
    console.log(
      yellow(`Found ${envSecrets.length} secret-looking value(s) in .env to search for:`),
    );
    for (const s of envSecrets) console.log(dim(`  · ${s.name}`));
  } else {
    console.log(dim('No secret-looking values in .env — scanning patterns only.'));
  }

  const platforms = existing ? [] : resolvePlatforms();
  if (platforms.length > 0) {
    console.log(dim(`Platforms: ${platforms.join(', ')} (web is excluded by design)`));
  }

  buildBundle(platforms);
  const bundleFindings = scanBundle(envSecrets);

  if (!existing && !keepDir) {
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
  }

  if (bundleFindings.length === 0) {
    console.log('');
    console.log(green('PASS — no API keys, forbidden variables or direct vendor calls found.'));
    console.log('');
    console.log(dim('Reminder: this checks the native JS bundles. Native config files'));
    console.log(dim('(google-services.json, Info.plist) are not covered here, and'));
    console.log(dim('neither is the Expo web build, which this app does not ship.'));
    console.log('');
    process.exit(0);
  }

  report(bundleFindings);
  process.exit(1);
}

main();