alter table public.works drop constraint if exists works_work_type_check;

create table if not exists public.work_types (
  name text primary key,
  sort_order integer not null default 0
);

insert into public.work_types (name, sort_order) values
  ('Novel', 0),
  ('Nonfiction', 1),
  ('Short Story', 2)
on conflict (name) do nothing;

alter table public.work_types enable row level security;
grant select, insert, update, delete on public.work_types to service_role;

create or replace function public.remove_work_category(p_name text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uncategorized_count integer;
begin
  if not exists (select 1 from public.work_types where name = p_name) then
    return null;
  end if;

  update public.works
  set work_type = null, updated_at = now()
  where work_type = p_name;
  get diagnostics uncategorized_count = row_count;

  delete from public.work_types where name = p_name;
  return uncategorized_count;
end;
$$;

revoke all on function public.remove_work_category(text) from public;
grant execute on function public.remove_work_category(text) to service_role;

notify pgrst, 'reload schema';
