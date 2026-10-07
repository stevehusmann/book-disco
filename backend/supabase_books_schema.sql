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

create or replace function public.search_books(
  p_query text default '',
  p_series text default '',
  p_sort text default 'title-asc',
  p_page integer default 0,
  p_page_size integer default 80
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select uid, book
    from public.books
    where lower(coalesce(book ->> 'BINDING', 'pbk')) = 'pbk'
      and (
        coalesce(p_series, '') = ''
        or (p_series = 'Unknown' and coalesce(book ->> 'SeriesId', '') = '')
        or book ->> 'SeriesId' = p_series
      )
      and (
        coalesce(trim(p_query), '') = ''
        or coalesce(book ->> 'Title', '') ilike '%' || trim(p_query) || '%'
        or coalesce(book ->> 'Author', '') ilike '%' || trim(p_query) || '%'
        or coalesce(book ->> 'AlphaAuthor', '') ilike '%' || trim(p_query) || '%'
      )
  ),
  sortable_rows as (
    select
      uid,
      book,
      lower(coalesce(nullif(book ->> 'AlphaTitle', ''), book ->> 'Title', '')) as sort_title,
      lower(coalesce(nullif(book ->> 'AlphaAuthor', ''), book ->> 'Author', '')) as sort_author
    from filtered
  ),
  page_rows as (
    select uid, book, sort_title, sort_author
    from sortable_rows
    order by
      case when p_sort = 'title-asc' then sort_title end asc,
      case when p_sort = 'title-desc' then sort_title end desc,
      case when p_sort = 'author-asc' then sort_author end asc,
      case when p_sort = 'author-desc' then sort_author end desc,
      case when p_sort in ('author-asc', 'author-desc') then sort_title end asc,
      uid asc
    limit least(100, greatest(1, coalesce(p_page_size, 80)))
    offset greatest(0, coalesce(p_page, 0)) * least(100, greatest(1, coalesce(p_page_size, 80)))
  )
  select jsonb_build_object(
    'books', coalesce(
      (select jsonb_agg(
        jsonb_set(page_rows.book, '{_uid}', to_jsonb(page_rows.uid), true)
        order by
          case when p_sort = 'title-asc' then page_rows.sort_title end asc,
          case when p_sort = 'title-desc' then page_rows.sort_title end desc,
          case when p_sort = 'author-asc' then page_rows.sort_author end asc,
          case when p_sort = 'author-desc' then page_rows.sort_author end desc,
          case when p_sort in ('author-asc', 'author-desc') then page_rows.sort_title end asc,
          page_rows.uid asc
      ) from page_rows),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered),
    'page', greatest(0, coalesce(p_page, 0)),
    'pageSize', least(100, greatest(1, coalesce(p_page_size, 80))),
    'pageCount', greatest(1, ceil((select count(*) from filtered)::numeric / least(100, greatest(1, coalesce(p_page_size, 80))))::integer)
  );
$$;

revoke all on function public.search_books(text, text, text, integer, integer) from public;
grant execute on function public.search_books(text, text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';