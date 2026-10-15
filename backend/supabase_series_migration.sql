create table if not exists public.series (
  id text primary key,
  name text not null,
  height_width_ratio double precision,
  thickness_multiplier double precision not null default 1.0 check (thickness_multiplier > 0),
  spine_mode text not null default 'automatic' check (spine_mode in ('automatic', 'pcd-crop')),
  updated_at timestamptz not null default now(),
  check (height_width_ratio is null or height_width_ratio > 0)
);

alter table public.series
  add column if not exists thickness_multiplier double precision not null default 1.0 check (thickness_multiplier > 0);

alter table public.series enable row level security;

notify pgrst, 'reload schema';