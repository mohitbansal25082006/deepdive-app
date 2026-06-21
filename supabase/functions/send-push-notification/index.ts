// supabase/functions/send-push-notification/index.ts
// DeepDive AI — Part 53D: Remote push so notifications arrive when the app is
// CLOSED or BACKGROUNDED.
//
// WHY THIS IS NEEDED
//   Local notifications (scheduleNotificationAsync) only fire while the JS app
//   process is alive. When the app is fully closed, the OS has killed that
//   process, so nothing local can fire. The ONLY way to alert a closed app is a
//   remote push delivered by the platform (APNs/FCM), which Expo's push service
//   wraps behind a single HTTPS endpoint.
//
// HOW IT WORKS
//   This Edge Function is invoked by a Supabase Database Webhook on INSERT into
//   either `app_notifications` or `follow_notifications`. It:
//     1. Reads the inserted row from the webhook payload.
//     2. Resolves the recipient user id (user_id or recipient_id).
//     3. Looks up that user's Expo push tokens from `push_tokens`.
//     4. Builds a notification (title/body/deep-link data) for the row type.
//     5. POSTs to https://exp.host/--/api/v2/push/send (Expo push API).
//
//   The `data` payload carries { route, params } so tapping the push opens the
//   exact content — handled by registerNotificationTapHandler /
//   getLastNotificationResponseAsync in the app.
//
// DEPLOY
//   supabase functions deploy send-push-notification --no-verify-jwt
//
//   Then create TWO Database Webhooks (Dashboard → Database → Webhooks):
//     • Table: app_notifications,    Events: INSERT → HTTP POST to this function
//     • Table: follow_notifications, Events: INSERT → HTTP POST to this function
//   Add header  Authorization: Bearer <YOUR_FUNCTION_SECRET>  on both, and set
//   the same value as the EDGE_SHARED_SECRET function secret (optional but
//   recommended):
//     supabase secrets set EDGE_SHARED_SECRET=<random-string>
//
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the Edge
//   runtime — do NOT set them (names starting with SUPABASE_ are reserved and
//   `supabase secrets set` will reject them). The only optional secret is the
//   shared auth secret below:
//     supabase secrets set EDGE_SHARED_SECRET=<random-string>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE';
  table:  string;
  record: Record<string, unknown> | null;
  schema: string;
  old_record: Record<string, unknown> | null;
}

// ─── Build notification content per row type ──────────────────────────────────

function buildNotification(table: string, row: Record<string, unknown>): {
  recipientId: string | null;
  title:       string;
  body:        string;
  data:        Record<string, unknown>;
} | null {
  // app_notifications (own content events) already carry everything we need.
  if (table === 'app_notifications') {
    const recipientId = (row.user_id as string) ?? null;
    const route       = (row.route as string) ?? '';
    const params      = (row.params as Record<string, unknown>) ?? {};
    return {
      recipientId,
      title: (row.title as string) ?? 'DeepDive AI',
      body:  (row.body  as string) ?? '',
      data:  {
        type:      (row.type as string) ?? 'open',
        route,
        params,
        contentId: row.content_id ?? null,
        reportId:  row.report_id ?? null,
      },
    };
  }

  // follow_notifications (social events). The cache columns (Part 53C) give us
  // actor name + report title without an extra query.
  if (table === 'follow_notifications') {
    const recipientId = (row.recipient_id as string) ?? null;
    const type        = (row.type as string) ?? '';
    const actorName =
      (row.actor_full_name as string) ??
      (row.actor_username  as string) ??
      'Someone';
    const actorUsername = (row.actor_username as string) ?? '';

    if (type === 'new_follower') {
      return {
        recipientId,
        title: 'New follower',
        body:  `${actorName} started following you`,
        data:  {
          type:  'new_follower',
          route: '/(app)/user-profile',
          params: actorUsername ? { username: actorUsername } : {},
        },
      };
    }
    if (type === 'new_unfollower') {
      return {
        recipientId,
        title: 'Unfollowed',
        body:  `${actorName} unfollowed you`,
        data:  {
          type:  'new_unfollower',
          route: '/(app)/user-profile',
          params: actorUsername ? { username: actorUsername } : {},
        },
      };
    }
    if (type === 'new_report') {
      const reportId    = (row.report_id as string) ?? '';
      const reportTitle = (row.report_title as string) ?? 'a new report';
      return {
        recipientId,
        title: `${actorName} published a report`,
        body:  reportTitle,
        data:  {
          type:  'new_report',
          route: '/(app)/feed-report-view',
          params: reportId ? { reportId } : {},
        },
      };
    }
  }

  return null;
}

// ─── Chunk helper (Expo accepts up to 100 messages per request) ──────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req: Request) => {
  try {
    // Optional shared-secret check.
    const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET');
    if (sharedSecret) {
      const auth = req.headers.get('Authorization') ?? '';
      if (auth !== `Bearer ${sharedSecret}`) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = (await req.json()) as WebhookPayload;
    if (payload.type !== 'INSERT' || !payload.record) {
      return new Response(JSON.stringify({ skipped: 'not an insert' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const built = buildNotification(payload.table, payload.record);
    if (!built || !built.recipientId) {
      return new Response(JSON.stringify({ skipped: 'no recipient/notification' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Service-role client to read push_tokens (bypasses RLS).
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are AUTO-INJECTED by the
    // Supabase Edge runtime — you do NOT set these yourself (names starting
    // with SUPABASE_ are reserved). No `supabase secrets set` needed for them.
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokenRows, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', built.recipientId);

    if (error) {
      console.error('push_tokens query error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const tokens = (tokenRows ?? [])
      .map((r: { token: string }) => r.token)
      .filter((t: string) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no tokens' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build Expo push messages.
    const messages = tokens.map((to: string) => ({
      to,
      sound:    'default',
      title:    built.title,
      body:     built.body,
      data:     built.data,
      priority: 'high',
      channelId: payload.table === 'app_notifications' ? 'content' : 'social_updates',
    }));

    // Send in chunks of 100.
    const results: unknown[] = [];
    for (const group of chunk(messages, 100)) {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'Accept':          'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(group),
      });
      results.push(await res.json());
    }

    return new Response(JSON.stringify({ sent: messages.length, results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-push-notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});