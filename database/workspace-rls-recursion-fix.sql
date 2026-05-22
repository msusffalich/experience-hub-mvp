-- Fixes Postgres/Supabase RLS recursion between workspaces and workspace_members.
-- The previous membership policy queried workspaces, while the workspaces policy
-- queried workspace_members. That circular dependency triggers:
-- 42P17 infinite recursion detected in policy for relation "workspace_members".

DROP POLICY IF EXISTS "Members can read memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners and admins can manage memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can read own workspace memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can insert own workspace memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can update own workspace memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can delete own workspace memberships" ON public.workspace_members;

CREATE POLICY "Users can read own workspace memberships"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own workspace memberships"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own workspace memberships"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own workspace memberships"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

NOTIFY pgrst, 'reload schema';
