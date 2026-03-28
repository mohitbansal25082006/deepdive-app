-- ============================================================
-- DeepDive AI — schema_part35.sql
-- Part 35: Global Search Hub + Semantic Search + Collections
-- ============================================================
-- Safe to run on existing database. Uses IF NOT EXISTS / OR REPLACE.
-- All new tables get full RLS policies.
-- Patch applied inline: ambiguous "report_id" column reference in
-- search_reports_semantic resolved with explicit column aliases.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COLLECTIONS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT,
  color       TEXT        NOT NULL DEFAULT '#6C63FF',
  icon        TEXT        NOT NULL DEFAULT 'folder',
  item_count  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections (user_id);
CREATE INDEX IF NOT EXISTS idx_collections_created ON collections (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. COLLECTION ITEMS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  UUID        NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type   TEXT        NOT NULL CHECK (content_type IN ('report', 'podcast', 'debate')),
  content_id     UUID        NOT NULL,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items (collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_user       ON collection_items (user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_content    ON collection_items (user_id, content_type, content_id);

-- ────────────────────────────────────────────────────────────
-- 3. SEARCH HISTORY TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query         TEXT        NOT NULL CHECK (char_length(query) BETWEEN 1 AND 500),
  content_type  TEXT,
  results_count INTEGER     NOT NULL DEFAULT 0,
  searched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history (user_id, searched_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. TRIGGER: keep collections.item_count in sync
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_collection_item_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE collections
       SET item_count = item_count + 1,
           updated_at = NOW()
     WHERE id = NEW.collection_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE collections
       SET item_count = GREATEST(0, item_count - 1),
           updated_at = NOW()
     WHERE id = OLD.collection_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_item_count ON collection_items;
CREATE TRIGGER trg_collection_item_count
  AFTER INSERT OR DELETE ON collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_item_count();

-- ────────────────────────────────────────────────────────────
-- 5. RLS: COLLECTIONS
-- ────────────────────────────────────────────────────────────

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_select_own" ON collections;
CREATE POLICY "collections_select_own" ON collections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "collections_insert_own" ON collections;
CREATE POLICY "collections_insert_own" ON collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "collections_update_own" ON collections;
CREATE POLICY "collections_update_own" ON collections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "collections_delete_own" ON collections;
CREATE POLICY "collections_delete_own" ON collections
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 6. RLS: COLLECTION ITEMS
-- ────────────────────────────────────────────────────────────

ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_items_select_own" ON collection_items;
CREATE POLICY "collection_items_select_own" ON collection_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_items_insert_own" ON collection_items;
CREATE POLICY "collection_items_insert_own" ON collection_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_items_delete_own" ON collection_items;
CREATE POLICY "collection_items_delete_own" ON collection_items
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 7. RLS: SEARCH HISTORY
-- ────────────────────────────────────────────────────────────

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_history_select_own" ON search_history;
CREATE POLICY "search_history_select_own" ON search_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_history_insert_own" ON search_history;
CREATE POLICY "search_history_insert_own" ON search_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_history_delete_own" ON search_history;
CREATE POLICY "search_history_delete_own" ON search_history
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 8. RPC: search_reports_semantic
--    Cross-report semantic search via pgvector.
--    Returns one row per matching report (best chunk similarity).
--
--    PATCH (inline): All CTE columns are explicitly aliased with
--    rc_ / bpr_ prefixes to eliminate the "ambiguous column
--    reference" error PostgreSQL raises when the RETURNS TABLE
--    column name (report_id) collides with a CTE column name.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_reports_semantic(
  query_embedding  vector(1536),
  p_user_id        UUID,
  match_count      INT     DEFAULT 10,
  match_threshold  FLOAT   DEFAULT 0.30
)
RETURNS TABLE (
  report_id         UUID,
  title             TEXT,
  query             TEXT,
  depth             TEXT,
  executive_summary TEXT,
  created_at        TIMESTAMPTZ,
  best_similarity   FLOAT,
  best_chunk_type   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked_chunks AS (
    SELECT
      e.report_id                                   AS rc_report_id,
      e.chunk_type                                  AS rc_chunk_type,
      1 - (e.embedding <=> query_embedding)         AS rc_similarity,
      ROW_NUMBER() OVER (
        PARTITION BY e.report_id
        ORDER BY (e.embedding <=> query_embedding) ASC
      )                                             AS rn
    FROM report_embeddings e
    WHERE e.user_id = p_user_id
      AND 1 - (e.embedding <=> query_embedding) >= match_threshold
  ),
  best_per_report AS (
    SELECT
      rc.rc_report_id   AS bpr_report_id,
      rc.rc_chunk_type  AS bpr_chunk_type,
      rc.rc_similarity  AS bpr_similarity
    FROM ranked_chunks rc
    WHERE rc.rn = 1
  )
  SELECT
    rr.id                 AS report_id,
    rr.title,
    rr.query,
    rr.depth,
    rr.executive_summary,
    rr.created_at,
    bpr.bpr_similarity    AS best_similarity,
    bpr.bpr_chunk_type    AS best_chunk_type
  FROM best_per_report bpr
  JOIN research_reports rr ON rr.id = bpr.bpr_report_id
  WHERE rr.user_id = p_user_id
    AND rr.status  = 'completed'
  ORDER BY bpr.bpr_similarity DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 9. RPC: get_user_collections
--    Returns collections belonging to the requesting user.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_collections(p_user_id UUID)
RETURNS TABLE (
  id          UUID,
  name        TEXT,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  item_count  INTEGER,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    c.id, c.name, c.description, c.color, c.icon,
    c.item_count, c.created_at, c.updated_at
  FROM collections c
  WHERE c.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 10. RPC: get_collection_items_detailed
--     Returns items in a collection with their content titles.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_collection_items_detailed(
  p_collection_id UUID,
  p_user_id       UUID
)
RETURNS TABLE (
  item_id      UUID,
  content_type TEXT,
  content_id   UUID,
  title        TEXT,
  subtitle     TEXT,
  depth        TEXT,
  status       TEXT,
  created_at   TIMESTAMPTZ,
  added_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RETURN; END IF;

  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM collections c
    WHERE c.id = p_collection_id AND c.user_id = p_user_id
  ) THEN RETURN; END IF;

  RETURN QUERY
  -- Reports
  SELECT
    ci.id                                                     AS item_id,
    ci.content_type,
    ci.content_id,
    COALESCE(r.title, r.query, 'Untitled Report')             AS title,
    COALESCE(LEFT(r.executive_summary, 120), '')              AS subtitle,
    r.depth,
    r.status,
    r.created_at,
    ci.added_at
  FROM collection_items ci
  JOIN research_reports r ON r.id = ci.content_id
  WHERE ci.collection_id = p_collection_id
    AND ci.user_id        = p_user_id
    AND ci.content_type   = 'report'

  UNION ALL

  -- Podcasts
  SELECT
    ci.id,
    ci.content_type,
    ci.content_id,
    COALESCE(p.title, p.topic, 'Untitled Podcast')            AS title,
    COALESCE(p.description, '')                               AS subtitle,
    NULL::TEXT                                                AS depth,
    p.status::TEXT,
    p.created_at,
    ci.added_at
  FROM collection_items ci
  JOIN podcasts p ON p.id = ci.content_id
  WHERE ci.collection_id = p_collection_id
    AND ci.user_id        = p_user_id
    AND ci.content_type   = 'podcast'

  UNION ALL

  -- Debates
  SELECT
    ci.id,
    ci.content_type,
    ci.content_id,
    ds.topic                                                  AS title,
    COALESCE(ds.question, '')                                 AS subtitle,
    NULL::TEXT                                                AS depth,
    ds.status::TEXT,
    ds.created_at,
    ci.added_at
  FROM collection_items ci
  JOIN debate_sessions ds ON ds.id = ci.content_id
  WHERE ci.collection_id = p_collection_id
    AND ci.user_id        = p_user_id
    AND ci.content_type   = 'debate'

  ORDER BY added_at DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 11. RPC: get_item_collection_ids
--     Returns IDs of collections that contain a given item.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_item_collection_ids(
  p_user_id      UUID,
  p_content_type TEXT,
  p_content_id   UUID
)
RETURNS TABLE (collection_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RETURN; END IF;
  RETURN QUERY
  SELECT ci.collection_id
  FROM collection_items ci
  WHERE ci.user_id      = p_user_id
    AND ci.content_type = p_content_type
    AND ci.content_id   = p_content_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 12. RPC: log_search_history (fire-and-forget helper)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_search_history(
  p_user_id       UUID,
  p_query         TEXT,
  p_content_type  TEXT DEFAULT NULL,
  p_results_count INT  DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RETURN; END IF;

  -- Keep only last 50 per user (trim old ones)
  DELETE FROM search_history
  WHERE user_id = p_user_id
    AND id NOT IN (
      SELECT id FROM search_history
      WHERE user_id = p_user_id
      ORDER BY searched_at DESC
      LIMIT 49
    );

  INSERT INTO search_history (user_id, query, content_type, results_count)
  VALUES (p_user_id, TRIM(p_query), p_content_type, p_results_count)
  ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Never fail — search history is non-critical
  NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 13. RPC: get_search_suggestions
--     Returns recent + popular queries for autocomplete.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_user_id UUID,
  p_prefix  TEXT DEFAULT '',
  p_limit   INT  DEFAULT 8
)
RETURNS TABLE (
  query        TEXT,
  last_used_at TIMESTAMPTZ,
  use_count    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    sh.query,
    MAX(sh.searched_at) AS last_used_at,
    COUNT(*)            AS use_count
  FROM search_history sh
  WHERE sh.user_id = p_user_id
    AND (p_prefix = '' OR sh.query ILIKE p_prefix || '%')
  GROUP BY sh.query
  ORDER BY MAX(sh.searched_at) DESC
  LIMIT p_limit;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Done.
-- ────────────────────────────────────────────────────────────