const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Plain-language reading guide, collapsed by default.
export function SummaryGuide({ scopeLabel }) {
  return (
    <details className="summary-guide no-print">
      <summary>❓ આ સારાંશ કેવી રીતે વાંચવો?</summary>
      <div className="summary-guide-body">
        <p>આ પેજ <b>{scopeLabel}</b> ના વિદ્યાર્થીઓનું પરિણામ સરળ ભાષામાં બતાવે છે. ઉપરથી શાળા/ધોરણ/માસ પસંદ કરો.</p>
        <ul>
          <li><b>કુલ નોંધાયેલા</b> – સિસ્ટમમાં કેટલા વિદ્યાર્થી છે.</li>
          <li><b>સાચવેલી એન્ટ્રી</b> – જેની આ માસની એન્ટ્રી સેવ થઈ ગઈ છે.</li>
          <li><b>પૂર્ણ</b> – બધા વિધાન ભરાઈ ગયા અને પરિણામ નક્કી થયું. <b>અપૂર્ણ</b> – એન્ટ્રી છે પણ કેટલાક વિધાન બાકી.</li>
          <li><b>બાકી</b> – જેની આ માસની એન્ટ્રી હજી થઈ નથી.</li>
          <li><b>ઉદયમાન / પ્રગતિશીલ / નિપુણ</b> – ✓ ની સંખ્યા પ્રમાણે ત્રણ સ્તર (ઓછા → વધુ). નિપુણ એટલે ધોરણ પ્રમાણે જરૂરી કૌશલ્ય મેળવ્યું.</li>
          <li><b>વિધાન પ્રમાણે “હા %”</b> – જેટલા વિદ્યાર્થીને ✓ મળ્યું તેટલા %. ઓછી ટકાવારી = ત્યાં વધુ મહેનત જોઈએ.</li>
        </ul>
      </div>
    </details>
  );
}

// One short, readable paragraph for a grade.
export function GradeInsight({ label, total, saved, done, partial, pending, absent = 0, tri, skills }) {
  const answered = skills.filter((item) => item.percent !== null && item.answered > 0);
  const weakest = [...answered].sort((a, b) => a.percent - b.percent)[0];
  const strongest = [...answered].sort((a, b) => b.percent - a.percent)[0];
  const savedPct = pct(saved, total);
  const tone = pending === 0 ? 'ok' : savedPct >= 50 ? 'mid' : 'low';
  return (
    <div className={`grade-insight ${tone}`}>
      <p>
        <b>{label}:</b> {total} માંથી <b>{saved}</b> ({savedPct}%) વિદ્યાર્થીની એન્ટ્રી થઈ
        {pending > 0 ? <>, <b>{pending}</b> બાકી છે</> : ', કોઈ બાકી નથી'}
        {partial > 0 ? <> ({partial} અપૂર્ણ)</> : null}{absent > 0 ? <> · {absent} ગેરહાજર</> : null}.
      </p>
      {done > 0 && (
        <p>
          પૂર્ણ {done} માંથી: <span className="tri n">નિપુણ {tri.N} ({pct(tri.N, done)}%)</span>{' '}
          <span className="tri p">પ્રગતિશીલ {tri.P} ({pct(tri.P, done)}%)</span>{' '}
          <span className="tri u">ઉદયમાન {tri.U} ({pct(tri.U, done)}%)</span>
        </p>
      )}
      {weakest && strongest && weakest.number !== strongest.number && (
        <p className="muted">
          📌 સૌથી નબળું: વિધાન {weakest.number} ({weakest.percent}% હા) · 💪 સૌથી મજબૂત: વિધાન {strongest.number} ({strongest.percent}% હા)
        </p>
      )}
    </div>
  );
}
