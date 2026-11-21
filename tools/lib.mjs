// Common helpers for tools/*.mjs (no dependencies)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readEnvFile(name = '.env.local') {
  const file = join(ROOT, name);
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function supabaseConfig() {
  const env = { ...readEnvFile(), ...process.env };
  return { url: (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, ''), key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '' };
}

export function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const file = join(ROOT, 'supabase', '.temp', 'project-ref');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const { url } = supabaseConfig();
  return url ? new URL(url).hostname.split('.')[0] : '';
}

export function functionNames() {
  const dir = join(ROOT, 'supabase', 'functions');
  return readdirSync(dir).filter((name) => !name.startsWith('_') && statSync(join(dir, name)).isDirectory() && existsSync(join(dir, name, 'index.ts'))).sort();
}

export function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  const [header, ...data] = rows;
  const keys = (header || []).map((name) => name.trim().toLowerCase());
  return data.map((values) => Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? '').trim()])));
}

