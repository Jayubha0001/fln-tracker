alter table public.profiles
  add column if not exists district_code text,
  add column if not exists block_code text,
  add column if not exists must_change_password boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  drop constraint if exists profiles_role_school_check,
  drop constraint if exists profiles_scope_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('admin', 'school', 'district', 'block')),
  add constraint profiles_scope_check check (
    (role = 'admin' and school_id is null and district_code is null and block_code is null)
    or (role = 'school' and school_id is not null and district_code is null and block_code is null)
    or (role = 'district' and school_id is null and district_code is not null
      and district_code ~ '^[0-9]{4}$' and block_code is null)
    or (role = 'block' and school_id is null and district_code is not null
      and district_code ~ '^[0-9]{4}$' and block_code is not null
      and block_code ~ '^[0-9]{6}$' and left(block_code, 4) = district_code)
  );

create unique index if not exists profiles_one_account_per_district
  on public.profiles (district_code)
  where role = 'district';

create unique index if not exists profiles_one_account_per_block
  on public.profiles (block_code)
  where role = 'block';

create or replace function public.can_access_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.schools s on s.id = target_school_id
    where p.id = (select auth.uid())
      and p.active
      and s.active
      and (
        (p.role = 'admin')
        or (p.role = 'school' and p.school_id = s.id)
        or (p.role = 'district' and p.district_code = left(s.code, 4))
        or (p.role = 'block' and p.block_code = left(s.code, 6)
          and p.district_code = left(s.code, 4))
      )
  )
$$;

revoke all on function public.can_access_school(uuid) from public, anon;
grant execute on function public.can_access_school(uuid) to authenticated;

drop policy if exists "Users read their school" on public.schools;
create policy "Users read scoped schools"
  on public.schools for select to authenticated
  using (public.can_access_school(id));

drop policy if exists "School users manage their students" on public.students;
create policy "School and scoped users manage authorized students"
  on public.students for all to authenticated
  using (public.can_access_school(school_id))
  with check (public.can_access_school(school_id));

drop policy if exists "School users manage their entries" on public.entries;
create policy "School and scoped users manage authorized entries"
  on public.entries for all to authenticated
  using (public.can_access_school(school_id))
  with check (public.can_access_school(school_id));

create or replace function public.mark_school_password_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles
    set must_change_password = false
    where id = new.id
      and role in ('school', 'district', 'block')
      and active
      and must_change_password;
  end if;

  return new;
end;
$$;

create or replace function public.complete_school_password_change()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_required boolean;
begin
  select p.must_change_password
    into change_required
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.role in ('school', 'district', 'block')
    and p.active;

  if not found then
    raise exception 'Active school or scoped profile required.' using errcode = '42501';
  end if;

  if not change_required then
    return true;
  end if;

  raise exception 'Change the account password before completing first login.'
    using errcode = '42501';
end;
$$;

revoke all on function public.mark_school_password_changed() from public, anon, authenticated;
revoke all on function public.complete_school_password_change() from public, anon;
grant execute on function public.complete_school_password_change() to authenticated;
