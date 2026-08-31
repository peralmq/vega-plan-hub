-- p4-06: nlu_traces — append-only parse log for every utterance the bot's
-- NLU actually saw (tech.spec.md "Chat assistant" schema list, directive
-- Pelle 2026-08-30). Every parse gets a row; a correctness signal (implicit
-- from what happens next, or explicit from a human review tap) attaches
-- later via UPDATE on label/label_source/corrected_parse — never a delete,
-- never a second row for the same utterance.
--
-- NOT applied to the live Supabase project by this change set (Pelle applies
-- it by hand). The bot's trace-write path degrades gracefully — log and
-- continue, never crash or block message handling — for exactly this reason:
-- it may run against a database that does not have this table yet.

CREATE TABLE public.nlu_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chat_id BIGINT NOT NULL,
  utterance TEXT NOT NULL,
  parse JSONB NOT NULL,
  model TEXT NOT NULL,
  harness_version TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT 'unsettled'
    CHECK (label IN (
      'unsettled', 'implicit_correct', 'implicit_wrong',
      'confirmed_correct', 'confirmed_wrong'
    )),
  label_source TEXT
    CHECK (label_source IN ('correction', 'sweep', 'review')),
  corrected_parse JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  labelled_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.nlu_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own nlu traces"
  ON public.nlu_traces FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Query paths: the sweep scans unsettled traces per household, the review
-- surface and the fixture export both filter by (user_id, label).
CREATE INDEX idx_nlu_traces_user_label
  ON public.nlu_traces (user_id, label, created_at);