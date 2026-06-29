-- Origin setup for Supabase
-- Run this in the Supabase SQL editor, then create a public Storage bucket named:
-- origin-transfers

create extension if not exists pg_cron;

create table if not exists public.origin_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  session_name text not null,
  bucket text not null default 'origin-transfers',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloaded_at timestamptz
);

alter table public.origin_files enable row level security;

drop policy if exists "Origin public read live files" on public.origin_files;
create policy "Origin public read live files"
on public.origin_files
for select
to anon
using (expires_at > now());

drop policy if exists "Origin public create files" on public.origin_files;
create policy "Origin public create files"
on public.origin_files
for insert
to anon
with check (
  bucket = 'origin-transfers'
  and expires_at <= now() + interval '15 minutes 30 seconds'
);

drop policy if exists "Origin public mark downloaded" on public.origin_files;
create policy "Origin public mark downloaded"
on public.origin_files
for update
to anon
using (expires_at > now())
with check (expires_at > now());

drop policy if exists "Origin public storage read" on storage.objects;
create policy "Origin public storage read"
on storage.objects
for select
to anon
using (bucket_id = 'origin-transfers');

drop policy if exists "Origin public storage upload" on storage.objects;
create policy "Origin public storage upload"
on storage.objects
for insert
to anon
with check (bucket_id = 'origin-transfers');

create or replace function public.origin_cleanup_expired()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  expired_paths text[];
begin
  select coalesce(array_agg(storage_path), array[]::text[])
  into expired_paths
  from public.origin_files
  where expires_at <= now() or downloaded_at is not null;

  if array_length(expired_paths, 1) is not null then
    delete from storage.objects
    where bucket_id = 'origin-transfers'
      and name = any(expired_paths);
  end if;

  delete from public.origin_files
  where expires_at <= now() or downloaded_at is not null;
end;
$$;

select cron.schedule(
  'origin-cleanup-expired-files',
  '* * * * *',
  $$select public.origin_cleanup_expired();$$
);
