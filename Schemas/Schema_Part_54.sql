-- ═══════════════════════════════════════════════════════════════════════════
-- DeepDive AI — Part 54 Schema Migration (Part 54B · Feature 8)
-- "Mutual-with-me" gated follower / following lists.
--
-- WHAT THIS ADDS
--   When viewing ANOTHER user's profile, the Followers / Following lists must
--   only reveal people who ALSO follow the CURRENT (calling) user — i.e. the
--   intersection of {target's followers OR following} with {my followers}.
--
--     • get_mutual_user_followers(p_user_id, p_limit, p_offset)
--     • get_mutual_user_following(p_user_id, p_limit, p_offset)
--     • get_mutual_followers_count(p_user_id, p_mode)   -- 'followers'|'following'
--
-- These run as SECURITY DEFINER so the filtering happens server-side: rows the
-- caller isn't allowed to see never leave the database (no client-side leak),
-- and pagination stays correct because the intersection is applied BEFORE
-- LIMIT / OFFSET.
--
-- RETURN SHAPE (list RPCs)
--   Identical JSONB array shape to get_user_followers / get_user_following so
--   the existing FollowListItem type + PersonRow UI work unchanged:
--     { id, username, full_name, avatar_url, bio, joined_at, is_following }
--
-- SEMANTICS (chosen)
--   For target T and viewer V:
--     followers list → people X where  X follows T  AND  X follows V
--     following list → people X where  T follows X  AND  X follows V
--   "X follows V"  ===  EXISTS(user_follows WHERE follower_id = X.id
--                                            AND  following_id = V).
--
--   When V views their OWN profile (p_user_id = auth.uid()), NO gating is
--   applied — they see the full list. (The app keeps calling the ungated RPCs
--   for the own-profile case; this is also enforced here defensively.)
--
-- SAFETY
--   SECURITY DEFINER + SET search_path = public. Functions early-return '[]' /
--   0 when unauthenticated. Granted to authenticated only.
--
-- Run this ONCE in the Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE).
-- Depends on the Social & Discovery schema (user_follows, profiles,
-- get_user_followers / get_user_following).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- get_mutual_user_followers
--   Followers of p_user_id, filtered to only those who also follow the viewer.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_mutual_user_followers(
  p_user_id UUID,
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Own profile → no gating (full list). Defensive: callers should use the
  -- ungated RPC for self, but we mirror that behaviour here.
  IF v_uid = p_user_id THEN
    RETURN get_user_followers(p_user_id, p_limit, p_offset);
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'joined_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',           p.id,
          'username',     p.username,
          'full_name',    p.full_name,
          'avatar_url',   p.avatar_url,
          'bio',          p.bio,
          'joined_at',    uf.created_at,
          'is_following', EXISTS(
            SELECT 1 FROM user_follows
            WHERE follower_id = v_uid AND following_id = p.id
          )
        ) AS row_data
        FROM user_follows uf
        JOIN profiles p ON uf.follower_id = p.id
        WHERE uf.following_id = p_user_id
          -- GATE: p (a follower of the target) must also follow the viewer.
          AND EXISTS(
            SELECT 1 FROM user_follows g
            WHERE g.follower_id = p.id AND g.following_id = v_uid
          )
          -- Never include the viewer themselves in the gated list.
          AND p.id <> v_uid
        ORDER BY uf.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_mutual_user_followers(UUID, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_mutual_user_following
--   Accounts p_user_id follows, filtered to only those who also follow viewer.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_mutual_user_following(
  p_user_id UUID,
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Own profile → no gating (full list).
  IF v_uid = p_user_id THEN
    RETURN get_user_following(p_user_id, p_limit, p_offset);
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'joined_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id',           p.id,
          'username',     p.username,
          'full_name',    p.full_name,
          'avatar_url',   p.avatar_url,
          'bio',          p.bio,
          'joined_at',    uf.created_at,
          'is_following', EXISTS(
            SELECT 1 FROM user_follows
            WHERE follower_id = v_uid AND following_id = p.id
          )
        ) AS row_data
        FROM user_follows uf
        JOIN profiles p ON uf.following_id = p.id
        WHERE uf.follower_id = p_user_id
          -- GATE: p (someone the target follows) must also follow the viewer.
          AND EXISTS(
            SELECT 1 FROM user_follows g
            WHERE g.follower_id = p.id AND g.following_id = v_uid
          )
          AND p.id <> v_uid
        ORDER BY uf.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::JSONB
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_mutual_user_following(UUID, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_mutual_followers_count
--   Count of the gated list (used for header subtitles / empty-state copy).
--   p_mode: 'followers' → gated followers of target
--           'following' → gated following of target
--   Returns 0 for own profile too (the app uses the real counts there).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_mutual_followers_count(
  p_user_id UUID,
  p_mode    TEXT DEFAULT 'followers'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID    := auth.uid();
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL OR v_uid = p_user_id THEN
    RETURN 0;
  END IF;

  IF p_mode = 'following' THEN
    SELECT COUNT(*) INTO v_count
    FROM user_follows uf
    JOIN profiles p ON uf.following_id = p.id
    WHERE uf.follower_id = p_user_id
      AND p.id <> v_uid
      AND EXISTS(
        SELECT 1 FROM user_follows g
        WHERE g.follower_id = p.id AND g.following_id = v_uid
      );
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM user_follows uf
    JOIN profiles p ON uf.follower_id = p.id
    WHERE uf.following_id = p_user_id
      AND p.id <> v_uid
      AND EXISTS(
        SELECT 1 FROM user_follows g
        WHERE g.follower_id = p.id AND g.following_id = v_uid
      );
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_mutual_followers_count(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. No new tables / columns — reuses user_follows + profiles.
-- These are plain RPCs callable via supabase.rpc(...).
-- ─────────────────────────────────────────────────────────────────────────────