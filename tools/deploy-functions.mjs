// Badhi Edge Functions ek sathe deploy (+ optional secret) pachhi check.
//   npx supabase login        (ek var)
//   npm run deploy:functions
//   (optional) $env:ADMIN_TEMPORARY_PASSWORD="Admin@987"; npm run deploy:functions
import { spawnSync } from 'node:child_process';
import { functionNames, projectRef, ROOT } from './lib.mjs';

const ref = projectRef();
if (!ref) {
  console.error('Project ref maltu nathi. SUPABASE_PROJECT_REF set karo ya "npx supabase link --project-ref <ref>" karo.');
  process.exit(2);
}
const run = (args) => spawnSync('npx', ['supabase', ...args], { cwd: ROOT, stdio: 'inherit', shell: true });
console.log(`Project: ${ref}\nFunctions: ${functionNames().join(', ')}\n`);
const failed = [];
for (const name of functionNames()) {
  console.log(`\n=== deploy ${name} ===`);
  if (run(['functions', 'deploy', name, '--project-ref', ref, '--use-api']).status !== 0) failed.push(name);
}
if (process.env.ADMIN_TEMPORARY_PASSWORD) {
  console.log('\n=== secret ADMIN_TEMPORARY_PASSWORD ===');
  if (run(['secrets', 'set', `ADMIN_TEMPORARY_PASSWORD=${process.env.ADMIN_TEMPORARY_PASSWORD}`, '--project-ref', ref]).status !== 0) failed.push('secret');
} else {
  console.log('\n(Reset password secret set nathi karyu: $env:ADMIN_TEMPORARY_PASSWORD="Admin@987" mukine pharithi chalavo.)');
}
console.log('\n=== check ===');
const check = spawnSync('node', ['tools/check-functions.mjs'], { cwd: ROOT, stdio: 'inherit', shell: true });
if (failed.length) console.error(`\nFail thayela: ${failed.join(', ')}`);
process.exit(failed.length || check.status ? 1 : 0);
