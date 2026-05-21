-- Experience Hub CLIO lab: async processing jobs.
-- Safe to run more than once.

create table if not exists processing_jobs (
  job_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  asset_id text,
  experience_id text,
  job_type text not null check (job_type in ('ocr', 'transcription', 'image_description', 'video_review', 'report_build', 'embedding')),
  status text not null default 'pending' check (status in ('pending', 'running', 'ready', 'failed', 'cancelled')),
  progress jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists processing_jobs_user_status_idx
  on processing_jobs (user_id, status, created_at desc);

create index if not exists processing_jobs_asset_idx
  on processing_jobs (asset_id);

alter table processing_jobs enable row level security;

grant select, insert, update, delete on table processing_jobs to authenticated;
grant select, insert, update, delete on table processing_jobs to service_role;

drop policy if exists "Users can manage own processing jobs" on processing_jobs;

create policy "Users can manage own processing jobs"
  on processing_jobs
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
