create table if not exists public.authors (
  id text primary key,
  name text not null,
  sort_name text not null default '',
  wikidata_qid text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  wikidata_qid text not null unique,
  title text not null,
  release_date text not null,
  date_precision integer not null check (date_precision between 6 and 11),
  source_url text,
  source_statement text,
  updated_at timestamptz not null default now()
);

create table if not exists public.author_works (
  author_id text not null references public.authors(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  primary key (author_id, work_id)
);

create table if not exists public.book_works (
  book_uid text not null references public.books(uid) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  primary key (book_uid, work_id)
);

create index if not exists author_works_work_idx on public.author_works(work_id);
create index if not exists book_works_work_idx on public.book_works(work_id);

alter table public.authors enable row level security;
alter table public.works enable row level security;
alter table public.author_works enable row level security;
alter table public.book_works enable row level security;

grant select, insert, update, delete on public.authors, public.works, public.author_works, public.book_works to service_role;

create or replace function public.create_reviewed_work(
  p_work jsonb,
  p_author_ids text[],
  p_book_uids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  existing_release_date text;
  existing_precision integer;
  author_id text;
  book_uid text;
begin
  insert into public.works (
    wikidata_qid,
    title,
    release_date,
    date_precision,
    source_url,
    source_statement
  ) values (
    p_work ->> 'wikidataQid',
    p_work ->> 'title',
    p_work ->> 'releaseDate',
    nullif(p_work ->> 'datePrecision', '')::integer,
    p_work ->> 'sourceUrl',
    case when coalesce(p_work ->> 'releaseDate', '') <> '' then 'P577' else null end
  )
  on conflict (wikidata_qid) do nothing;

  select id, release_date, date_precision
  into new_id, existing_release_date, existing_precision
  from public.works
  where wikidata_qid = p_work ->> 'wikidataQid';

  if existing_release_date <> (p_work ->> 'releaseDate')
    or existing_precision <> nullif(p_work ->> 'datePrecision', '')::integer then
    raise exception 'This Work already exists with a different reviewed release date.';
  end if;

  foreach author_id in array p_author_ids loop
    insert into public.author_works (author_id, work_id) values (author_id, new_id)
    on conflict do nothing;
  end loop;

  foreach book_uid in array p_book_uids loop
    insert into public.book_works (book_uid, work_id) values (book_uid, new_id)
    on conflict do nothing;
  end loop;

  return (select to_jsonb(works) from public.works where id = new_id);
end;
$$;

revoke all on function public.create_reviewed_work(jsonb, text[], text[]) from public;
grant execute on function public.create_reviewed_work(jsonb, text[], text[]) to service_role;

create or replace function public.add_work_relationships(
  p_work_id uuid,
  p_author_ids text[],
  p_book_uids text[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  author_id text;
  book_uid text;
begin
  if not exists (select 1 from public.works where id = p_work_id) then
    raise exception 'Work not found.';
  end if;

  foreach author_id in array p_author_ids loop
    insert into public.author_works (author_id, work_id) values (author_id, p_work_id)
    on conflict do nothing;
  end loop;

  foreach book_uid in array p_book_uids loop
    insert into public.book_works (book_uid, work_id) values (book_uid, p_work_id)
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.add_work_relationships(uuid, text[], text[]) from public;
grant execute on function public.add_work_relationships(uuid, text[], text[]) to service_role;

notify pgrst, 'reload schema';
