# FLN Tracker - Deploy commands + verification checklist
Production Supabase ref: nutnaymoiazrhhwgqlyv   (nothing is deployed yet; migration 202610150003 NOT to be run)

## 0. Pehla (project folder ma, PowerShell)
cd "D:\Nipun Gujarat Project\fln-tracker"
git status                       # tamara local changes joi lo; 6 files copy karya pehla compare karo
# ZIP ni 11 files copy karo (navo design + AdminPanel.jsx: src\components\DashboardLayout.jsx, src\components\DashboardOverview.jsx (NAVI), src\pages\AdminDashboard.jsx, src\index.css): src\pages\ScopedDashboard.jsx, src\pages\Students.jsx,
# supabase\functions\_shared\scopedAccountManagement.js,
# supabase\functions\admin-scoped-account-management\index.ts,
# tests\scopedAccountManagement.test.js, tests\scopedStudentsWiring.test.js
npm ci
npm run build
npm run lint
npm test
git diff --check

## 1. Edge Function (fakt aa ek) - JWT verification chalu rakhvu (--no-verify-jwt vaparvu nahi)
supabase login
supabase link --project-ref nutnaymoiazrhhwgqlyv
supabase functions list
supabase functions deploy admin-scoped-account-management --project-ref nutnaymoiazrhhwgqlyv

## 2. State Admin verification (browser, State Admin login)
[ ] Login & Password Management khule chhe
[ ] District Logins list load thay chhe (rows + total)
[ ] Block Logins ane School Logins list load thay chhe
[ ] Search/filter, status filter ane pagination (next/prev) kaam kare chhe
[ ] Koi HTTP 403/503 ke "response shape mismatch" error nathi
[ ] Real password reset NA karo; fakt list jovi
Fail thay to: Supabase Dashboard > Edge Functions > admin-scoped-account-management > Logs jovo ane mane error moklo.

## 3. Frontend (fakt step 2 pass thaya pachhi)
vercel deploy            # preview URL male chhe; pehla aa test karo
[ ] Preview ma State Admin login, dashboard, Reports, School login thi Students tab kaam kare chhe
vercel deploy --prod     # preview ok thay pachhi j; URL/status note karo
[ ] https://fln-tracker-six.vercel.app par hard refresh pachhi pharithi check

## 4. Pending (approval vagar nahi)
- Migration 202610150003_scoped_account_management.sql: pehla review + approval, pachhi staging/backup sathe apply
- District/Block account listing ane Students page live test (District/Block test login joiye)
- Commit/push, real password reset: tamari approval pachhi j
