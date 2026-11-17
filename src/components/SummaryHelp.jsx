const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Plain-language reading guide (Gujarati + English), collapsed by default.
export function SummaryGuide({ scopeLabel }) {
  return (
    <details className="summary-guide no-print">
      <summary>❓ આ સારાંશ કેવી રીતે વાંચવો? / How to read this summary?</summary>
      <div className="summary-guide-body">
        <p>
          આ પેજ <b>{scopeLabel}</b> ના વિદ્યાર્થીઓનું પરિણામ સરળ ભાષામાં બતાવે છે. ઉપરથી શાળા/ધોરણ/માસ પસંદ કરો.
          <br />
          This page shows the results of students of <b>{scopeLabel}</b> in plain language. Choose school / class / month from the top.
        </p>
        <ul>
          <li><b>કુલ નોંધાયેલા / Total Enrolled</b> – સિસ્ટમમાં કેટલા વિદ્યાર્થી છે. / Students in the system.</li>
          <li><b>સાચવેલી એન્ટ્રી / Entries Saved</b> – જેની આ માસની એન્ટ્રી સેવ થઈ ગઈ છે. / Entry saved for this month.</li>
          <li><b>પૂર્ણ / Complete</b> – બધા વિધાન ભરાઈ ગયા અને પરિણામ નક્કી થયું. / All statements filled and the result is decided. <b>અપૂર્ણ / Incomplete</b> – એન્ટ્રી છે પણ કેટલાક વિધાન બાકી. / Entry exists but some statements are pending.</li>
          <li><b>ગેરહાજર / Absent</b> – શાળામાં નોંધાયેલ પણ પરીક્ષામાં નથી; એન્ટ્રીમાં ગણાય. / On roll but did not appear; counted in entries.</li>
          <li><b>બાકી / Pending</b> – જેની આ માસની એન્ટ્રી હજી થઈ નથી. / Entry for this month not done yet.</li>
          <li><b>ઉદયમાન / પ્રગતિશીલ / નિપુણ — Udayman / Pragatishil / Nipun</b> – ✓ ની સંખ્યા પ્રમાણે ત્રણ સ્તર (ઓછા → વધુ); નિપુણ એટલે જરૂરી કૌશલ્ય મેળવ્યું. / Three levels by number of ✓ (low → high); Nipun means the required skill is achieved.</li>
          <li><b>વિધાન પ્રમાણે “હા %” / “Yes %” by statement</b> – જેટલા વિદ્યાર્થીને ✓ મળ્યું તેટલા %; ઓછી ટકાવારી = ત્યાં વધુ મહેનત જોઈએ. / Share of students with ✓; a low % means more effort is needed there.</li>
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
        <br />
        <span className="muted">
          {saved} of {total} students ({savedPct}%) have entries{pending > 0 ? `, ${pending} pending` : ', none pending'}
          {partial > 0 ? ` (${partial} incomplete)` : ''}{absent > 0 ? ` · ${absent} absent` : ''}.
        </span>
      </p>
      {done > 0 && (
        <p>
          પૂર્ણ / Complete {done}: <span className="tri n">નિપુણ / Nipun {tri.N} ({pct(tri.N, done)}%)</span>{' '}
          <span className="tri p">પ્રગતિશીલ / Pragatishil {tri.P} ({pct(tri.P, done)}%)</span>{' '}
          <span className="tri u">ઉદયમાન / Udayman {tri.U} ({pct(tri.U, done)}%)</span>
        </p>
      )}
      {weakest && strongest && weakest.number !== strongest.number && (
        <p className="muted">
          📌 સૌથી નબળું / Weakest: વિધાન / Statement {weakest.number} ({weakest.percent}% હા / Yes) · 💪 સૌથી મજબૂત / Strongest: વિધાન / Statement {strongest.number} ({strongest.percent}% હા / Yes)
        </p>
      )}
    </div>
  );
}
