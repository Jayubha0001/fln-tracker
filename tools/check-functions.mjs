// Check: badha Edge Functions deploy thaya chhe ke nahi (OPTIONS request: koi data/side-effect nathi).
//   npm run check:functions
import { functionNames, supabaseConfig } from './lib.mjs';

const { url, key } = supabaseConfig();
if (!url) {
  console.error('VITE_SUPABASE_URL .env.local ma nathi.');
  process.exit(2);
}
let missing = 0;
for (const name of functionNames()) {
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, { method: 'OPTIONS', headers: { apikey: key } });
    const ok = response.status !== 404;
    if (!ok) missing += 1;
    console.log(`${ok ? '✔' : '✖'} ${name.padEnd(34)} HTTP ${response.status}${ok ? '' : '  → NOT DEPLOYED (npm run deploy:functions)'}`);
  } catch (cause) {
    missing += 1;
    console.log(`✖ ${name.padEnd(34)} ${cause.message}  → internet/DNS/Supabase paused?`);
  }
}
console.log(missing ? `\n${missing} function(s) problem.` : '\nBadhi functions deploy chhe ✔');
process.exit(missing ? 1 : 0);
