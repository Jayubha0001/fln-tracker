# FLN API – શાળા / વિદ્યાર્થી ઉમેરવા માટે (School / Student API)

Endpoint: `POST https://<project-ref>.supabase.co/functions/v1/fln-api`  (JWT verify chalu)

Aa API tamara **login na adhikar** mujab j kaam kare chhe (server par scope check, ane database RLS):
| Login | Shu kari shake |
|---|---|
| Admin | Badhi shala / vidyarthi |
| District (4 ank) | Potana jilla ni shala add, shala ma vidyarthi add |
| Block (6 ank) | Potana block ni shala add, shala ma vidyarthi add |
| School (11 ank) | Fakt potani shala ma vidyarthi add / list |

## 1. Token (login)
```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
headers: apikey: <PUBLISHABLE_KEY>, Content-Type: application/json
body: {"email": "<login email>", "password": "<password>"}
```
Login email: Admin = real email · School = `school-<11 ank ID>@<project-ref>.supabase.co` · Block = `block-<6 ank>@<project-ref>.supabase.co` · District = `district-<4 ank>@<project-ref>.supabase.co`.
Response ma `access_token` male chhe (1 kalak chale). **Token / password kyarey share na karo.**

## 2. Calls (badha `POST /functions/v1/fln-api`, headers: `Authorization: Bearer <access_token>`, `apikey: <PUBLISHABLE_KEY>`)
| action | Body | Notes |
|---|---|---|
| `whoami` | `{ "action": "whoami" }` | role ane scope |
| `add-students` | `{ "action":"add-students", "schoolCode":"24280101102", "students":[{"name":"AMIT KUMAR","class":"1","reg":"101"}] }` | max **500** / call; `class` = `B`, `1`, `2` (Balvatika / Std 1 / ધોરણ 1 pan chale); duplicate (same name+class ke same reg) skip |
| `list-students` | `{ "action":"list-students", "schoolCode":"…", "class":"1", "page":1, "pageSize":200 }` | pageSize max 500 |
| `add-school` | `{ "action":"add-school", "code":"24280101999", "name":"NEW SCHOOL", "cluster":"C1", "district":"Botad", "block":"BARVALA" }` | district/block e block ma shala hoy to automatic; Admin pahli shala mate names aape |
| `add-schools` | `{ "action":"add-schools", "schools":[{…}, …] }` | max **200** / call |
| `list-schools` | `{ "action":"list-schools", "district":"Botad", "block":"BARVALA", "page":1 }` | |

Response (add-students): `{ school, summary:{added,duplicate,invalid,failed}, results:[{row,status,reason}], failed:[] }`.
Status codes: 200 ok · 400 khotu action/body · 401 token khotu · 403 adhikar nathi · 404 shala nathi/scope ni bahar · 409 duplicate/inactive · 422 data khotu.

## 3. CLI (tools/fln-api.mjs)
```
$env:FLN_LOGIN="24280101102"; $env:FLN_PASSWORD="********"
npm run fln-api -- whoami
npm run fln-api -- add-students --school 24280101102 --file students.csv      # csv header: name,class,reg
npm run fln-api -- add-school --code 24280101999 --name "NEW SCHOOL"
npm run fln-api -- add-schools --file schools.csv                              # csv header: code,name,cluster,district,block
npm run fln-api -- list-students --school 24280101102 --class 1
```
Result details `fln-api-result.json` ma save thay chhe.

## 4. Badhi Edge Functions chalu karva
```
npx supabase login
npx supabase link --project-ref <project-ref>
$env:ADMIN_TEMPORARY_PASSWORD="Admin@987"     # optional
npm run deploy:functions                       # badhi functions deploy + secret + check
npm run check:functions                        # fakt check (koi data nathi badlato)
```
App ma: Admin → School Management → **System / Functions Status** → "Check functions".
