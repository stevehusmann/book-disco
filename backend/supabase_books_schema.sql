create table if not exists public.books (
  uid text primary key,
  book jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;

create extension if not exists pg_trgm;

create index if not exists books_series_id_idx
  on public.books ((book ->> 'SeriesId'));

create index if not exists books_library_title_idx
  on public.books ((book ->> 'AlphaTitle'), (book ->> 'Title'))
  where book ->> 'BINDING' = 'pbk' and coalesce(book ->> 'Image', '') <> '';

create index if not exists books_library_author_idx
  on public.books ((book ->> 'AlphaAuthor'), (book ->> 'Author'), (book ->> 'AlphaTitle'))
  where book ->> 'BINDING' = 'pbk' and coalesce(book ->> 'Image', '') <> '';

create index if not exists books_title_search_idx
  on public.books using gin ((book ->> 'Title') gin_trgm_ops);

create index if not exists books_author_search_idx
  on public.books using gin ((book ->> 'Author') gin_trgm_ops);

create index if not exists books_alpha_author_search_idx
  on public.books using gin ((book ->> 'AlphaAuthor') gin_trgm_ops);