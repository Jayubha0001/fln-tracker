import { useState } from 'react';
import { CLASSES, MONTHS } from './lib/category';
import Students from './pages/Students.jsx';
import Entry from './pages/Entry.jsx';
import Summary from './pages/Summary.jsx';
import { SCHOOL } from './config/school';

const nowKey = new Date().toISOString().slice(0, 7);

export default function App() {
  const [tab, setTab] = useState('entry');
  const [dhoran, setDhoran] = useState('1');
  const [month, setMonth] = useState(
    MONTHS.find((m) => m.key === nowKey)?.key || MONTHS[0].key
  );

  return (
    <div className="app">
      <header className="no-print">
        <h1>ગણિત ટ્રેકર – FLN</h1>
        <div className="school">
          <b>{SCHOOL.name}</b> · {SCHOOL.id}<br />
          {SCHOOL.district} › {SCHOOL.block} › {SCHOOL.cluster}
        </div>
        <div className="row">
          <select value={dhoran} onChange={(e) => setDhoran(e.target.value)}>
            {Object.entries(CLASSES).map(([k, c]) => (
              <option key={k} value={k}>{c.label}</option>
            ))}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <nav>
          <button className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>વિદ્યાર્થી</button>
          <button className={tab === 'entry' ? 'on' : ''} onClick={() => setTab('entry')}>એન્ટ્રી</button>
          <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>સારાંશ</button>
        </nav>
      </header>
      <main>
        {tab === 'students' && <Students dhoran={dhoran} />}
        {tab === 'entry' && <Entry dhoran={dhoran} month={month} />}
        {tab === 'summary' && <Summary dhoran={dhoran} month={month} />}
      </main>
    </div>
  );
}
