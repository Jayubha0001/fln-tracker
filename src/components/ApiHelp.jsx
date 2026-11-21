import { useState } from 'react';

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-block">
      <pre>{text}</pre>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '✔ Copied' : 'Copy'}</button>
    </div>
  );
}

// Programmatic school / student add: kyarey badhu ek jagya e (curl + CLI).
export default function ApiHelp({ supabase }) {
  const base = String(supabase.supabaseUrl || import.meta.env?.VITE_SUPABASE_URL || 'https://<project-ref>.supabase.co').replace(/\/$/, '');
  const curl = `# 1) Login -> access_token (School/Block/District ID ke Admin email)
curl -s -X POST "${base}/auth/v1/token?grant_type=password" \\
  -H "apikey: <PUBLISHABLE_KEY>" -H "Content-Type: application/json" \\
  -d '{"email":"<login email>","password":"<password>"}'

# 2) Vidyarthi add (max 500 / call)
curl -s -X POST "${base}/functions/v1/fln-api" \\
  -H "Authorization: Bearer <access_token>" -H "apikey: <PUBLISHABLE_KEY>" -H "Content-Type: application/json" \\
  -d '{"action":"add-students","schoolCode":"24280101102","students":[{"name":"AMIT KUMAR","class":"1","reg":"101"}]}'

# 3) Shala add
curl -s -X POST "${base}/functions/v1/fln-api" \\
  -H "Authorization: Bearer <access_token>" -H "apikey: <PUBLISHABLE_KEY>" -H "Content-Type: application/json" \\
  -d '{"action":"add-school","code":"24280101999","name":"NEW SCHOOL","cluster":"C1"}'`;
  const cli = `# Project folder ma (PowerShell)
$env:FLN_LOGIN="24280101102"      # School / Block / District ID ke admin email
$env:FLN_PASSWORD="********"
npm run fln-api -- add-students --school 24280101102 --file students.csv   # csv: name,class,reg
npm run fln-api -- add-school --code 24280101999 --name "NEW SCHOOL"
npm run fln-api -- list-students --school 24280101102`;
  return (
    <div className="card api-help">
      <p className="muted">
        કોઈ પણ software/script માંથી શાળા કે વિદ્યાર્થી ઉમેરવા માટે API. Login ના જ અધિકાર મુજબ કામ કરે છે (District → પોતાનો જિલ્લો, Block → પોતાનો બ્લોક, School → પોતાની શાળા).
        <br />
        API to add schools / students from any software or script. It works with your own login rights (District → own district, Block → own block, School → own school).
      </p>
      <h4>curl</h4>
      <CopyBlock text={curl} />
      <h4>CLI (tools/fln-api.mjs)</h4>
      <CopyBlock text={cli} />
      <p className="muted">Class: <code>B</code>/<code>1</code>/<code>2</code> (અથવા Balvatika, Std 1, ધોરણ 1…). Duplicate (same name + class, ke same register no.) skip thay chhe. Full guide: <code>docs/API.md</code>.</p>
    </div>
  );
}
