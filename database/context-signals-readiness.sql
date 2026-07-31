-- Production readiness repair for Vibe API V2.
-- Safe to run more than once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.context_signals (
  signal_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_id TEXT,
  source_type TEXT NOT NULL,
  source_device TEXT,
  source_id TEXT,
  signal_type TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  location TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_signals_workspace_time_idx
  ON public.context_signals (workspace_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS context_signals_workspace_type_time_idx
  ON public.context_signals (workspace_id, signal_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS context_signals_workspace_participant_time_idx
  ON public.context_signals (workspace_id, participant_id, captured_at DESC);

ALTER TABLE public.context_signals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.context_signals
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can manage context signals" ON public.context_signals;

CREATE POLICY "Members can manage context signals"
  ON public.context_signals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS member
      WHERE member.workspace_id = context_signals.workspace_id
        AND member.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members AS member
      WHERE member.workspace_id = context_signals.workspace_id
        AND member.user_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
