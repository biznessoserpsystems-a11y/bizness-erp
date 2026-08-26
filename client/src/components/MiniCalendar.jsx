const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="mini-calendar">
      <div className="mini-calendar-header">{monthLabel}</div>
      <div className="mini-calendar-grid">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="mini-calendar-weekday">{w}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className={'mini-calendar-day' + (d === today.getDate() ? ' today' : '') + (d === null ? ' empty' : '')}>
            {d || ''}
          </div>
        ))}
      </div>
    </div>
  );
}
