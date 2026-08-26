import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

// The missing link in Transactions → Data → BI Engine → Insights →
// Dashboard → Action. Every other stage of that pipeline already existed
// in this app before this component: transactions write data, the BI
// Engine and each suite page's AI endpoint turn that data into an
// insight, and the insight is already shown on the dashboard. What
// didn't exist anywhere was a way to go from reading an insight to
// actually doing something about it without leaving the page and
// re-typing what the insight already said. This button closes that loop
// directly: one click turns the generated text into a real, assigned
// task through the existing Tasks system — no new task-tracking
// mechanism invented, reusing exactly the same tasks table and
// permissions every other task in this app already goes through.
export default function CreateTaskFromInsight({ insightText, sourceLabel }) {
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  async function createTask() {
    setCreating(true);
    try {
      await api.post('/tasks', {
        title: `Follow up: ${sourceLabel} insight`,
        notes: insightText,
        priority: 'normal',
      });
      setCreated(true);
      showToast('Task created', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not create a task from this insight', 'error');
    } finally {
      setCreating(false);
    }
  }

  if (created) {
    return <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Task created — see <Link to="/tasks">Tasks</Link></span>;
  }

  return (
    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={createTask} disabled={creating}>
      {creating ? 'Creating…' : '+ Create Task from Insight'}
    </button>
  );
}
