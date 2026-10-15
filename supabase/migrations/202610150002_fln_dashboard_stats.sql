-- FLN dashboard: server-side aggregation (district -> block -> school) and ledger (month rows).
-- security invoker => existing RLS (admin / district / block / school scope) automatically applies.

create or replace function public.fln_entry_class(p_dhoran text, p_answers jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with rule as (
    select case p_dhoran
      when 'B' then array[1,3,4,5,12,13]
      when '1' then array[1,2,3,4,5,6,7,8,9,10,12,13,14,15,16,18,19,20,23,24,25,29]
      else (select array_agg(g) from generate_series(1,30) g)
    end as ids,
    case p_dhoran when 'B' then 1 when '1' then 6 else 9 end as uday_max,
    case p_dhoran when 'B' then 5 when '1' then 18 else 24 end as nipun_min
  ), stat as (
    select
      count(*) filter (where jsonb_typeof(p_answers -> i::text) = 'boolean') as answered,
      count(*) filter (where p_answers -> i::text = 'true'::jsonb) as yes,
      count(*) as total,
      max(r.uday_max) as uday_max, max(r.nipun_min) as nipun_min
    from rule r, unnest(r.ids) as i
  )
  select case
    when answered <> total then null
    when yes <= uday_max then 'U'
    when yes >= nipun_min then 'N'
    else 'P' end
  from stat
$$;

-- Group wise stats for one month (+ optional grade). p_group: district | block | school
create or replace function public.fln_group_stats(
  p_group text,
  p_district text default null,
  p_block text default null,
  p_dhoran text default null,
  p_month text default null
)
returns table (
  group_key text, group_label text, district text, block text, school_id uuid, school_code text,
  registered bigint, entered bigint, uday bigint, pragati bigint, nipun bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with sc as (
    select s.id, s.code, s.name, s.district, s.block
    from public.schools s
    where s.active
      and (p_district is null or s.district = p_district)
      and (p_block is null or s.block = p_block)
  ), reg as (
    select st.school_id, count(*) as n
    from public.students st join sc on sc.id = st.school_id
    where p_dhoran is null or st.dhoran = p_dhoran
    group by st.school_id
  ), ent as (
    select e.school_id,
      count(*) as entered,
      count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'U') as u,
      count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'P') as p,
      count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'N') as n
    from public.entries e join sc on sc.id = e.school_id
    where (p_dhoran is null or e.dhoran = p_dhoran)
      and (p_month is null or e.month = p_month)
    group by e.school_id
  ), per_school as (
    select sc.*, coalesce(reg.n,0) as registered, coalesce(ent.entered,0) as entered,
           coalesce(ent.u,0) as u, coalesce(ent.p,0) as p, coalesce(ent.n,0) as n
    from sc left join reg on reg.school_id = sc.id left join ent on ent.school_id = sc.id
  )
  select
    case p_group when 'district' then ps.district when 'block' then ps.block else ps.code end,
    case p_group when 'district' then ps.district when 'block' then ps.block else ps.name end,
    ps.district,
    case when p_group = 'district' then null else ps.block end,
    case when p_group = 'school' then ps.id else null end,
    case when p_group = 'school' then ps.code else null end,
    sum(ps.registered)::bigint, sum(ps.entered)::bigint,
    sum(ps.u)::bigint, sum(ps.p)::bigint, sum(ps.n)::bigint
  from per_school ps
  group by 1,2,3,4,5,6
  order by 2
$$;

-- Ledger like the PDF: one row per month (+ grade), for any scope.
create or replace function public.fln_ledger(
  p_district text default null,
  p_block text default null,
  p_school_id uuid default null,
  p_dhoran text default null
)
returns table (month text, registered bigint, entered bigint, uday bigint, pragati bigint, nipun bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with sc as (
    select s.id from public.schools s
    where s.active
      and (p_school_id is null or s.id = p_school_id)
      and (p_district is null or s.district = p_district)
      and (p_block is null or s.block = p_block)
  ), reg as (
    select count(*) as n from public.students st join sc on sc.id = st.school_id
    where p_dhoran is null or st.dhoran = p_dhoran
  )
  select e.month,
    (select n from reg)::bigint,
    count(*)::bigint,
    count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'U')::bigint,
    count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'P')::bigint,
    count(*) filter (where public.fln_entry_class(e.dhoran, e.answers) = 'N')::bigint
  from public.entries e join sc on sc.id = e.school_id
  where p_dhoran is null or e.dhoran = p_dhoran
  group by e.month
  order by e.month
$$;

revoke all on function public.fln_entry_class(text, jsonb) from public, anon;
revoke all on function public.fln_group_stats(text,text,text,text,text) from public, anon;
revoke all on function public.fln_ledger(text,text,uuid,text) from public, anon;
grant execute on function public.fln_entry_class(text, jsonb) to authenticated;
grant execute on function public.fln_group_stats(text,text,text,text,text) to authenticated;
grant execute on function public.fln_ledger(text,text,uuid,text) to authenticated;

create index if not exists entries_month_dhoran_school_idx on public.entries (month, dhoran, school_id);

notify pgrst, 'reload schema';
