import { useState } from 'react';
import SchoolYearReportButton from './SchoolYearReportButton.jsx';
import StudentQuestionReportButton from './StudentQuestionReportButton.jsx';
import { CLASSES, MONTHS, currentMonthKey } from '../lib/category';

// Ek shala mate be report: (1) વાર્ષિક શાળા FLN Report  (2) વિદ્યાર્થી-વાર વિધાન Report (mahino + ધોરણ pasand kari ne)
function ReportOptions({ supabase, school }) {
  const [month, setMonth] = useState(currentMonthKey);
  const [grade, setGrade] = useState('');
  return (
    <div className="report-options">
      <section>
        <h4>📄 વાર્ષિક શાળા FLN Report / Annual School FLN Report</h4>
        <p className="muted">આખા વર્ષનું માસવાર પરિણામ (Excel, ગુજરાતી + English). / Month-wise result for the whole year.</p>
        <SchoolYearReportButton supabase={supabase} school={school} />
      </section>
      <section>
        <h4>👥 વિદ્યાર્થી-વાર Report / Student-wise Question Report</h4>
        <p className="muted">દરેક વિદ્યાર્થીના દરેક વિધાનના ✓/✗ (Excel). / Every student, every question ✓/✗.</p>
        <div className="row">
          <label>માસ / Month
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label>ધોરણ / Class
            <select value={grade} onChange={(event) => setGrade(event.target.value)}>
              <option value="">બધા ધોરણ / All Classes</option>
              {Object.entries(CLASSES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
        </div>
        <StudentQuestionReportButton supabase={supabase} schoolId={school.id} schoolCode={school.code} month={month} grade={grade} />
      </section>
    </div>
  );
}

export default function SchoolReportMenu({ supabase, school, inline = false }) {
  const [open, setOpen] = useState(false);
  if (inline) return <ReportOptions supabase={supabase} school={school} />;
  return (
    <>
      <button type="button" className="act-report" onClick={() => setOpen(true)}>વાર્ષિક શાળા FLN Report ▾</button>
      {open && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="modal-card" role="dialog" aria-label="School reports" onClick={(event) => event.stopPropagation()}>
            <div className="row between">
              <h3>શાળા Reports / School Reports</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <p className="muted"><b>{school.name}</b> · {school.code}</p>
            <ReportOptions supabase={supabase} school={school} />
          </div>
        </div>
      )}
    </>
  );
}
