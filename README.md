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
