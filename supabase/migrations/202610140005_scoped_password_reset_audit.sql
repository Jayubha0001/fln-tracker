create table if not exists public.scoped_password_reset_audit (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('district', 'block')),
  district_code text not null check (district_code ~ '^[0-9]{4}$'),
  block_code text,
  attempted_at timestamptz not null default now(),
  result text not null check (result in ('success', 'failed')),
  detail_code text,
  constraint scoped_password_reset_audit_scope_check check (
    (role = 'district' and block_code is null)
    or (role = 'block' and block_code ~ '^[0-9]{6}$'
      and left(block_code, 4) = district_code)
  )
);

create index if not exists scoped_password_reset_audit_scope_time_idx
  on public.scoped_password_reset_audit (role, district_code, block_code, attempted_at desc);

create index if not exists scoped_password_reset_audit_actor_time_idx
  on public.scoped_password_reset_audit (actor_id, attempted_at desc);

alter table public.scoped_password_reset_audit enable row level security;

drop policy if exists "Admins read scoped password reset audit"
  on public.scoped_password_reset_audit;
create policy "Admins read scoped password reset audit"
  on public.scoped_password_reset_audit for select to authenticated
  using (public.is_admin());

revoke all on public.scoped_password_reset_audit from public, anon;
grant select on public.scoped_password_reset_audit to authenticated;
grant select, insert on public.scoped_password_reset_audit to service_role;
grant usage, select on sequence public.scoped_password_reset_audit_id_seq to service_role;

notify pgrst, 'reload schema';
