# FLN Tracker

React + Vite FLN Maths Tracker using Supabase Authentication and PostgreSQL.

## Supabase setup

1. Create a Supabase project and install the Supabase CLI.
2. Confirm the initial schema migration
   `supabase/migrations/202610130001_initial_schema.sql` is present in the
   project's database. If `public.profiles` is missing from the API schema
   cache, check **Database → Tables** first. Apply the initial migration only
   if its tables are not already present; if they exist, reload the PostgREST
   schema cache instead of replaying table-creation SQL.

   Do not reset the database or replay the initial migration over existing data.

3. In Supabase Authentication, disable public sign-ups. The app deliberately has
   no public registration flow.
4. Create the first administrator from **Authentication → Users** in the
   Supabase Dashboard. Copy that user's UUID and email, then run this once in
   the SQL Editor:

   ```sql
   insert into public.profiles (id, email, role, school_id, active)
   values ('AUTH_USER_UUID', 'admin@example.org', 'admin', null, true);
   ```

   Do not expose SQL editor credentials or service-role credentials to app users.
5. Before applying school first-login support, confirm `public.profiles`,
   `auth.users`, and the initial schema are present. In the Supabase Dashboard
   SQL Editor, review and run the complete contents of
   `supabase/migrations/202610130003_school_first_login_password.sql`. It adds
   the `must_change_password` profile column and a trigger that clears it only
   when the Auth password hash changes. The accompanying function verifies
   completion. This migration does not delete or reset application data. Do not
   run it against Production until an authorized operator has reviewed and
   approved the change.

   Then deploy the account-provisioning Edge Function to the same project as
   the app's `VITE_SUPABASE_URL`:

   From the repository root, link and deploy to the project configured in
   `.env.local` (confirm the Vercel `VITE_SUPABASE_URL` uses this same project
   first):

   ```powershell
   supabase login
   supabase link --project-ref nutnaymoiazrhhwgqlyv
   supabase functions deploy create-school-account --project-ref nutnaymoiazrhhwgqlyv
   supabase functions list --project-ref nutnaymoiazrhhwgqlyv
   ```

   Its deployed name must be exactly `create-school-account`. The project
   reference above is derived from the repository's current `.env.local`;
   replace it only if Vercel is intentionally configured for another project.
   The function verifies the caller's JWT and Admin profile before provisioning.
   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as
   server-side function secrets in the usual project setup. If function logs
   explicitly report these missing, configure them only in Supabase Edge
   Function secrets; never put the service-role key in a Vite variable, browser
   bundle, or Vercel `VITE_` variable.
   Admins can create all missing active-school accounts at once. School ID is
   the login ID; each school gets a unique random one-time password that must
   be changed before its dashboard opens. Credentials are shown once and can
   be downloaded as a sensitive CSV for secure, per-school delivery. These
   generated accounts use non-mailbox synthetic Auth emails, so password
   reset by email is unavailable; an Admin must reset credentials through the
   Supabase Dashboard. Do not change a school's School ID after provisioning
   its account because that ID is the login mapping.
   Before any account-creation retry, verify that the Vercel
   `VITE_SUPABASE_URL` points to the project where the function is deployed.
   Test one school first. The function checks existing Auth users and matching
   school profiles before creating anything; an Auth-only or inconsistent
   profile is reported for manual reconciliation and is never overwritten.
   In Supabase, verify the deployed function under **Edge Functions** and
   review its invocation logs. A non-mutating `OPTIONS` request should return
   success with CORS headers, while an unauthenticated `POST` should return
   `401` when `verify_jwt` is enabled. A `404` means the function is not
   available at that project URL.
6. `.env.local` is already set to this project's URL. Replace the
   `YOUR_SUPABASE_PUBLISHABLE_KEY` placeholder in
   `VITE_SUPABASE_PUBLISHABLE_KEY` with the project's **Publishable key** from
   **Project Settings → API Keys**. Never use a Secret key or
   service-role key in any `VITE_` variable; Vite embeds those values in the
   browser bundle. These public keys do not replace Row Level Security.
7. Start the app with `npm run dev`. The administrator can add schools by
   district/taluka, then bulk-create logins for active schools that do not yet
   have an account. School codes used as Login IDs must be exactly 11 digits.
   The Admin Panel also allows selecting a school to manage
   its students, assessment entries, and reports. Share each one-time password
   securely with only its school.

## School student import

The School Dashboard's **Excel માંથી વિદ્યાર્થીઓ ઉમેરો** flow accepts `.xlsx`,
`.xls`, and `.csv` files. It requires `SchoolId`, `StudentName`, and
`StudyingClass`; father/surname are appended to the student name, while
`GRNo`, `Gender`, and `Section` are used when present. Every SchoolId must
exactly match the logged-in school's code. AadhaarUID is ignored. Preview
reports invalid SchoolIds, class/name errors, and duplicate GRNos before
confirmation. Inserts use the authenticated school profile's `school_id`, and
the existing `students` RLS policy enforces that school scope in PostgreSQL.
Rows are inserted in batches; results include success, duplicate, and failed
row counts, and validation/database errors can be downloaded as CSV.

## Admin student import

The Admin Panel accepts Excel and CSV files with school code, student name,
class, and GRNo columns. It matches SchoolId to `schools.code` only (never by
school name), previews duplicates and unmatched schools, and excludes
unsupported classes. Aadhaar fields are not mapped, stored, displayed, or
logged.

The import sends all matched schools with new, valid records in one atomic
transaction. Review the full preview and confirm before importing. It uses the
existing `students` fields: the displayed student name joins StudentName,
FatherName, and SurName; GRNo is saved as both `reg` and the school-scoped
`student_id`; class, gender, and section map to their existing columns.
ClusterId is not stored, and the existing school's cluster name is unchanged.

Before import is enabled, review
`supabase/migrations/202610130002_admin_student_import.sql`. It adds an
Admin-checked PostgreSQL RPC for one atomic import transaction and does not
delete or reset data. Apply it manually only after confirming the initial
schema and reviewing the SQL. It is not run automatically by the app.

## FLN entries and reports

Assessment entries are stored in `public.entries`: `school_id` identifies the
school, `student_id` the student, `dhoran` the grade, `month` the assessment
period (`YYYY-MM`), and `answers` the statement-number-to-boolean JSON object.
The initial schema's primary key is `(student_id, month)`. Migration
`202610140001_admin_reporting_and_password_audit.sql` safely changes it to
`(student_id, month, dhoran)`, so one student can have a separate entry for
Balvatika/Standard 1/Standard 2 in a month. There is still one entry per
student, grade, and month: separate assessment types or multiple assessment
dates in that same month are not distinct records. Re-saving that key updates
the existing row. Historical assessment dates remain `NULL` because the old
`updated_at` save time cannot establish the original assessment date.
School entry access remains restricted by the existing `current_school_id()`
RLS policy; Admin access uses `is_admin()`.

Admins, School users, District and Block accounts can download a per-school
2026/27 FLN Action Plan workbook. It contains a month-by-month matrix and
separate Balvatika, Standard 1, and Standard 2 sheets. A category is assigned
only when every outcome for that grade has a yes/no answer. Udayman,
Pragatisheel, and Nipun thresholds use the existing FLN rules. Counts are
students and percentages use that grade's enrolled count; incomplete and
pending students are shown separately and are not included in a category.
June 2026 is included as a reportable month, although the current Entry selector
starts in July.

The Entry grid now keeps edits as an unsaved draft until **એન્ટ્રી સાચવો** is
clicked. It reports confirmed saved-row counts and individual row errors,
loads stored answers when a school/grade/month is reopened, and warns before
leaving with unsaved changes. The Summary tab separates Balvatika, Standard 1,
and Standard 2, filters by school/grade/month, and exports grade, school,
student, and skill sheets to Excel. Admins can use **તમામ શાળાઓનો સારાંશ** in
the Admin Panel. Its **દિવસવાર એન્ટ્રી રિપોર્ટ** and Excel export are served by
an Admin-authorized Edge Function. Filters include a date range (up to 93
calendar days), exact school code, district, taluka, grade, and assessment
month. Date range filters use `updated_at` (last save timestamp), not
`assessment_date`; the export keeps these two fields separate. The synchronous
report is capped at 50,000 matching entries; use smaller date/month/grade/school
filters for larger ranges. For sustained exports beyond that cap, deploy a
background export/managed storage workflow and review Edge Function and
database capacity before 33,000-school rollout.

If the Admin report returns SQLSTATE `42703` naming
`public.entries.assessment_date`, the live database is missing the nullable
assessment-date column that the report exports separately from the `updated_at`
save timestamp. Review and apply
`supabase/migrations/202610140004_admin_report_assessment_date_compat.sql`
in the matching Supabase project's SQL Editor. It only adds the nullable
column/index if absent and reloads the PostgREST schema cache; it does not
backfill unknown historical assessment dates or change existing rows.

### Apply the Admin reporting migration and deploy functions

The application does not run migrations against Supabase. First back up the
production database and inspect the current `public.entries` primary key,
`profiles.must_change_password`, and the target Supabase project. The migration
adds nullable `entries.assessment_date`, a grade-aware unique key and report
indexes, and the password-reset audit table; it does not delete or rewrite
existing entries. Its `DO` block stops if existing data prevents the new key.
Historical dates intentionally stay `NULL`.

After reviewing each full SQL file, an authorized operator can apply the
migrations in order in **Supabase Dashboard → SQL Editor**: first
`202610140001_admin_reporting_and_password_audit.sql`, then
`202610140002_scoped_district_block_accounts.sql`, then
`202610140003_school_import_cluster_id.sql`, then
`202610140004_admin_report_assessment_date_compat.sql` if needed, then
`202610140005_scoped_password_reset_audit.sql` for District/Block account
management. Do not blindly replay the
initial schema migration. The second migration assumes School Code's first 4
digits are District Code and first 6 digits are Block Code. It preserves
existing Admin/School profiles, adds scoped read/write RLS for active schools,
and requires a one-time password change for new regional accounts. Confirm the
dashboard project ref is the same one used by Vercel's `VITE_SUPABASE_URL`.
Then deploy the functions from the repository root using Windows PowerShell:

```powershell
supabase login
supabase link --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy admin-reports --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy admin-school-password-reset --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy admin-scoped-account-management --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy create-scoped-account --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy admin-import-schools --project-ref nutnaymoiazrhhwgqlyv
supabase functions list --project-ref nutnaymoiazrhhwgqlyv
```

`supabase/config.toml` keeps `verify_jwt = true` for every listed function.
Admin-only functions independently verify the JWT and active Admin profile.
They require the standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Supabase Edge
Function secrets only; never set the service-role key in Vercel or a `VITE_`
variable. Password reset updates only the verified school Auth user, sets the
mandatory password-change flag after the Auth password update trigger runs,
records a password-free audit result, and returns its random temporary
credential only on a fully successful response. If the response is lost or
audit/flag setup fails, do not assume the password; verify Auth/profile/audit
state before any further reset.

The State Admin Panel's District/Block management lists prefix-derived areas,
compares each scoped profile with its Auth user, and labels missing, inactive,
first-password-change, and inconsistent accounts. Creation uses the existing
`create-scoped-account` function. Scoped password resets use the separate
Admin-authorized `admin-scoped-account-management` Edge Function and write
password-free audit events to `scoped_password_reset_audit`. The function
returns a temporary password only after Auth update, mandatory password-change
flag, and audit insertion all succeed. It does not reset credentials while
loading the management list.

The Admin Panel has a per-school **વાર્ષિક શાળા FLN Report** Excel button and a
District/Block account form. Login IDs are taken from school codes: District
uses four digits (for example `2428`) and Block uses six (`242801`). Those
users can edit student and entry data within their RLS-scoped active schools,
but cannot manage schools, profiles, or accounts. The `admin-reports` function
returns a specific database error; if it reports missing
`public.entries.assessment_date`, apply migration 001 above. Test one regional
account per level and confirm users cannot see/edit a school with another
prefix before issuing more logins.

### Importing schools

Migration `202610140003_school_import_cluster_id.sql` adds the `cluster_id`
text field for the source `ClusterId` identifier, separate from the existing
human-readable `cluster` name, without rewriting existing school data. It is
idempotent and asks PostgREST to reload its schema cache. If an import reports
that `cluster_id` is missing, first apply or rerun this migration in the correct
project's SQL Editor; it adds the column only if absent. If the column already
exists but the error continues, reload the schema cache with
`NOTIFY pgrst, 'reload schema';` and allow the API a short time to refresh.
The Admin Panel import accepts
Excel `.xlsx`/`.xls` and CSV files with `District`, `Block`, `ClusterId`,
`Cluster`, `SchoolId`, and `School` columns. Store SchoolId as text in Excel
when it has leading zeros. The browser preview sends bounded groups of at most
500 rows to `admin-import-schools`; server-side preview checks `schools.code`.
Import inserts only new codes using conflict-ignore semantics, never updates
an existing school's name, UUID, students, or entries. A retry preview marks
previously inserted codes as existing; after a partial import failure, run
Preview again before selecting Import, rather than resending the full file
without review. Admin school list is also paginated
(100 rows per page), rather than loading all schools into the browser.

Test with one filtered school/date range first. In Admin Panel, run the report,
check that `Assessment Date` may be blank for historical rows while `Saved At`
is populated, and download a small Excel export. Reset one test school only;
check that its active profile/Auth UUID match the selected school, the audit
row has no credential, and its next login requires password change. Do not
claim production migration, deployment, or live functionality until checked
against the intended Supabase project.

## Data access and existing offline data

`supabase/migrations/202610130001_initial_schema.sql` creates school, profile,
student, and monthly assessment tables with Row Level Security. School accounts
can only access their own active school's records; administrator access is
checked against the protected `profiles` table.

The existing Dexie database stays on the device. Once its school is configured
in Supabase, the school dashboard offers a one-time migration of that device's
students and FLN entries. It checks the legacy School ID, asks for confirmation,
and does not delete the local copy.

## Commands

- `npm run dev` — local development
- `npm run build` — production build
- `npm run lint` — Oxlint
