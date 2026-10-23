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

## 9. Navu (dashboard/entry): school status, back button, column tick
Files: src\pages\AdminDashboard.jsx, src\pages\Entry.jsx, src\components\DashboardOverview.jsx, src\index.css
- School status (કુલ / એન્ટ્રી શરૂ / પૂર્ણ / અધૂરી / બાકી શાળા + બાકી શાળાઓ ni yadi) Admin, District, Block ma
- Table ma "શાળા" ane "બાકી શાળા" columns (District ane Block level)
- "← પાછા" button table ni header + niche + school student list ma
- Entry grid: badha students ma ✓ hoy to "આખી કૉલમ ભરો" ni ✓ lili (selected) dekhay; pharithi dabavo to column khali
- Navi RPC/migration nathi joiti (fln_group_stats ('school') j vaparyu)

## 10. Entry: "બધા ✓ પહેલેથી પસંદ" (default all yes)
Files: src\pages\Entry.jsx, src\index.css
- Je vidyarthi ni e mahina ni entry nathi, temna badha vidhan pahelethi ✓ dekhay; khota hoy te j ✗ karo
- "એન્ટ્રી સાચવો" dabavta confirm puchhay; pachhi te badha vidyarthi ni entry save thay
- Checkbox thi band kari shakay (browser ma yaad rahe chhe); jyare band hoy to junu khali grid
- Jemni entry pehla thi save chhe temna answers badlata nathi

## 11. Navu: tapas tab, bulk login, table layout, Summary samjutti
Files: src\components\DataCheck.jsx (NAVI), src\components\SummaryHelp.jsx (NAVI), src\pages\Summary.jsx, SchoolSummary.jsx,
       AdminPanel.jsx, ScopedDashboard.jsx, AdminScopedAccountManagement.jsx, src\index.css
- "🔎 તપાસ" panel: School ane Student Management ma (Admin/District/Block) - vidyarthi vagar ni shala + shala vagar na vidyarthi
- Login & Password: "⚡ બધા Missing Login એક સાથે બનાવો" (50-50 batch; create-school-account / create-scoped-account deploy thayela hova joiye)
- Table: District/Block ek line ma, center, navu colour; buttons ek line ma
- Summary & Analytics: Admin = samagra rajya, District = potano jillo, Block = potano block, School = potani shala; sathe saral bhasha ma sar + "kevi rite vanchvu" guide
- Navi migration/function nathi joitu

## 12. Navu: ગેરહાજર option, Summary filters, shala-vaar vidyarthi ginti
Files: src\lib\absent.js (NAVI), src\pages\Entry.jsx, AdminDashboard.jsx, Summary.jsx, SchoolSummary.jsx, AdminPanel.jsx,
       src\components\DataCheck.jsx, SummaryHelp.jsx, src\index.css
- Entry (Grid / વિધાન પ્રમાણે / વિદ્યાર્થી પ્રમાણે): darek vidyarthi ni baju "☐ ગેરહાજર"; tick karo to aakhi line blank/grey, answers = {absent:'yes'}
  (boolean nathi etle server reports/SQL ne asar nathi; dashboard ma te "એન્ટ્રી" tarike ganay, U/P/N ma nahi, "બાકી" ma nahi)
- Summary & Analytics (Admin): upar nu single-shala selector kadhyu; District -> Block -> School (ane "બધી શાળાઓ") filters
- તપાસ: shala-vaar vidyarthi sankhya table, 0 vidyarthi lal; filter (બધી / 0 / વિદ્યાર્થી છે) + Excel
- Navi migration/function nathi joitu

## 13. ગેરહાજર badha count ma + sort
Files: src\pages\AdminDashboard.jsx, src\components\DashboardOverview.jsx, src\pages\Summary.jsx, src\pages\SchoolSummary.jsx, src\index.css
- Dashboard (Admin/District/Block/School): ગેરહાજર KPI, donut ma alag segment, ધોરણ cards ane unit table ma "ગેરહાજર" column
  Total = ઉદયમાન + પ્રગતિશીલ + નિપુણ + અપૂર્ણ + ગેરહાજર (= એન્ટ્રી) + બાકી (= રજિસ્ટર)
- Summary: shala sarkhaman table ma columns: નોંધાયેલા, એન્ટ્રી, પૂર્ણ, અપૂર્ણ, ગેરહાજર, બાકી; darek header par ▲▼ sort; Excel ma pan
- ગેરહાજર ni ginti entries (answers->>absent = 'yes') thi client side; navi migration nathi joitu
- Server-side Excel/PDF reports (admin-reports function) ma absent haju alag column nathi (e function ma farak joiye to kaho)

## 14. BLANK SCREEN FIX (localhost)
Kaaran: src\pages\AdminDashboard.jsx ma `absentByGroup` pehla vaparyu ane pachhi declare thayu ("Cannot access 'absentByGroup' before initialization").
Fix: AdminDashboard.jsx (memo upar lai gaya) + src\main.jsx ane src\components\ErrorBoundary.jsx (have blank na badle error sandesh dekhay)
Optional smoke test (browser vagar badhi screens render kare): npm i -D jsdom fake-indexeddb ; node tools\smoke.mjs
Khare ghale: Ctrl+C -> npm run dev -> browser ma Ctrl+Shift+R
