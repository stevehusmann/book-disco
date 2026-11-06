create table if not exists public.wikipedia_cache (
  cache_key text primary key,
  cached_data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.wikipedia_cache enable row level security;
grant select, insert, update on public.wikipedia_cache to service_role;

notify pgrst, 'reload schema';
