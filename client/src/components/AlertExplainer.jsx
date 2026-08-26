import { useState } from 'react';
import api from '../services/api';
import StructuredInsight from './StructuredInsight';

// Extends AI help from "here's an overall narrative for this module"
// (the five suite pages' AI Insight panels) down to "explain this one
// specific line item" — the individual alerts already surfaced on the
// Executive Dashboard (compliance, receivables, payables, low stock,
// overdue tasks). Deliberately its own small component with its own
// state rather than lifted into the parent Dashboard, since several
// alerts can be expanded independently and none of this needs to be
// visible to anything else on the page.
export default function AlertExplainer({ issueText }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [error, setError] = useState('');

  async function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (explanation || error) return; // already fetched once, just re-show it
    setLoading(true);
    try {
      const { data } = await api.post('/issues/explain', { issueText });
      if (data.available === false) setError(data.message);
      else setExplanation(data.explanation);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get an explanation right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="alert-explain-btn"
        onClick={handleClick}
        title="Ask AI to explain this"
      >
        {open ? 'Hide' : 'Explain'}
      </button>
      {open && (
        <div className="alert-explanation">
          {loading && <span>Thinking…</span>}
          {!loading && error && <span>{error}</span>}
          {!loading && explanation && <StructuredInsight insight={explanation} />}
        </div>
      )}
    </>
  );
}
