create or replace function public.admin_import_students(
  p_school_codes text[],
  p_rows jsonb
)
returns table (inserted_count integer, duplicate_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_school_count integer;
  distinct_selected_school_count integer;
  total_row_count integer;
  invalid_row_count integer;
  inserted_row_count integer;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_school_codes is null
    or cardinality(p_school_codes) < 1
    or exists (
      select 1
      from unnest(p_school_codes) as selected(code)
      where selected.code is null
         or btrim(selected.code) = ''
         or selected.code <> btrim(selected.code)
    )
    or (
      select count(distinct btrim(selected.code))
      from unnest(p_school_codes) as selected(code)
    ) <> cardinality(p_school_codes)
  then
    raise exception 'Select one or more unique school codes.' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Student rows must be a JSON array.' using errcode = '22023';
  end if;

  total_row_count := jsonb_array_length(p_rows);
  if total_row_count = 0 or total_row_count > 5000 then
    raise exception 'Student row count is outside the supported import limit.' using errcode = '22023';
  end if;

  select count(*), count(distinct btrim(school.code))
    into selected_school_count, distinct_selected_school_count
  from public.schools as school
  where school.active
    and btrim(school.code) = any (p_school_codes);

  if selected_school_count <> cardinality(p_school_codes)
    or distinct_selected_school_count <> cardinality(p_school_codes)
  then
    raise exception 'A selected school code does not match an active database school.' using errcode = '22023';
  end if;

  select count(*)
    into invalid_row_count
  from jsonb_array_elements(p_rows) as item(value)
  cross join lateral jsonb_to_record(item.value) as row_data(
    school_code text,
    dhoran text,
    name text,
    gr_no text,
    gender text,
    section text
  )
  left join public.schools as school
    on btrim(school.code) = btrim(row_data.school_code)
   and school.active
  where row_data.school_code is null
     or btrim(row_data.school_code) = ''
     or row_data.school_code <> all (p_school_codes)
     or school.id is null
     or row_data.dhoran is null
     or row_data.dhoran not in ('B', '1', '2')
     or row_data.name is null
     or btrim(row_data.name) = ''
     or row_data.gr_no is null
     or btrim(row_data.gr_no) = '';

  if invalid_row_count > 0 then
    raise exception 'One or more import rows failed validation.' using errcode = '22023';
  end if;

  with parsed_rows as (
    select
      school.id as school_id,
      row_data.dhoran,
      btrim(row_data.name) as name,
      btrim(row_data.gr_no) as gr_no,
      coalesce(btrim(row_data.gender), '') as gender,
      coalesce(btrim(row_data.section), '') as section,
      item.ordinality
    from jsonb_array_elements(p_rows) with ordinality as item(value, ordinality)
    cross join lateral jsonb_to_record(item.value) as row_data(
      school_code text,
      dhoran text,
      name text,
      gr_no text,
      gender text,
      section text
    )
    join public.schools as school
      on btrim(school.code) = btrim(row_data.school_code)
     and school.active
  ),
  unique_rows as (
    select distinct on (school_id, gr_no)
      school_id,
      dhoran,
      name,
      gr_no,
      gender,
      section
    from parsed_rows
    order by school_id, gr_no, ordinality
  ),
  new_rows as (
    select
      row_data.school_id,
      row_data.dhoran,
      row_data.name,
      row_data.gr_no,
      row_data.gender,
      row_data.section
    from unique_rows as row_data
    where not exists (
      select 1
      from public.students as existing
      where existing.school_id = row_data.school_id
        and (
          existing.student_id = row_data.gr_no
          or existing.reg = row_data.gr_no
        )
    )
  ),
  inserted_rows as (
    insert into public.students (
      school_id,
      dhoran,
      name,
      reg,
      student_id,
      gender,
      section
    )
    select
      row_data.school_id,
      row_data.dhoran,
      row_data.name,
      row_data.gr_no,
      row_data.gr_no,
      row_data.gender,
      row_data.section
    from new_rows as row_data
    on conflict (school_id, student_id)
      where student_id is not null and student_id <> ''
      do nothing
    returning id
  )
  select count(*)::integer
    into inserted_row_count
  from inserted_rows;

  return query
  select inserted_row_count, total_row_count - inserted_row_count;
end;
$$;

revoke all on function public.admin_import_students(text[], jsonb) from public;
revoke all on function public.admin_import_students(text[], jsonb) from anon;
grant execute on function public.admin_import_students(text[], jsonb) to authenticated;
