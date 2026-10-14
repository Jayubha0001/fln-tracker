alter table public.entries
  add column if not exists assessment_date date;

create index if not exists entries_school_assessment_grade_month_idx
  on public.entries (school_id, assessment_date, dhoran, month);

notify pgrst, 'reload schema';
