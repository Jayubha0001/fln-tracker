import { useState } from 'react';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const fmt = (value) => Number(value || 0).toLocaleString();

const ICONS = {
  people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.2 3.2 0 010 6M18 14a6 6 0 013.5 6',
  bars: 'M5 20V11M10 20V4M15 20v-7M20 20V8',
  doc: 'M6 3h9l4 4v14H6V3zM9 11h7M9 15h7M9 19h4',
  trend: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  school: 'M3 10l9-6 9 6M5 10v10h14V10M9 20v-6h6v6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  trophy: 'M8 4h8v5a4 4 0 01-8 0V4zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 21h8M10 17h4',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function OverviewKpi({ tone, icon, label, value, sub }) {
  return (
    <div className={`ov-kpi ${tone}`}>
      <span className="ov-kpi-icon"><Icon name={icon} /></span>
      <div className="ov-kpi-copy">
        <span>{label}</span>
        <b>{value}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function Donut({ totals }) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const parts = [
    { key: 'u', value: totals.u, label: 'ઉદયમાન' },
    { key: 'p', value: totals.p, label: 'પ્રગતિશીલ' },
    { key: 'n', value: totals.n, label: 'નિપુણ' },
  ];
  let offset = 0;
  return (
    <div className="ov-donut-wrap">
      <svg viewBox="0 0 160 160" className="ov-donut" role="img" aria-label="FLN પ્રગતિ સ્થિતિ">
        <circle cx="80" cy="80" r={radius} className="ov-donut-track" />
        {totals.entered > 0 && parts.map((part) => {
          const length = (part.value / totals.entered) * circumference;
          const circle = (
            <circle
              key={part.key}
              cx="80" cy="80" r={radius}
              className={`ov-donut-seg ${part.key}`}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += length;
          return circle;
        })}
        <text x="80" y="76" textAnchor="middle" className="ov-donut-num">{fmt(totals.registered)}</text>
        <text x="80" y="96" textAnchor="middle" className="ov-donut-cap">વિદ્યાર્થીઓ</text>
      </svg>
      <ul className="ov-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <i className={part.key} />
            <span>{part.label}</span>
            <b>{fmt(part.value)} <small>({pct(part.value, totals.entered)}%)</small></b>
          </li>
        ))}
        {!totals.entered && <li className="ov-empty">હજી એન્ટ્રી નથી</li>}
      </ul>
    </div>
  );
}

function niceMax(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((item) => item * magnitude >= value / 4) * magnitude;
  return Math.ceil(value / step) * step;
}

function short(text, max = 9) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function BarChart({ rows }) {
  const width = 360;
  const height = 150;
  const left = 38;
  const bottom = 24;
  const top = 8;
  const plotHeight = height - bottom - top;
  const max = niceMax(Math.max(1, ...rows.map((row) => Math.max(row.registered, row.entered))));
  const slot = (width - left - 8) / Math.max(rows.length, 1);
  const barWidth = Math.min(22, slot / 3);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ov-bars" role="img" aria-label="રજિસ્ટર અને એન્ટ્રી">
      {[0, 1, 2, 3, 4].map((tick) => {
        const value = (max / 4) * tick;
        return (
          <g key={tick}>
            <line x1={left} x2={width - 4} y1={y(value)} y2={y(value)} className="ov-grid" />
            <text x={left - 6} y={y(value) + 3} textAnchor="end" className="ov-axis">{fmt(Math.round(value))}</text>
          </g>
        );
      })}
      {rows.map((row, index) => {
        const center = left + slot * index + slot / 2;
        return (
          <g key={row.key}>
            <title>{`${row.label}: રજિસ્ટર ${fmt(row.registered)} · એન્ટ્રી ${fmt(row.entered)}`}</title>
            <rect x={center - barWidth - 1} y={y(row.registered)} width={barWidth} height={Math.max(0, top + plotHeight - y(row.registered))} rx="4" className="ov-bar reg" />
            <rect x={center + 1} y={y(row.entered)} width={barWidth} height={Math.max(0, top + plotHeight - y(row.entered))} rx="4" className="ov-bar ent" />
            <text x={center} y={height - 8} textAnchor="middle" className="ov-axis label">{short(row.label)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendChart({ trend }) {
  const width = 360;
  const height = 150;
  const left = 30;
  const right = 8;
  const top = 10;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(10, Math.ceil(Math.max(...trend.map((item) => Math.max(item.entryPct, item.nipunPct))) / 10) * 10);
  const x = (index) => left + (trend.length > 1 ? (plotWidth * index) / (trend.length - 1) : plotWidth / 2);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  const line = (key) => trend.map((item, index) => (item.has ? [x(index), y(item[key])] : null))
    .filter(Boolean).map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ov-bars" role="img" aria-label="માસવાર પ્રગતિ">
      {[0, 1, 2].map((tick) => {
        const value = (max / 2) * tick;
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="ov-grid" />
            <text x={left - 5} y={y(value) + 3} textAnchor="end" className="ov-axis">{Math.round(value)}%</text>
          </g>
        );
      })}
      <path d={line('entryPct')} className="ov-line ent" />
      <path d={line('nipunPct')} className="ov-line nip" />
      {trend.map((item, index) => (
        <g key={item.key}>
          <title>{`${item.label}: એન્ટ્રી ${item.entryPct}% · નિપુણ ${item.nipunPct}%`}</title>
          {item.has && <circle cx={x(index)} cy={y(item.nipunPct)} r="3" className="ov-dot nip" />}
          <text x={x(index)} y={height - 8} textAnchor="middle" className="ov-axis label">{short(item.label, 4)}</text>
        </g>
      ))}
    </svg>
  );
}

export default function DashboardOverview({ unitTitle, monthLabel, rows, totals, trend = [], gradeCards = [], schoolStats = null, onSelect }) {
  const [pendingSearch, setPendingSearch] = useState('');
  const pending = Math.max(0, totals.registered - totals.entered);
  const attention = [...rows]
    .filter((row) => row.registered > 0)
    .map((row) => ({ ...row, entryPct: pct(row.entered, row.registered) }))
    .sort((a, b) => a.entryPct - b.entryPct || b.registered - a.registered)
    .slice(0, 4);
  const hasTrend = trend.some((item) => item.has);
  const byRegister = [...rows].sort((a, b) => b.registered - a.registered || a.label.localeCompare(b.label));
  const chartRows = byRegister.slice(0, 6);
  const nipunRows = [...rows]
    .map((row) => ({ ...row, nipunPct: pct(row.n, row.registered) }))
    .sort((a, b) => b.nipunPct - a.nipunPct || b.registered - a.registered)
    .slice(0, 6);
  return (
    <div className="ov">
      <div className="ov-kpis">
        <OverviewKpi tone="blue" icon="people" label="રજિસ્ટર સંખ્યા" value={fmt(totals.registered)} sub={`${rows.length} ${unitTitle}`} />
        <OverviewKpi tone="green" icon="bars" label={`${monthLabel} એન્ટ્રી`} value={fmt(totals.entered)} sub={`${pct(totals.entered, totals.registered)}% પૂર્ણ`} />
        <OverviewKpi tone="amber" icon="doc" label="ઉદયમાન" value={fmt(totals.u)} sub={`${pct(totals.u, totals.entered)}%`} />
        <OverviewKpi tone="pink" icon="trend" label="પ્રગતિશીલ" value={fmt(totals.p)} sub={`${pct(totals.p, totals.entered)}%`} />
        <OverviewKpi tone="violet" icon="trophy" label="નિપુણ" value={fmt(totals.n)} sub={`${pct(totals.n, totals.entered)}%`} />
        <OverviewKpi tone="slate" icon="clock" label="બાકી એન્ટ્રી" value={fmt(pending)} sub={`${pct(pending, totals.registered)}% બાકી`} />
      </div>
      {attention.length > 0 && totals.registered > 0 && (
        <div className="ov-attention">
          <b>ધ્યાન આપો · ઓછી એન્ટ્રી</b>
          {attention.map((row) => (
            <button type="button" key={row.key} disabled={!onSelect} onClick={() => onSelect?.(row)} title={`${row.label}: ${row.entered}/${row.registered}`}>
              {short(row.label, 14)} <em>{row.entryPct}%</em>
            </button>
          ))}
        </div>
      )}
      {schoolStats && (
        <section className="ov-schools">
          <div className="ov-schools-head">
            <b>શાળા સ્થિતિ · {monthLabel}</b>
            <small>{schoolStats.eligible} શાળામાં વિદ્યાર્થી રજિસ્ટર છે{schoolStats.noStudents ? ` · ${schoolStats.noStudents} શાળામાં વિદ્યાર્થી નથી` : ''}</small>
          </div>
          <div className="ov-kpis">
            <OverviewKpi tone="blue" icon="school" label="કુલ શાળા" value={fmt(schoolStats.total)} sub={`${fmt(schoolStats.eligible)} સક્રિય`} />
            <OverviewKpi tone="green" icon="bars" label="એન્ટ્રી શરૂ" value={fmt(schoolStats.started)} sub={`${pct(schoolStats.started, schoolStats.eligible)}% શાળા`} />
            <OverviewKpi tone="violet" icon="trophy" label="પૂર્ણ શાળા" value={fmt(schoolStats.complete)} sub={`${pct(schoolStats.complete, schoolStats.eligible)}%`} />
            <OverviewKpi tone="amber" icon="doc" label="અધૂરી શાળા" value={fmt(schoolStats.partial)} sub={`${pct(schoolStats.partial, schoolStats.eligible)}%`} />
            <OverviewKpi tone="pink" icon="clock" label="બાકી શાળા" value={fmt(schoolStats.pending)} sub={`${pct(schoolStats.pending, schoolStats.eligible)}% એન્ટ્રી નથી`} />
          </div>
          {schoolStats.eligible > 0 && (
            <div className="ov-stack" role="img" aria-label="શાળા એન્ટ્રી સ્થિતિ">
              <i className="done" style={{ width: `${pct(schoolStats.complete, schoolStats.eligible)}%` }} />
              <i className="part" style={{ width: `${pct(schoolStats.partial, schoolStats.eligible)}%` }} />
              <i className="todo" style={{ width: `${pct(schoolStats.pending, schoolStats.eligible)}%` }} />
            </div>
          )}
          {schoolStats.pendingList.length > 0 && (
            <details className="tool ov-pending">
              <summary>
                <span className="tool-ico" aria-hidden="true">!</span>
                <b>બાકી શાળાઓની યાદી ({fmt(schoolStats.pendingList.length)})</b>
                <small>જેમાં {monthLabel} ની એક પણ એન્ટ્રી નથી</small>
                <i className="tool-chev" aria-hidden="true">⌄</i>
              </summary>
              <div className="tool-body">
                <input type="search" placeholder="શાળા / કોડ / બ્લોક શોધો…" value={pendingSearch} onChange={(event) => setPendingSearch(event.target.value)} />
                {(() => {
                  const needle = pendingSearch.trim().toLowerCase();
                  const matches = schoolStats.pendingList.filter((item) => !needle
                    || `${item.name} ${item.code} ${item.block} ${item.district}`.toLowerCase().includes(needle));
                  return (
                    <>
                      <ul className="list ov-pending-list">
                        {matches.slice(0, 100).map((item) => (
                          <li key={item.id || item.code}>
                            <span><b>{item.name}</b> <small>({item.code})</small><br /><small className="muted">{item.district} › {item.block} · રજિસ્ટર {fmt(item.registered)}</small></span>
                          </li>
                        ))}
                        {!matches.length && <li className="muted">કોઈ શાળા મળી નથી.</li>}
                      </ul>
                      {matches.length > 100 && <small className="muted">પહેલી 100 બતાવી છે ({fmt(matches.length)} માંથી); શોધ વધુ ચોક્કસ કરો.</small>}
                    </>
                  );
                })()}
              </div>
            </details>
          )}
        </section>
      )}
      {gradeCards.length > 0 && (
        <div className="ov-grades">
          {gradeCards.map((card) => (
            <div key={card.key} className="ov-grade" title={`ઉદયમાન ${card.u} · પ્રગતિશીલ ${card.p} · નિપુણ ${card.n}`}>
              <div className="ov-grade-head"><b>{card.label}</b><span>નિપુણ {pct(card.n, card.registered)}%</span></div>
              <div className="ov-grade-track"><i style={{ width: `${Math.min(100, pct(card.entered, card.registered))}%` }} /></div>
              <small>એન્ટ્રી {fmt(card.entered)} / {fmt(card.registered)} · બાકી {fmt(Math.max(0, card.registered - card.entered))}</small>
            </div>
          ))}
        </div>
      )}
      <div className="ov-grid4">
        <section className="ov-card">
          <h3>FLN પ્રગતિ સ્થિતિ</h3>
          <Donut totals={totals} />
        </section>
        <section className="ov-card">
          <h3>{unitTitle} પ્રમાણે રજિસ્ટર અને એન્ટ્રી</h3>
          <div className="ov-key"><span><i className="reg" />રજિસ્ટર</span><span><i className="ent" />એન્ટ્રી</span></div>
          {chartRows.length ? <BarChart rows={chartRows} /> : <p className="muted">કોઈ ડેટા નથી.</p>}
          {rows.length > chartRows.length && <small className="muted">સૌથી વધુ રજિસ્ટર વાળા {chartRows.length} {unitTitle} બતાવ્યા છે.</small>}
        </section>
        <section className="ov-card">
          <h3>{unitTitle} પ્રમાણે નિપુણ %</h3>
          <ul className="ov-progress">
            {nipunRows.map((row) => (
              <li key={row.key}>
                <button type="button" disabled={!onSelect} onClick={() => onSelect?.(row)} title={row.label}>
                  <span className="ov-progress-name">{short(row.label, 16)}</span>
                  <span className="ov-progress-track"><i style={{ width: `${Math.min(100, row.nipunPct)}%` }} /></span>
                  <b>{row.nipunPct}%</b>
                </button>
              </li>
            ))}
            {!nipunRows.length && <li className="muted">કોઈ ડેટા નથી.</li>}
          </ul>
          {rows.length > nipunRows.length && <small className="muted">ટોચના {nipunRows.length} {unitTitle} બતાવ્યા છે.</small>}
        </section>
        <section className="ov-card">
          <h3>માસવાર પ્રગતિ</h3>
          <div className="ov-key"><span><i className="ent" />એન્ટ્રી %</span><span><i className="nip" />નિપુણ %</span></div>
          {hasTrend ? <TrendChart trend={trend} /> : <p className="muted">હજી કોઈ માસની એન્ટ્રી નથી.</p>}
        </section>
      </div>
    </div>
  );
}
