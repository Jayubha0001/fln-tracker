# FLN Tracker - Deploy commands + verification checklist
Production Supabase ref: nutnaymoiazrhhwgqlyv   (nothing is deployed yet; migration 202610150003 NOT to be run)

## 0. Pehla (project folder ma, PowerShell)
cd "D:\Nipun Gujarat Project\fln-tracker"
git status                       # tamara local changes joi lo; 6 files copy karya pehla compare karo
# ZIP ni 18 files copy karo (+ src\lib\currentMonth.js NAVI, category.js, App.jsx, ScopedDashboard.jsx, tests\currentMonth.test.js) (navo design + AdminPanel.jsx: src\components\DashboardLayout.jsx, src\components\DashboardOverview.jsx (NAVI), src\pages\AdminDashboard.jsx, src\index.css): src\pages\ScopedDashboard.jsx, src\pages\Students.jsx,
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

## 5. Reset password = Admin@987 (code change nathi; server secret)
supabase secrets set ADMIN_TEMPORARY_PASSWORD='Admin@987' --project-ref nutnaymoiazrhhwgqlyv
# Check (value batavto nathi): supabase secrets list --project-ref nutnaymoiazrhhwgqlyv
# Secret na hoy to reset ma lambo random password aave chhe. Reset pachhi first login par password badalvo ferajiyat.
# Real account reset karya vagar test: test account par j reset karo.

## 6. School add/remove (District/Block) - NAVU function, migration nathi joitu
supabase functions deploy scoped-school-management --project-ref nutnaymoiazrhhwgqlyv
# Frontend pehla aa function deploy thavi joiye; nahi to District/Block ma "શાળા ઉમેરો/કાઢો" error aapse.
# "કાઢો" = school nishkriy (active=false). Students/entries delete thata nathi. Admin mate direct update (RLS) vaparay chhe.

## 7. ADMIN_TEMPORARY_PASSWORD kya set karvo
Option A (terminal): project folder ma PowerShell kholo -> supabase login -> supabase link --project-ref nutnaymoiazrhhwgqlyv -> command chalavo.
Option B (dashboard): supabase.com/dashboard -> project nutnaymoiazrhhwgqlyv -> Edge Functions -> Secrets (Manage secrets) -> Name: ADMIN_TEMPORARY_PASSWORD, Value: Admin@987 -> Save.

## 8. FINAL DEPLOY ORDER (Vercel sudhdha) - Supabase Edge Functions pehla, pachhi Vercel
cd "D:\Nipun Gujarat Project\fln-tracker"
npm ci ; npm run build ; npm run lint ; npm test ; git diff --check
supabase login
supabase link --project-ref nutnaymoiazrhhwgqlyv
supabase functions deploy admin-scoped-account-management --project-ref nutnaymoiazrhhwgqlyv   # State Admin fallback
supabase functions deploy admin-import-schools --project-ref nutnaymoiazrhhwgqlyv              # District/Block Excel import (admin path badlyo nathi)
supabase functions deploy scoped-school-management --project-ref nutnaymoiazrhhwgqlyv          # NAVU: add / remove
supabase secrets set ADMIN_TEMPORARY_PASSWORD='Admin@987' --project-ref nutnaymoiazrhhwgqlyv
# Dashboard > Edge Functions ma 7 functions dekhava joiye (scoped-school-management navu).
# Pachhi frontend: vercel deploy (preview test) -> vercel deploy --prod
# Migration 202610150003 haju NA chalavo (District/Block account list mate alag approval).
# Verify checklist:
[ ] State Admin: School Management ma Import / Add / Remove(search) kaam kare
[ ] District login: potana district ni j shala search ma aave; bija district ni nahi
[ ] District: Excel import ma potana district ni shala j add thay; bahar ni rows invalid
[ ] Block login: fakt potana block ni shala
[ ] "Kaado" pachhi shala dropdown/list mathi jati rahe; students/entries data khoyo nathi
