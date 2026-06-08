// supabase/functions/stream-chat-token/index.ts
// Part 49 — Stream Chat Token Generator
// Part 50 FIX — ReadChannel error (code 17) for non-creator workspace members:
//
// ROOT CAUSE:
//   Stream's `messaging` channel type uses the default permission policy:
//     "Channel Members" → allows [ReadChannel, CreateMessage] for `channel_member` role
//     "Discard all"     → denies everything else for `user` role
//
//   When the FIRST user (owner) calls getOrCreateWorkspaceChannel on the client:
//     1. channel.watch() creates the channel
//     2. channel.addMembers([userId]) adds them as a `channel_member`
//   This works because creating the channel automatically makes them a member.
//
//   When a SECOND user (another editor/owner) calls channel.watch() client-side:
//     They are NOT yet a member (only the creator is). They have role `user`,
//     which has no ReadChannel permission → error code 17.
//
// FIX:
//   Add the user as a channel member SERVER-SIDE (using the Stream server client
//   which bypasses all permission checks) INSIDE this Edge Function, BEFORE
//   returning the token. By the time the client calls channel.watch(), the user
//   is already a `channel_member` and ReadChannel is granted.
//
//   We add the user to ALL workspace channels they are a member of in Supabase,
//   so they can watch any of their workspace chats immediately.
//
// Deploy:
//   supabase functions deploy stream-chat-token --no-verify-jwt
//
// Secrets required (unchanged):
//   supabase secrets set STREAM_API_KEY=your_stream_api_key
//   supabase secrets set STREAM_API_SECRET=your_stream_api_secret

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

    // ── 5. FIX: Add this user as a member to all their workspace channels ──
    //
    // Fetch all workspaces this user belongs to from Supabase.
    // Then call serverClient.channel(...).addMembers([userId]) for each one.
    // The server client bypasses Stream permissions entirely, so this always
    // succeeds regardless of whether the channel exists yet or not.
    //
    // Stream's addMembers is idempotent — calling it multiple times for the
    // same user in the same channel is safe and has no side effects.
    //
    // We use Promise.allSettled so a single failing channel doesn't block the
    // token from being returned. Non-existent channels will be created when
    // the first user opens the chat; for now we just ensure the membership
    // is pre-seeded for channels that DO exist.

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
            // channel() without watch() — server-side, no connection needed
            const ch = serverClient.channel('messaging', channelId, {
              name:        `Workspace ${row.workspace_id}`,
              workspaceId: row.workspace_id,
              created_by_id: streamUserId, // required when creating via server
            });
            // addMembers is the key fix: makes user a `channel_member` so
            // ReadChannel permission is granted when they watch() client-side.
            await ch.addMembers([{ user_id: streamUserId }]);
          } catch (chErr) {
            // Non-fatal: channel may not exist yet (first user hasn't opened it).
            // The first user to open a chat creates the channel + adds themselves.
            // This pre-seeding is best-effort.
            console.warn(`[stream-chat-token] addMembers skip for workspace ${row.workspace_id}:`, chErr);
          }
        });

        await Promise.allSettled(addMemberPromises);
      }
    } catch (memberErr) {
      // Non-fatal — token generation continues even if pre-seeding fails
      console.warn('[stream-chat-token] membership pre-seed error (non-fatal):', memberErr);
    }

    // ── 6. Generate short-lived token (24h expiry) ──────────────────────────
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