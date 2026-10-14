alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

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
      and role = 'school'
      and active
      and must_change_password;
  end if;

  return new;
end;
$$;

revoke all on function public.mark_school_password_changed() from public;
revoke all on function public.mark_school_password_changed() from anon;
revoke all on function public.mark_school_password_changed() from authenticated;

drop trigger if exists mark_school_password_changed on auth.users;
create trigger mark_school_password_changed
  after update of encrypted_password on auth.users
  for each row
  execute function public.mark_school_password_changed();

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
    and p.role = 'school'
    and p.active;

  if not found then
    raise exception 'Active school profile required.' using errcode = '42501';
  end if;

  if not change_required then
    return true;
  end if;

  if change_required then
    raise exception 'Change the account password before completing first login.'
      using errcode = '42501';
  end if;

  return true;
end;
$$;

revoke all on function public.complete_school_password_change() from public;
revoke all on function public.complete_school_password_change() from anon;
grant execute on function public.complete_school_password_change() to authenticated;
