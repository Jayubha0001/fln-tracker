alter table public.schools
  add column if not exists cluster_id text not null default '';

comment on column public.schools.cluster_id is
  'Source ClusterId identifier from school imports; distinct from the human-readable cluster name.';

create index if not exists schools_code_prefix_idx
  on public.schools (left(code, 6), left(code, 4));

notify pgrst, 'reload schema';
