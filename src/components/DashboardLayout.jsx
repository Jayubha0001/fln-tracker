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
    ['school-import', 'School Import', 'શાળા Import', '⇧'],
    ['student-import', 'Student Import', 'વિદ્યાર્થી Import', '⇧'],
  ],
  district: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['reports', 'District Reports', 'જિલ્લા રિપોર્ટ', '▤'],
    ['schools', 'School Management', 'શાળા વ્યવસ્થાપન', '⌂'],
    ['students', 'Student Management', 'વિદ્યાર્થી વ્યવસ્થાપન', '♙'],
    ['entry', 'FLN Entry', 'FLN એન્ટ્રી', '✎'],
    ['summary', 'Summary & Analytics', 'સારાંશ અને વિશ્લેષણ', '▥'],
  ],
  block: [
    ['dashboard', 'Dashboard', 'મુખ્ય સારાંશ', '▦'],
    ['reports', 'Block Reports', 'બ્લોક રિપોર્ટ', '▤'],
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
    ['annual-report', 'Annual FLN Report', 'વાર્ષિક FLN રિપોર્ટ', '⇩'],
  ],
};

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
          {navigation.map(([key, label, gujarati, icon]) => (
            <button
              type="button"
              key={key}
              className={`sidebar-link ${activeSection === key ? 'active' : ''}`}
              aria-current={activeSection === key ? 'page' : undefined}
              title={collapsed ? `${label} · ${gujarati}` : undefined}
              onClick={() => selectSection(key)}
            >
              <span className="sidebar-icon" aria-hidden="true">{icon}</span>
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
          <span className="sidebar-icon" aria-hidden="true">↪</span>
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
