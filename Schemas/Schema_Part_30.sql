-- =================================================================================
-- FULL SCHEMA UPDATE - Parts 30 & 31 Combined
-- =================================================================================
-- Part 30 — Joystick positioning, template history, online image/icon
-- Part 31 — Export Fixes, Workspace Sharing Edit Fix, AI Credit Deduction Fix
-- Safe to run on any DB that already has Parts 1–29 applied.
-- All changes are additive / idempotent with IF NOT EXISTS / OR REPLACE.
-- =================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- PART 30: TEMPLATE HISTORY & ONLINE IMAGE CACHE
-- ─────────────────────────────────────────────────────────────────────────────────

-- ─── 1. Template History table ────────────────────────────────────────────────
-- Stores a full snapshot of the presentation BEFORE each template was applied.
-- Users can browse history and restore to any previous state from the editor.

CREATE TABLE IF NOT EXISTS template_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id       UUID        NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,

  -- Full snapshot of slides array before the template was applied
  slides_snapshot       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Full snapshot of editor_data array before the template was applied
  editor_data_snapshot  JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Font family at time of snapshot
  font_family           TEXT        NOT NULL DEFAULT 'system',

  -- Which template was applied (so we can show "Before applying Startup Pitch")
  template_id           TEXT        DEFAULT NULL,
  template_name         TEXT        DEFAULT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast per-presentation history lookup
CREATE INDEX IF NOT EXISTS idx_template_history_presentation_id
  ON template_history(presentation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_history_user_id
  ON template_history(user_id);

-- ─── RLS for template_history ─────────────────────────────────────────────────

ALTER TABLE template_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own template history" ON template_history;
CREATE POLICY "Users can insert own template history"
  ON template_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own template history" ON template_history;
CREATE POLICY "Users can view own template history"
  ON template_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own template history" ON template_history;
CREATE POLICY "Users can delete own template history"
  ON template_history FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 2. Presentations: add online image cache column ─────────────────────────
-- Stores resolved online image URLs so PPTX/PDF export can embed them.

ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS online_images_cache JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN presentations.online_images_cache IS
  'Part 30: array of {blockId, url, thumbnailUrl} for online images added to slides. '
  'Cached so PPTX/PDF export can embed images without re-fetching.';

-- ─── 3. RPC: save template history snapshot ───────────────────────────────────

CREATE OR REPLACE FUNCTION save_template_history(
  p_presentation_id     UUID,
  p_user_id             UUID,
  p_slides_snapshot     JSONB,
  p_editor_data_snapshot JSONB,
  p_font_family         TEXT,
  p_template_id         TEXT  DEFAULT NULL,
  p_template_name       TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_entry_count INTEGER;
BEGIN
  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM presentations
    WHERE id = p_presentation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  -- Insert snapshot
  INSERT INTO template_history (
    presentation_id,
    user_id,
    slides_snapshot,
    editor_data_snapshot,
    font_family,
    template_id,
    template_name
  )
  VALUES (
    p_presentation_id,
    p_user_id,
    p_slides_snapshot,
    p_editor_data_snapshot,
    p_font_family,
    p_template_id,
    p_template_name
  )
  RETURNING id INTO v_new_id;

  -- Keep only the last 20 history entries per presentation to avoid bloat
  SELECT COUNT(*) INTO v_entry_count
  FROM template_history
  WHERE presentation_id = p_presentation_id AND user_id = p_user_id;

  IF v_entry_count > 20 THEN
    DELETE FROM template_history
    WHERE id IN (
      SELECT id FROM template_history
      WHERE presentation_id = p_presentation_id AND user_id = p_user_id
      ORDER BY created_at ASC
      LIMIT (v_entry_count - 20)
    );
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_template_history(UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── 4. RPC: get template history for a presentation ─────────────────────────

CREATE OR REPLACE FUNCTION get_template_history(
  p_presentation_id UUID,
  p_user_id         UUID,
  p_limit           INT DEFAULT 20
)
RETURNS TABLE (
  id                    UUID,
  template_id           TEXT,
  template_name         TEXT,
  slide_count           INTEGER,
  font_family           TEXT,
  slides_snapshot       JSONB,
  editor_data_snapshot  JSONB,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      th.id,
      th.template_id,
      th.template_name,
      jsonb_array_length(th.slides_snapshot)::INTEGER AS slide_count,
      th.font_family,
      th.slides_snapshot,
      th.editor_data_snapshot,
      th.created_at
    FROM template_history th
    WHERE th.presentation_id = p_presentation_id
      AND th.user_id = p_user_id
    ORDER BY th.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_template_history(UUID, UUID, INT)
  TO authenticated;

-- ─── 5. RPC: delete a specific history entry ─────────────────────────────────

CREATE OR REPLACE FUNCTION delete_template_history_entry(
  p_entry_id UUID,
  p_user_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM template_history
  WHERE id = p_entry_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_template_history_entry(UUID, UUID)
  TO authenticated;

-- ─── 6. RPC: clear all history for a presentation ────────────────────────────

CREATE OR REPLACE FUNCTION clear_template_history(
  p_presentation_id UUID,
  p_user_id         UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM presentations
    WHERE id = p_presentation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Presentation not found or access denied';
  END IF;

  DELETE FROM template_history
  WHERE presentation_id = p_presentation_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_template_history(UUID, UUID)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────
-- PART 31: EXPORT FIXES, WORKSPACE SHARING, AI CREDIT DEDUCTION
-- ─────────────────────────────────────────────────────────────────────────────────

-- ─── 1. Index: faster transaction history filtered by AI feature ─────────────────
-- Lets the credits history screen quickly filter "AI Slide Rewrite" transactions.

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_feature
  ON credit_transactions(user_id, feature, created_at DESC);

COMMENT ON INDEX idx_credit_transactions_user_feature IS
  'Part 31: speeds up transaction history grouped or filtered by editor AI feature.';

-- ─── 2. Index: faster presentation lookup by editor_data presence ───────────────
-- Helps workspace-shared-viewer.tsx fetch presentations with editor overlays.

CREATE INDEX IF NOT EXISTS idx_presentations_report_user
  ON presentations(report_id, user_id)
  WHERE slides IS NOT NULL;

COMMENT ON INDEX idx_presentations_report_user IS
  'Part 31: improves load time for workspace shared presentation viewer.';

-- ─── 3. Update credit feature constraints (if applicable) ───────────────────────
-- This section adds/updates the CreditFeature enum values for AI operations.
-- Note: This assumes your credit_features table or enum exists.
-- If using an enum type, you would need to add new values:
--   slide_ai_rewrite, slide_ai_generate, slide_ai_notes

DO $$
BEGIN
  -- Check if using enum type for credit_features
  IF EXISTS (
    SELECT 1 FROM pg_type 
    WHERE typname = 'credit_feature'
  ) THEN
    -- Add new enum values if they don't exist
    -- Note: This is a simplified approach; you may need to handle enum updates differently
    -- depending on your PostgreSQL version and exact schema
    BEGIN
      ALTER TYPE credit_feature ADD VALUE IF NOT EXISTS 'slide_ai_rewrite';
    EXCEPTION WHEN duplicate_object THEN
      -- Value already exists, ignore
      NULL;
    END;
    
    BEGIN
      ALTER TYPE credit_feature ADD VALUE IF NOT EXISTS 'slide_ai_generate';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    
    BEGIN
      ALTER TYPE credit_feature ADD VALUE IF NOT EXISTS 'slide_ai_notes';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- ─── 4. Add helper function to get AI credit costs ─────────────────────────────
-- Provides consistent credit cost values for AI operations across the application

CREATE OR REPLACE FUNCTION get_ai_credit_cost(
  p_operation TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN CASE p_operation
    WHEN 'slide_ai_rewrite' THEN 1
    WHEN 'slide_ai_generate' THEN 2
    WHEN 'slide_ai_notes' THEN 1
    ELSE 1  -- Default fallback
  END;
END;
$$;

COMMENT ON FUNCTION get_ai_credit_cost(TEXT) IS
  'Part 31: Returns credit cost for AI slide operations. '
  'Rewrites: 1 credit, Generates: 2 credits, Notes: 1 credit';

GRANT EXECUTE ON FUNCTION get_ai_credit_cost(TEXT) TO authenticated;

-- ─── 5. Add function to ensure consistent AI credit consumption ────────────────
-- Wrapper around credit consumption that ensures proper feature naming and logging

CREATE OR REPLACE FUNCTION consume_ai_credits(
  p_user_id UUID,
  p_operation TEXT,
  p_presentation_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_cost INTEGER;
  v_has_sufficient BOOLEAN;
  v_balance INTEGER;
BEGIN
  -- Get credit cost for operation
  v_credit_cost := get_ai_credit_cost(p_operation);
  
  -- Check if user has sufficient credits
  SELECT (credits_balance >= v_credit_cost) INTO v_has_sufficient
  FROM credits WHERE user_id = p_user_id;
  
  IF NOT v_has_sufficient THEN
    RETURN FALSE;
  END IF;
  
  -- Consume the credits
  UPDATE credits 
  SET credits_balance = credits_balance - v_credit_cost,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Record transaction
  INSERT INTO credit_transactions (
    user_id,
    amount,
    feature,
    description,
    metadata,
    created_at
  )
  VALUES (
    p_user_id,
    -v_credit_cost,  -- Negative for consumption
    p_operation,
    CASE p_operation
      WHEN 'slide_ai_rewrite' THEN 'AI Slide Rewrite'
      WHEN 'slide_ai_generate' THEN 'AI Slide Generation'
      WHEN 'slide_ai_notes' THEN 'AI Slide Notes'
      ELSE 'AI Slide Operation'
    END,
    jsonb_build_object(
      'presentation_id', p_presentation_id,
      'operation', p_operation,
      'cost', v_credit_cost
    ) || p_metadata,
    NOW()
  );
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION consume_ai_credits(UUID, TEXT, UUID, JSONB) IS
  'Part 31: Safely consume credits for AI operations with proper logging. '
  'Returns TRUE if credits were consumed, FALSE if insufficient credits.';

GRANT EXECUTE ON FUNCTION consume_ai_credits(UUID, TEXT, UUID, JSONB) TO authenticated;

-- ─── 6. Add function to get remaining credits for AI operations ────────────────

CREATE OR REPLACE FUNCTION get_ai_credits_available(
  p_user_id UUID,
  p_operation TEXT DEFAULT NULL
)
RETURNS TABLE (
  available_credits INTEGER,
  operation_cost INTEGER,
  can_perform BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_cost INTEGER;
BEGIN
  -- Get the operation cost if specified
  v_operation_cost := COALESCE(get_ai_credit_cost(p_operation), 0);
  
  RETURN QUERY
    SELECT 
      COALESCE(c.credits_balance, 0) AS available_credits,
      v_operation_cost AS operation_cost,
      COALESCE(c.credits_balance >= v_operation_cost, FALSE) AS can_perform
    FROM credits c
    WHERE c.user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION get_ai_credits_available(UUID, TEXT) IS
  'Part 31: Returns available credits and whether specified operation can be performed.';

GRANT EXECUTE ON FUNCTION get_ai_credits_available(UUID, TEXT) TO authenticated;

