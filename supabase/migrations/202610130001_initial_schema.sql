create extension if not exists pgcrypto;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  district text not null,
  block text not null,
  cluster text not null default '',
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'school')),
  school_id uuid references public.schools(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_school_check check (
    (role = 'admin' and school_id is null) or
    (role = 'school' and school_id is not null)
  )
);

create unique index profiles_one_account_per_school
  on public.profiles(school_id)
  where role = 'school';

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  dhoran text not null check (dhoran in ('B', '1', '2')),
  name text not null,
  reg text not null default '',
  student_id text,
  gender text not null default '',
  section text not null default '',
  legacy_id text,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, legacy_id)
);

create unique index students_school_student_id
  on public.students(school_id, student_id)
  where student_id is not null and student_id <> '';

create index students_school_dhoran_name
  on public.students(school_id, dhoran, name);

create table public.entries (
  student_id uuid not null,
  school_id uuid not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  dhoran text not null check (dhoran in ('B', '1', '2')),
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (student_id, month),
  foreign key (student_id, school_id)
    references public.students(id, school_id)
    on delete cascade
);

create index entries_school_dhoran_month
  on public.entries(school_id, dhoran, month);

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  join public.schools s on s.id = p.school_id and s.active
  where p.id = (select auth.uid())
    and p.role = 'school'
    and p.active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.active
  )
$$;

revoke all on function public.current_school_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.entries enable row level security;

create policy "Admins manage schools"
  on public.schools for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users read their school"
  on public.schools for select to authenticated
  using (id = (select public.current_school_id()));

create policy "Admins manage profiles"
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Admins manage students"
  on public.students for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "School users manage their students"
  on public.students for all to authenticated
  using (school_id = (select public.current_school_id()))
  with check (school_id = (select public.current_school_id()));

create policy "Admins manage entries"
  on public.entries for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "School users manage their entries"
  on public.entries for all to authenticated
  using (school_id = (select public.current_school_id()))
  with check (school_id = (select public.current_school_id()));

grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
