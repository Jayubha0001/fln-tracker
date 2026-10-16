import { useEffect, useState } from 'react';

const NAVIGATION = {
  admin: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['reports', 'District / Block Reports', 'જિલ્લા / બ્લોક રિપોર્ટ', '▤'],
    ['school-management', 'School Management', 'શાળા વ્યવસ્થાપન', '⌂'],
    ['student-management', 'Student Management', 'વિદ્યાર્થી વ્યવસ્થાપન', '♙'],
    ['entry', 'FLN Entry', 'FLN એન્ટ્રી', '✎'],
    ['summary', 'Summary & Analytics', 'સારાંશ અને વિશ્લેષણ', '▥'],
    ['accounts', 'Login & Password Management', 'લૉગિન અને પાસવર્ડ', '▣'],
  ],
  district: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['reports', 'District Reports', 'જિલ્લા રિપોર્ટ', '▤'],
    ['accounts', 'Login & Password Management', 'લૉગિન અને પાસવર્ડ', '▣'],
    ['schools', 'School Management', 'શાળા વ્યવસ્થાપન', '⌂'],
    ['students', 'Student Management', 'વિદ્યાર્થી વ્યવસ્થાપન', '♙'],
    ['entry', 'FLN Entry', 'FLN એન્ટ્રી', '✎'],
    ['summary', 'Summary & Analytics', 'સારાંશ અને વિશ્લેષણ', '▥'],
  ],
  block: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['reports', 'Block Reports', 'બ્લોક રિપોર્ટ', '▤'],
    ['accounts', 'School Logins & Passwords', 'શાળા લૉગિન અને પાસવર્ડ', '▣'],
    ['schools', 'School Management', 'શાળા વ્યવસ્થાપન', '⌂'],
    ['students', 'Student Management', 'વિદ્યાર્થી વ્યવસ્થાપન', '♙'],
    ['entry', 'FLN Entry', 'FLN એન્ટ્રી', '✎'],
    ['summary', 'Summary & Analytics', 'સારાંશ અને વિશ્લેષણ', '▥'],
  ],
  school: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['students', 'Student Management', 'વિદ્યાર્થી વ્યવસ્થાપન', '♙'],
    ['entry', 'FLN Entry', 'FLN એન્ટ્રી', '✎'],
    ['summary', 'Summary & Analytics', 'સારાંશ અને વિશ્લેષણ', '▥'],
    ['reports', 'School Reports', 'શાળા રિપોર્ટ', '▤'],
    ['annual-report', 'Annual FLN Report', 'વાર્ષિક FLN રિપોર્ટ', '⇩'],
  ],
};

const ICON_PATHS = {
  dashboard: 'M4 13h7V4H4v9zm9 7h7V11h-7v9zM4 20h7v-5H4v5zm9-11h7V4h-7v5z',
  reports: 'M5 3h10l4 4v14H5V3zm9 1.5V8h3.5M8 12h8M8 15.5h8M8 19h5',
  school: 'M3 10l9-6 9 6M5 10v10h14V10M9 20v-6h6v6',
  student: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  entry: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  summary: 'M5 20V10M10 20V4M15 20v-7M20 20V8',
  accounts: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5v-9zM12 15v2',
  import: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
};

function iconFor(key) {
  if (key === 'reports') return 'reports';
  if (key === 'school-management' || key === 'schools') return 'school';
  if (key === 'student-management' || key === 'students') return 'student';
  if (key === 'school-import' || key === 'student-import') return 'import';
  if (key === 'annual-report') return 'download';
  return ICON_PATHS[key] ? key : 'dashboard';
}

function NavIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export default function DashboardLayout({
  role,
  activeSection,
  onNavigate,
  onLogout,
  context,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = NAVIGATION[role] || [];
  const activeItem = navigation.find(([key]) => key === activeSection) || navigation[0];

  useEffect(() => {
    if (!mobileOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  function selectSection(key) {
    if (key !== activeSection && onNavigate(key) === false) return;
    setMobileOpen(false);
  }

  return (
    <div className={`dashboard-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="મેનુ બંધ કરો"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">ફ</span>
          <span className="sidebar-brand-copy"><b>FLN Tracker</b><small>NIPUN GUJARAT</small></span>
        </div>
        <nav className="sidebar-navigation" aria-label="મુખ્ય navigation">
          {navigation.map(([key, label, gujarati]) => (
            <button
              type="button"
              key={key}
              className={`sidebar-link ${activeSection === key ? 'active' : ''}`}
              aria-current={activeSection === key ? 'page' : undefined}
              title={collapsed ? `${label} · ${gujarati}` : undefined}
              onClick={() => selectSection(key)}
            >
              <span className="sidebar-icon" aria-hidden="true"><NavIcon name={iconFor(key)} /></span>
              <span className="sidebar-link-copy"><b>{label}</b><small>{gujarati}</small></span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="sidebar-logout"
          title={collapsed ? 'લૉગઆઉટ' : undefined}
          onClick={() => {
            setMobileOpen(false);
            onLogout();
          }}
        >
          <span className="sidebar-icon" aria-hidden="true"><NavIcon name="logout" /></span>
          <span className="sidebar-link-copy"><b>Logout</b><small>લૉગઆઉટ</small></span>
        </button>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar no-print">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label="મેનુ ખોલો અથવા બંધ કરો"
            aria-expanded={mobileOpen}
            onClick={() => {
              if (window.matchMedia('(max-width: 760px)').matches) setMobileOpen((open) => !open);
              else setCollapsed((value) => !value);
            }}
          >
            ☰
          </button>
          <div className="dashboard-heading">
            <h1>{activeItem?.[1] || 'FLN Tracker'}</h1>
            <span>{context}</span>
          </div>
        </header>
        <main className="dashboard-page">{children}</main>
      </div>
    </div>
  );
}
