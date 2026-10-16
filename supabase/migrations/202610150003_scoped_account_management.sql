create or replace function public.scoped_login_targets(
  p_actor_role text,
  p_actor_district_code text,
  p_actor_block_code text,
  p_account_type text,
  p_project_host text,
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
declare
  allowed_types text[];
  district_filter text;
  block_filter text;
  school_filter text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_actor_role = 'admin'
    and p_actor_district_code is null and p_actor_block_code is null then
    allowed_types := array['district', 'block', 'school'];
  elsif p_actor_role = 'district'
    and p_actor_district_code ~ '^[0-9]{4}$' and p_actor_block_code is null then
    allowed_types := array['block', 'school'];
  elsif p_actor_role = 'block'
    and p_actor_district_code ~ '^[0-9]{4}$'
    and p_actor_block_code ~ '^[0-9]{6}$'
    and left(p_actor_block_code, 4) = p_actor_district_code then
    allowed_types := array['school'];
  else
    raise exception 'Invalid account management scope.' using errcode = '22023';
  end if;

  if p_account_type is null or not (p_account_type = any(allowed_types))
    or p_project_host is null or p_project_host !~ '^[a-z0-9-]+[.]supabase[.]co$'
    or p_page is null or p_page < 1 or p_page > 100000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100
    or coalesce(p_status, '') not in ('', 'active', 'missing', 'inactive', 'password_change_required', 'needs_attention')
    or length(coalesce(p_district, '')) > 100
    or length(coalesce(p_block, '')) > 100
    or length(coalesce(p_school, '')) > 100 then
    raise exception 'Invalid login list filters.' using errcode = '22023';
  end if;

  district_filter := replace(replace(replace(coalesce(p_district, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  block_filter := replace(replace(replace(coalesce(p_block, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  school_filter := replace(replace(replace(coalesce(p_school, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  return query
  with scoped_school_codes as materialized (
    select s.id, s.code, s.name, s.district, s.block, s.active
    from public.schools s
    where s.code ~ '^[0-9]{11}$'
      and (
        p_actor_role = 'admin'
        or (p_actor_role = 'district' and left(s.code, 4) = p_actor_district_code
          and s.code >= (p_actor_district_code || repeat('0', 7))
          and s.code <= (p_actor_district_code || repeat('9', 7)))
        or (p_actor_role = 'block' and left(s.code, 4) = p_actor_district_code
          and left(s.code, 6) = p_actor_block_code
          and s.code >= (p_actor_block_code || repeat('0', 5))
          and s.code <= (p_actor_block_code || repeat('9', 5)))
      )
  ),
  target_rows as (
    select 'district'::text as account_type,
      min(s.district)::text as district_name, left(s.code, 4)::text as district_code,
      null::text as block_name, null::text as block_code, null::text as school_name,
      null::uuid as school_id, left(s.code, 4)::text as login_id, true as target_active
    from scoped_school_codes s
    where p_account_type = 'district' and p_actor_role = 'admin'
    group by left(s.code, 4)
    union all
    select 'district', '', p.district_code, null, null, null, null, p.district_code, true
    from public.profiles p
    where p_account_type = 'district' and p_actor_role = 'admin'
      and p.role = 'district' and p.district_code ~ '^[0-9]{4}$'
      and p.block_code is null
      and not exists (
        select 1 from scoped_school_codes s where left(s.code, 4) = p.district_code
      )
    union all
    select 'block'::text, min(s.district)::text, left(s.code, 4)::text,
      min(s.block)::text, left(s.code, 6)::text, null::text, null::uuid,
      left(s.code, 6)::text, true
    from scoped_school_codes s
    where p_account_type = 'block' and p_actor_role in ('admin', 'district')
    group by left(s.code, 4), left(s.code, 6)
    union all
    select 'block', '', p.district_code, '', p.block_code, null, null, p.block_code, true
    from public.profiles p
    where p_account_type = 'block' and p_actor_role in ('admin', 'district')
      and p.role = 'block' and p.district_code ~ '^[0-9]{4}$'
      and p.block_code ~ '^[0-9]{6}$' and left(p.block_code, 4) = p.district_code
      and (p_actor_role = 'admin' or p.district_code = p_actor_district_code)
      and not exists (
        select 1 from scoped_school_codes s where left(s.code, 6) = p.block_code
      )
    union all
    select 'school'::text, s.district::text, left(s.code, 4)::text,
      s.block::text, left(s.code, 6)::text, s.name::text, s.id,
      s.code::text, s.active
    from scoped_school_codes s
    where p_account_type = 'school'
  ),
  profile_rows as (
    select p.role::text as account_type, p.district_code, p.block_code, p.school_id,
      count(*)::integer as profile_count,
      (array_agg(p.id order by p.id))[1] as profile_id,
      (array_agg(p.email order by p.id))[1] as email,
      bool_or(p.active) as profile_active,
      bool_or(p.must_change_password) as must_change_password
    from public.profiles p
    where
      (p.role = 'district' and p_account_type = 'district' and p_actor_role = 'admin'
        and p.district_code ~ '^[0-9]{4}$' and p.block_code is null)
      or (p.role = 'block' and p_account_type = 'block'
        and p_actor_role in ('admin', 'district')
        and p.district_code ~ '^[0-9]{4}$' and p.block_code ~ '^[0-9]{6}$'
        and left(p.block_code, 4) = p.district_code
        and (p_actor_role = 'admin' or p.district_code = p_actor_district_code))
      or (p.role = 'school' and p_account_type = 'school'
        and exists (select 1 from scoped_school_codes s where s.id = p.school_id))
    group by p.role, p.district_code, p.block_code, p.school_id
  ),
  account_rows as (
    select t.*, pr.profile_id, pr.email, pr.profile_active,
      coalesce(pr.must_change_password, false) as must_change_password,
      coalesce(pr.profile_count, 0) as profile_count,
      coalesce(
        pr.profile_id is null
        or (
          pr.profile_count = 1
          and au.id = pr.profile_id
          and lower(au.email) = lower(pr.email)
          and lower(pr.email) = lower(t.account_type || '-' || t.login_id || '@' || p_project_host)
        ),
        false
      ) as identity_consistent,
      case
        when pr.profile_id is not null and (
          coalesce(pr.profile_count, 0) <> 1
          or au.id is null
          or lower(au.email) is distinct from lower(pr.email)
          or lower(pr.email) is distinct from lower(t.account_type || '-' || t.login_id || '@' || p_project_host)
        ) then 'needs_attention'
        when t.account_type = 'school' and not t.target_active then 'inactive'
        when pr.profile_id is null then 'missing'
        when not coalesce(pr.profile_active, false) then 'inactive'
        when coalesce(pr.must_change_password, false) then 'password_change_required'
        else 'active'
      end as account_status
    from target_rows t
    left join profile_rows pr
      on pr.account_type = t.account_type
      and (
        (t.account_type = 'school' and pr.school_id = t.school_id)
        or (t.account_type = 'district' and pr.district_code = t.district_code and pr.block_code is null)
        or (t.account_type = 'block' and pr.district_code = t.district_code and pr.block_code = t.block_code)
      )
    left join auth.users au on au.id = pr.profile_id
  ),
  filtered_targets as (
    select a.*
    from account_rows a
    where (district_filter = ''
        or a.district_code ilike '%' || district_filter || '%' escape E'\\'
        or coalesce(a.district_name, '') ilike '%' || district_filter || '%' escape E'\\')
      and (block_filter = ''
        or coalesce(a.block_code, '') ilike '%' || block_filter || '%' escape E'\\'
        or coalesce(a.block_name, '') ilike '%' || block_filter || '%' escape E'\\')
      and (school_filter = ''
        or coalesce(a.school_name, '') ilike '%' || school_filter || '%' escape E'\\'
        or coalesce(a.login_id, '') ilike '%' || school_filter || '%' escape E'\\')
      and (coalesce(p_status, '') = '' or a.account_status = p_status)
  ),
  page_rows as (
    select f.*
    from filtered_targets f
    order by f.district_code, f.block_code nulls first, f.login_id
    offset ((p_page::bigint - 1) * p_page_size::bigint)
    limit p_page_size
  ),
  result_count as (
    select count(*)::bigint as total_count from filtered_targets
  )
  select page.account_type, page.district_name, page.district_code,
    page.block_name, page.block_code, page.school_name, page.school_id,
    page.login_id, page.email, page.profile_id, page.profile_active,
    page.must_change_password, page.account_status, page.identity_consistent,
    page.target_active, result_count.total_count
  from result_count
  left join page_rows page on true
  order by page.district_code nulls last, page.block_code nulls first, page.login_id nulls last;
end;
$$;

revoke all on function public.scoped_login_targets(
  text, text, text, text, text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.scoped_login_targets(
  text, text, text, text, text, text, text, text, text, integer, integer
) to service_role;

notify pgrst, 'reload schema';
