alter table public.entries
  add column if not exists assessment_date date;

do $$
declare
  primary_key_name text;
  primary_key_columns text[];
begin
  select constraint_row.conname,
         array_agg(attribute_row.attname order by key_column.ordinality)
    into primary_key_name, primary_key_columns
  from pg_constraint as constraint_row
  join unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
    on true
  join pg_attribute as attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
   and attribute_row.attnum = key_column.attnum
  where constraint_row.conrelid = 'public.entries'::regclass
    and constraint_row.contype = 'p'
  group by constraint_row.conname;

  if primary_key_columns is distinct from array['student_id', 'month', 'dhoran'] then
    execute 'create unique index if not exists entries_student_month_dhoran_uidx on public.entries (student_id, month, dhoran)';

    if primary_key_name is not null then
      execute format('alter table public.entries drop constraint %I', primary_key_name);
    end if;

    alter table public.entries
      add constraint entries_pkey
      primary key using index entries_student_month_dhoran_uidx;
  end if;
end
$$;

create index if not exists entries_school_updated_grade_month_idx
  on public.entries (school_id, updated_at desc, dhoran, month);

create index if not exists entries_school_assessment_grade_month_idx
  on public.entries (school_id, assessment_date, dhoran, month);

create index if not exists entries_month_grade_school_idx
  on public.entries (month, dhoran, school_id);

create index if not exists students_grade_school_id_idx
  on public.students (school_id, dhoran, id);

create index if not exists schools_district_block_id_idx
  on public.schools (district, block, id);

create table if not exists public.school_password_reset_audit (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  result text not null check (result in ('success', 'failed')),
  detail_code text
);

create index if not exists school_password_reset_audit_school_time_idx
  on public.school_password_reset_audit (school_id, attempted_at desc);

create index if not exists school_password_reset_audit_actor_time_idx
  on public.school_password_reset_audit (actor_id, attempted_at desc);

alter table public.school_password_reset_audit enable row level security;

drop policy if exists "Admins read school password reset audit"
  on public.school_password_reset_audit;
create policy "Admins read school password reset audit"
  on public.school_password_reset_audit for select to authenticated
  using (public.is_admin());

revoke all on public.school_password_reset_audit from public, anon;
grant select on public.school_password_reset_audit to authenticated;
grant select, insert on public.school_password_reset_audit to service_role;
grant usage, select on sequence public.school_password_reset_audit_id_seq to service_role;
