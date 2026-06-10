// supabase/functions/stream-chat-token/index.ts
// Part 49 — Stream Chat Token Generator
// Part 50 FIX — ReadChannel error (code 17) for non-creator workspace members:
//   Server-side addMembers() to all workspace channels before token return.
// Part 50.3 — Upsert the "deepdive-bot" user in Stream so it always exists
//   and can post messages as a bot in any channel.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { StreamChat }   from 'npm:stream-chat@8';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Channel ID helper (must match client-side getWorkspaceChannelId) ─────────

function getWorkspaceChannelId(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 55);
  return `workspace-${safe}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Verify Supabase JWT ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Fetch user profile for Stream user data ─────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    // ── 3. Build Stream server client ──────────────────────────────────────
    const apiKey    = Deno.env.get('STREAM_API_KEY')!;
    const apiSecret = Deno.env.get('STREAM_API_SECRET')!;

    // Server-side Stream client (uses API secret — never expose to client)
    const serverClient = StreamChat.getInstance(apiKey, apiSecret);

    const streamUserId = user.id; // Use Supabase UUID as Stream user ID

    const displayName =
      profile?.full_name   ||
      profile?.username    ||
      user.email?.split('@')[0] ||
      'User';

    // ── 4. Upsert user in Stream ────────────────────────────────────────────
    await serverClient.upsertUser({
      id:         streamUserId,
      name:       displayName,
      image:      profile?.avatar_url ?? undefined,
      supabaseId: user.id,
    });

    // ── 5. Part 50.3: Upsert the @DeepDive bot user ────────────────────────
    // This ensures the bot user always exists in Stream so it can send messages.
    // We upsert on every token call (idempotent). The bot never connects as a
    // real user — it only sends server-side messages via the secret client.
    try {
      await serverClient.upsertUser({
        id:   'deepdive-bot',
        name: 'DeepDive AI',
        image: 'https://img.icons8.com/fluency/96/artificial-intelligence.png',
        role: 'user',
        // Custom field to mark this as a bot (renders differently in future UI)
        is_bot: true,
      } as any);
    } catch (botUpsertErr) {
      // Non-fatal — token generation continues
      console.warn('[stream-chat-token] bot upsert error (non-fatal):', botUpsertErr);
    }

    // ── 6. Add user as member to all their workspace channels ──────────────
    // Fetch all workspaces this user belongs to from Supabase.
    // Then call serverClient.channel(...).addMembers([userId]) for each one.
    // The server client bypasses Stream permissions entirely.
    // Stream's addMembers is idempotent — safe to call multiple times.
    try {
      const { data: memberRows } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'editor']); // only owners and editors use chat

      if (memberRows && memberRows.length > 0) {
        const addMemberPromises = memberRows.map(async (row: { workspace_id: string }) => {
          try {
            const channelId = getWorkspaceChannelId(row.workspace_id);
            const ch = serverClient.channel('messaging', channelId, {
              name:        `Workspace ${row.workspace_id}`,
              workspaceId: row.workspace_id,
              created_by_id: streamUserId,
            });
            await ch.addMembers([{ user_id: streamUserId }]);
          } catch (chErr) {
            // Non-fatal: channel may not exist yet.
            console.warn(`[stream-chat-token] addMembers skip for workspace ${row.workspace_id}:`, chErr);
          }
        });

        await Promise.allSettled(addMemberPromises);
      }
    } catch (memberErr) {
      // Non-fatal — token generation continues even if pre-seeding fails
      console.warn('[stream-chat-token] membership pre-seed error (non-fatal):', memberErr);
    }

    // ── 7. Generate short-lived token (24h expiry) ──────────────────────────
    const issuedAt  = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 60 * 60 * 24; // 24 hours
    const token     = serverClient.createToken(streamUserId, expiresAt, issuedAt);

    return new Response(
      JSON.stringify({ token, userId: streamUserId, name: displayName }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[stream-chat-token] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});