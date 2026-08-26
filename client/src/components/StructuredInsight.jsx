// Renders the four-part structure every AI insight in this app now
// follows: what happened, why, what's likely next, what management
// should do. A figure alone is descriptive; this is what turns it into
// something someone can actually act on. One shared component rather
// than six separate copies of the same four-section layout across the
// suite dashboards, the alert explainer, and the BI report explainer.
export default function StructuredInsight({ insight }) {
  if (!insight) return null;

  const sections = [
    { label: 'What happened', text: insight.whatHappened },
    { label: 'Why', text: insight.why },
    { label: "What's likely next", text: insight.whatsLikely },
    { label: 'What to do', text: insight.whatToDo },
  ];

  return (
    <dl className="structured-insight">
      {sections.map((s) => (
        <div key={s.label} className="structured-insight-row">
          <dt>{s.label}</dt>
          <dd>{s.text}</dd>
        </div>
      ))}
    </dl>
  );
}
