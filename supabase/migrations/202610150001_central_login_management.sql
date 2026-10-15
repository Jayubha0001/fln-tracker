create table if not exists public.admin_account_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  account_type text not null check (account_type in ('district', 'block', 'school')),
  target_profile_id uuid references public.profiles(id) on delete set null,
  district_code text,
  block_code text,
  school_id uuid references public.schools(id) on delete set null,
  attempted_at timestamptz not null default now(),
  result text not null check (result in ('success', 'failed')),
  detail_code text
);

create index if not exists admin_account_audit_actor_time_idx
  on public.admin_account_audit (actor_id, attempted_at desc);
create index if not exists admin_account_audit_target_time_idx
  on public.admin_account_audit (account_type, school_id, district_code, block_code, attempted_at desc);

alter table public.admin_account_audit enable row level security;
drop policy if exists "Admins read account management audit" on public.admin_account_audit;
create policy "Admins read account management audit"
  on public.admin_account_audit for select to authenticated
  using (public.is_admin());
revoke all on public.admin_account_audit from public, anon;
grant select on public.admin_account_audit to authenticated;
grant select, insert on public.admin_account_audit to service_role;
grant usage, select on sequence public.admin_account_audit_id_seq to service_role;

create or replace function public.admin_login_targets(
  p_account_type text,
  p_district text default '',
  p_block text default '',
  p_school text default '',
  p_status text default '',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  account_type text,
  district_name text,
  district_code text,
  block_name text,
  block_code text,
  school_name text,
  school_id uuid,
  login_id text,
  email text,
  profile_id uuid,
  profile_active boolean,
  must_change_password boolean,
  account_status text,
  identity_consistent boolean,
  target_active boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_account_type is null or p_page is null or p_page_size is null
    or p_account_type not in ('district', 'block', 'school')
    or p_page < 1 or p_page_size < 1 or p_page_size > 100
    or coalesce(p_status, '') not in ('', 'active', 'missing', 'inactive', 'password_change_required', 'needs_attention') then
    raise exception 'Invalid login list filters.' using errcode = '22023';
  end if;

  return query
  with school_codes as (
    select s.id, s.code, s.name, s.district, s.block, s.active
    from public.schools s
    where s.code ~ '^[0-9]{11}$'
  ),
  target_rows as (
    select 'district'::text as account_type,
      min(s.district)::text as district_name, left(s.code, 4)::text as district_code,
      null::text as block_name, null::text as block_code, null::text as school_name,
      null::uuid as school_id, left(s.code, 4)::text as login_id, true as target_active
    from school_codes s
    group by left(s.code, 4)
    union all
    select 'district', '', p.district_code, null, null, null, null, p.district_code, true
    from public.profiles p
    where p.role = 'district' and p.district_code ~ '^[0-9]{4}$'
      and not exists (select 1 from school_codes s where left(s.code, 4) = p.district_code)
    union all
    select 'block', min(s.district)::text, left(s.code, 4)::text,
      min(s.block)::text, left(s.code, 6)::text, null, null,
      left(s.code, 6)::text, true
    from school_codes s
    group by left(s.code, 4), left(s.code, 6)
    union all
    select 'block', '', p.district_code, '', p.block_code, null, null,
      p.block_code, true
    from public.profiles p
    where p.role = 'block' and p.district_code ~ '^[0-9]{4}$'
      and p.block_code ~ '^[0-9]{6}$' and left(p.block_code, 4) = p.district_code
      and not exists (select 1 from school_codes s where left(s.code, 6) = p.block_code)
    union all
    select 'school', s.district::text, left(s.code, 4)::text,
      s.block::text, left(s.code, 6)::text, s.name::text, s.id,
      s.code::text, s.active
    from school_codes s
  ),
  profile_rows as (
    select p.role::text as account_type, p.district_code, p.block_code, p.school_id,
      count(*)::integer as profile_count,
      (array_agg(p.id order by p.id))[1] as profile_id,
      (array_agg(p.email order by p.id))[1] as email,
      bool_or(p.active) as profile_active,
      bool_or(p.must_change_password) as must_change_password
    from public.profiles p
    where p.role in ('district', 'block', 'school')
    group by p.role, p.district_code, p.block_code, p.school_id
  ),
  account_rows as (
    select t.*,
      pr.profile_id,
      pr.email,
      pr.profile_active,
      coalesce(pr.must_change_password, false) as must_change_password,
      coalesce(pr.profile_count, 0) as profile_count,
      case
        when coalesce(pr.profile_count, 0) > 1 then 'needs_attention'
        when pr.profile_id is null then 'missing'
        when not coalesce(pr.profile_active, false) then 'inactive'
        when coalesce(pr.must_change_password, false) then 'password_change_required'
        else 'active'
      end as status
    from target_rows t
    left join profile_rows pr
      on pr.account_type = t.account_type
      and (t.account_type = 'school' and pr.school_id = t.school_id
        or t.account_type = 'district' and pr.district_code = t.district_code and pr.block_code is null
        or t.account_type = 'block' and pr.district_code = t.district_code and pr.block_code = t.block_code)
    where t.account_type = p_account_type
      and (coalesce(p_district, '') = ''
        or t.district_code ilike '%' || p_district || '%'
        or coalesce(t.district_name, '') ilike '%' || p_district || '%')
      and (coalesce(p_block, '') = ''
        or coalesce(t.block_code, '') ilike '%' || p_block || '%'
        or coalesce(t.block_name, '') ilike '%' || p_block || '%')
      and (coalesce(p_school, '') = ''
        or coalesce(t.school_name, '') ilike '%' || p_school || '%'
        or coalesce(t.login_id, '') ilike '%' || p_school || '%')
      and (coalesce(p_status, '') = '' or
        case
          when t.account_type = 'school' and not t.target_active then 'inactive'
          when coalesce(pr.profile_count, 0) > 1 then 'needs_attention'
          when pr.profile_id is null then 'missing'
          when not coalesce(pr.profile_active, false) then 'inactive'
          when coalesce(pr.must_change_password, false) then 'password_change_required'
          else 'active'
        end = p_status)
      and (t.account_type <> 'school' or t.target_active or coalesce(p_status, '') <> 'active')
  )
  select a.account_type, a.district_name, a.district_code, a.block_name, a.block_code,
    a.school_name, a.school_id, a.login_id, a.email, a.profile_id, a.profile_active,
    a.must_change_password,
    case when a.account_type = 'school' and not a.target_active then 'inactive' else a.status end,
    a.profile_count <= 1,
    a.target_active,
    count(*) over ()
  from account_rows a
  order by a.district_code, a.block_code nulls first, a.login_id
  offset (p_page - 1) * p_page_size
  limit p_page_size;
end;
$$;

revoke all on function public.admin_login_targets(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_login_targets(text, text, text, text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
