// FLN API client: school / vidyarthi add karva (JSON ke CSV file thi).
//
//   $env:FLN_LOGIN="24280101102"        # School ID (11) / Block ID (6) / District ID (4) / admin email
//   $env:FLN_PASSWORD="********"
//   node tools/fln-api.mjs whoami
//   node tools/fln-api.mjs add-students --school 24280101102 --file students.csv     (csv: name,class,reg)
//   node tools/fln-api.mjs add-students --school 24280101102 --file students.json    ([{"name":"..","class":"1","reg":"12"}])
//   node tools/fln-api.mjs add-school --code 24280101999 --name "NEW SCHOOL" [--cluster C1] [--district Botad --block BARVALA]
//   node tools/fln-api.mjs add-schools --file schools.csv                            (csv: code,name,cluster,district,block)
//   node tools/fln-api.mjs list-students --school 24280101102 [--class 1]
//   node tools/fln-api.mjs list-schools [--district Botad] [--block BARVALA]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, supabaseConfig } from './lib.mjs';
import { scopedAuthEmail, schoolAuthEmail } from '../src/lib/schoolLogin.js';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) options[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  }
  return { command, options };
}

function readRows(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return file.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
}

async function login(url, key) {
  const id = process.env.FLN_LOGIN;
  const password = process.env.FLN_PASSWORD;
  if (!id || !password) throw new Error('FLN_LOGIN ane FLN_PASSWORD environment variable set karo.');
  const email = id.includes('@') ? id : /^\d{11}$/.test(id) ? schoolAuthEmail(id, url) : scopedAuthEmail(id, url);
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Login failed: ${data.error_description || data.msg || response.status}`);
  return data.access_token;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help') { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n').replace(/^\/\/ ?/gm, '')); return; }
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('.env.local ma VITE_SUPABASE_URL ane VITE_SUPABASE_PUBLISHABLE_KEY joiye.');
  const token = await login(url, key);
  const call = async (body) => {
    const response = await fetch(`${url}/functions/v1/fln-api`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  let request;
  if (command === 'whoami') request = { action: 'whoami' };
  else if (command === 'add-school') request = { action: 'add-school', code: options.code, name: options.name, cluster: options.cluster, district: options.district, block: options.block };
  else if (command === 'add-schools') request = { action: 'add-schools', schools: readRows(options.file) };
  else if (command === 'add-students') request = { action: 'add-students', schoolCode: options.school, students: readRows(options.file) };
  else if (command === 'list-students') request = { action: 'list-students', schoolCode: options.school, ...(options.class ? { class: options.class } : {}) };
  else if (command === 'list-schools') request = { action: 'list-schools', ...(options.district ? { district: options.district } : {}), ...(options.block ? { block: options.block } : {}) };
  else throw new Error(`Unknown command: ${command}`);

  // add-students: 500 / call -> chunk
  if (command === 'add-students' && request.students.length > 500) {
    const all = []; const summary = { added: 0, duplicate: 0, invalid: 0, failed: 0 };
    for (let start = 0; start < request.students.length; start += 500) {
      const { status, data } = await call({ ...request, students: request.students.slice(start, start + 500) });
      if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
      for (const k of Object.keys(summary)) summary[k] += data.summary[k] || 0;
      all.push(...data.results.map((r) => ({ ...r, row: r.row + start })));
    }
    writeFileSync('fln-api-result.json', JSON.stringify({ summary, results: all }, null, 2));
    console.log('Summary:', summary, '\nDetails: fln-api-result.json');
    return;
  }
  const { status, data } = await call(request);
  if (data.results) writeFileSync('fln-api-result.json', JSON.stringify(data, null, 2));
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(data.summary ? { school: data.school, summary: data.summary, failed: data.failed } : data, null, 2).slice(0, 4000));
  if (data.results) console.log('Details: fln-api-result.json');
  if (status >= 400) process.exitCode = 1;
}

main().catch((cause) => { console.error(cause.message); process.exit(1); });
