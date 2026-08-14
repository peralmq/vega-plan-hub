-- p4-02: telegram_inbox — raw-update queue for the hybrid transport
-- (gate-brief decision 2, 2026-08-14; tech.spec.md "Chat assistant").
-- The capture edge function enqueues allow-listed Telegram updates
-- verbatim; the household M1 runtime consumes them over an outbound
-- Realtime subscription and marks processed_at. Allow-list rejects are
-- never enqueued (privacy default, carried into p4-06). Retention is
-- unbounded for now — p4-06 (NLU trace capture) owns the pruning story.

CREATE TABLE public.telegram_inbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  update_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  message_id BIGINT,
  -- FK enforces the "only allow-listed senders are ever stored" invariant
  -- at the schema level; un-enrolling a sender removes their queued rows.
  telegram_user_id BIGINT NOT NULL
    REFERENCES public.telegram_accounts(telegram_user_id) ON DELETE CASCADE,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('message', 'callback_query')),
  text TEXT,                -- message text / callback data (what the parser sees)
  payload JSONB NOT NULL,   -- the raw Telegram update, verbatim
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  -- Telegram retries webhooks on non-200; update_id makes retries idempotent.
  CONSTRAINT telegram_inbox_update_unique UNIQUE (user_id, update_id)
);

-- RLS: same shared-household-user pattern as every p4-01 table.
ALTER TABLE public.telegram_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own telegram inbox"
  ON public.telegram_inbox FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Consumer's backlog sweep: unprocessed rows in arrival order.
CREATE INDEX idx_telegram_inbox_unprocessed
  ON public.telegram_inbox (user_id, id) WHERE processed_at IS NULL;

-- Realtime: the M1 consumer subscribes to INSERTs on this table.
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_inbox;
