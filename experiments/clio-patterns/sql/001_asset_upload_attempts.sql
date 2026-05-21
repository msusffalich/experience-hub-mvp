-- Experience Hub CLIO lab: asset upload attempt ledger.
-- Safe to run more than once.

create table if not exists asset_upload_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  asset_id text not null,
  experience_id text,
  user_id uuid references auth.users(id) on delete cascade,
  device_id text,
  file_name text,
  mime_type text,
  size_bytes bigint default 0,
  bucket_id text not null default 'experience-media',
  storage_path text,
  status text not null check (status in ('pending', 'uploading', 'uploaded', 'failed')),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists asset_upload_attempts_asset_time_idx
  on asset_upload_attempts (asset_id, started_at desc);

create index if not exists asset_upload_attempts_user_status_idx
  on asset_upload_attempts (user_id, status, started_at desc);

alter table asset_upload_attempts enable row level security;

grant select, insert, update, delete on table asset_upload_attempts to authenticated;
grant select, insert, update, delete on table asset_upload_attempts to service_role;

drop policy if exists "Users can manage own upload attempts" on asset_upload_attempts;

create policy "Users can manage own upload attempts"
  on asset_upload_attempts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
