import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis;
g.window = dom.window; g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
for (const k of ['localStorage', 'sessionStorage', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia']) {
  if (dom.window[k] !== undefined) g[k] = dom.window[k];
}
g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = g.matchMedia;
dom.window.scrollTo = () => {};
dom.window.confirm = () => true;
g.IS_REACT_ACT_ENVIRONMENT = true;

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ').slice(0, 300)); };

const SCHOOLS = [
  { id: 's1', code: '24280101102', name: 'ADARSH SCHOOL', district: 'Botad', block: 'BARVALA', cluster: 'C1', active: true, school_id: 's1', school_code: '24280101102' },
  { id: 's2', code: '24290400101', name: 'AHIR SCHOOL', district: 'Dwarka', block: 'BHANVAD', cluster: 'C2', active: true, school_id: 's2', school_code: '24290400101' },
];
const STUDENTS = [
  { id: 'st1', school_id: 's1', dhoran: '1', name: 'A ONE', reg: '1' },
  { id: 'st2', school_id: 's1', dhoran: '1', name: 'B TWO', reg: '2' },
  { id: 'st3', school_id: 's2', dhoran: '1', name: 'C THREE', reg: '3' },
];
const ENTRIES = [
  { id: 'e1', student_id: 'st1', school_id: 's1', dhoran: '1', month: '2026-10', answers: { 1: true, 2: false } },
  { id: 'e2', student_id: 'st2', school_id: 's1', dhoran: '1', month: '2026-10', answers: { absent: 'yes' } },
];
const group = (a) => SCHOOLS.map((s) => ({
  group_key: a.p_group === 'district' ? s.district : a.p_group === 'block' ? s.block : s.code,
  group_label: a.p_group === 'district' ? s.district : a.p_group === 'block' ? s.block : s.name,
  school_id: s.id, school_code: s.code, district: s.district, block: s.block,
  registered: 5, entered: s.id === 's1' ? 2 : 0, uday: 1, pragati: 0, nipun: 0,
}));
const ledger = [{ month: '2026-10', dhoran: '1', registered: 5, entered: 2, uday: 1, pragati: 0, nipun: 0 }];

function builder(resolve) {
  const b = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(resolve()).then(ok, bad);
      return () => b;
    },
    apply() { return b; },
  });
  return b;
}
const supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from(table) {
    const rows = table === 'schools' ? SCHOOLS : table === 'students' ? STUDENTS : table === 'entries' ? ENTRIES : [];
    return builder(() => ({ data: rows, error: null, count: rows.length }));
  },
  rpc(name, args) {
    const data = name === 'fln_group_stats' ? group(args || {}) : name === 'fln_ledger' ? ledger : [];
    return builder(() => ({ data, error: null }));
  },
  functions: { invoke: async () => ({ data: { accounts: [], total: 0, page: 1, pageSize: 25 }, error: null }) },
  channel() { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; },
  removeChannel() {},
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default ?? (await import('react'));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const load = (p) => server.ssrLoadModule(p).then((m) => m.default);

async function mount(name, Comp, props, steps = []) {
  errors.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let fatal = '';
  try {
    await act(async () => { root.render(React.createElement(Comp, props)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    for (const step of steps) {
      const targets = [...host.querySelectorAll('button, summary, a')].filter((el) => step.test.test(el.textContent || ''));
      for (const el of targets.slice(0, step.max ?? 1)) {
        await act(async () => { el.click(); });
        await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      }
    }
  } catch (e) { fatal = String(e && e.stack || e).slice(0, 400); }
  const html = host.innerHTML.length;
  const bad = errors.filter((e) => !/act\(|not wrapped in act|Warning: Each child|key/.test(e));
  console.log(`${fatal || html === 0 || bad.length ? 'FAIL' : 'ok  '} ${name} (html ${html})${fatal ? ' FATAL ' + fatal : ''}${bad.length ? ' ERR ' + bad.join(' | ') : ''}`);
  try { await act(async () => root.unmount()); } catch { /* ignore */ }
  host.remove();
}

const adminProfile = { id: 'u1', role: 'admin', active: true, email: 'a@b.c' };
const distProfile = { id: 'u2', role: 'district', active: true, district_code: '2428', email: 'd@b.c' };
const blockProfile = { id: 'u3', role: 'block', active: true, district_code: '2428', block_code: '242801', email: 'b@b.c' };

const AdminDashboard = await load('/src/pages/AdminDashboard.jsx');
const AdminPanel = await load('/src/pages/AdminPanel.jsx');
const ScopedDashboard = await load('/src/pages/ScopedDashboard.jsx');
const Entry = await load('/src/pages/Entry.jsx');
const Summary = await load('/src/pages/Summary.jsx');
const SchoolSummary = await load('/src/pages/SchoolSummary.jsx');
const Students = await load('/src/pages/Students.jsx');
const AdminReports = await load('/src/pages/AdminReports.jsx');
const SchoolYearReportButton = await load('/src/components/SchoolYearReportButton.jsx');

await mount('AdminDashboard(admin)', AdminDashboard, { supabase, profile: adminProfile });
await mount('AdminDashboard(district)', AdminDashboard, { supabase, profile: distProfile });
await mount('AdminDashboard(block)', AdminDashboard, { supabase, profile: blockProfile });
await mount('Entry', Entry, { supabase, school: SCHOOLS[0], dhoran: '1', month: '2026-10', onDirtyChange() {} }, [{ test: /વિધાન પ્રમાણે/ }, { test: /વિદ્યાર્થી પ્રમાણે/ }, { test: /ગેરહાજર/, max: 2 }]);
await mount('Summary(admin)', Summary, { supabase, isAdmin: true, schools: SCHOOLS, scopeLabel: 'x' }, [{ test: /નોંધાયેલા/, max: 2 }]);
await mount('SchoolSummary', SchoolSummary, { supabase, school: SCHOOLS[0], dhoran: '1', month: '2026-10' });
await mount('AdminReports', AdminReports, { supabase, profile: adminProfile });
await mount('SchoolYearReportButton', SchoolYearReportButton, { supabase, school: SCHOOLS[0] }, [{ test: /વાર્ષિક/ }]);
await mount('Students', Students, { supabase, school: SCHOOLS[0], dhoran: '1' });
const navTests = [/School Management/, /Student Management/, /FLN Entry/, /Summary & Analytics/, /Login & Password/, /District \/ Block Reports/, /Dashboard/];
await mount('AdminPanel(nav all)', AdminPanel, { supabase, profile: adminProfile, onSignOut() {} }, navTests.map((test) => ({ test })));
await mount('AdminPanel(open panels)', AdminPanel, { supabase, profile: adminProfile, onSignOut() {} }, [{ test: /School Management/ }, { test: /તપાસ/, max: 3 }, { test: /તપાસ કરો/ }]);
await mount('ScopedDashboard(district nav all)', ScopedDashboard, { supabase, profile: distProfile, onSignOut() {} }, navTests.slice(0, 6).map((test) => ({ test })));
await mount('ScopedDashboard(block nav all)', ScopedDashboard, { supabase, profile: blockProfile, onSignOut() {} }, navTests.slice(0, 6).map((test) => ({ test })));

await server.close();
console.error = origError;
process.exit(0);
