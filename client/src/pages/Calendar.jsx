import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import AttachmentsPanel from '../components/AttachmentsPanel';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toLocalDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Calendar() {
  const { user } = useAuth();
  const canManageAll = (user?.permissions || []).includes('calendar.manage_all');
  const canSeeUsers = (user?.permissions || []).includes('system.users.manage');

  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(() => toLocalDateKey(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [filesEvent, setFilesEvent] = useState(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

  function load() {
    setLoading(true);
    api.get(`/calendar-events?from=${monthStart.toISOString()}&to=${monthEnd.toISOString()}`)
      .then(({ data }) => setEvents(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [cursor]);

  useEffect(() => {
    if (canManageAll && canSeeUsers) {
      api.get('/users').then(({ data }) => setUsers(data)).catch(() => {});
    }
  }, [canManageAll, canSeeUsers]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      const key = toLocalDateKey(new Date(e.starts_at));
      (map[key] = map[key] || []).push(e);
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return map;
  }, [events]);

  const cells = [];
  const firstWeekday = monthStart.getDay();
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));

  const todayKey = toLocalDateKey(new Date());
  const selectedEvents = eventsByDay[selectedDay] || [];

  async function handleDelete(event) {
    const ok = await confirm(`Delete "${event.title}"?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/calendar-events/${event.id}`);
      load();
      showToast('Event deleted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete event', 'error');
    }
  }

  return (
    <DashboardLayout title="Calendar" subtitle={canManageAll ? 'Everyone\u2019s events' : 'Your events'}>
      <div className="calendar-layout">
        <div className="card calendar-card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>&larr;</button>
              <h2 style={{ minWidth: 160, textAlign: 'center' }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>&rarr;</button>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New event</button>
          </div>

          {loading ? <p>Loading...</p> : (
            <div className="calendar-grid">
              {WEEKDAY_LABELS.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="calendar-cell empty" />;
                const key = toLocalDateKey(d);
                const dayEvents = eventsByDay[key] || [];
                return (
                  <button
                    key={key}
                    className={'calendar-cell' + (key === todayKey ? ' today' : '') + (key === selectedDay ? ' selected' : '')}
                    onClick={() => setSelectedDay(key)}
                  >
                    <span className="calendar-cell-day">{d.getDate()}</span>
                    <span className="calendar-cell-events">
                      {dayEvents.slice(0, 2).map((e) => <span key={e.id} className="calendar-event-chip">{e.title}</span>)}
                      {dayEvents.length > 2 && <span className="calendar-event-more">+{dayEvents.length - 2} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card calendar-day-panel">
          <h2>{new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          {selectedEvents.length === 0 ? (
            <p className="dashboard-empty-note">No events this day.</p>
          ) : (
            <ul className="feed-list">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <span className="feed-list-title">{e.title}</span>
                  <span className="feed-list-detail">
                    {e.all_day ? 'All day' : new Date(e.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    {e.attendees?.length > 1 && ` \u00b7 ${e.attendees.length} attendees`}
                  </span>
                  {e.description && <span className="feed-list-detail">{e.description}</span>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setFilesEvent(e)}>Files</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => handleDelete(e)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showModal && (
        <EventModal
          defaultDate={selectedDay}
          users={users}
          canManageAll={canManageAll}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {filesEvent && (
        <div className="modal-overlay" onClick={() => setFilesEvent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Files &mdash; {filesEvent.title}</h2>
            <AttachmentsPanel relatedType="calendar_event" relatedId={filesEvent.id} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setFilesEvent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function EventModal({ defaultDate, users, canManageAll, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleAttendee(id) {
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
      const endsAt = allDay ? undefined : `${date}T${endTime}:00`;
      await api.post('/calendar-events', {
        title, description: description || undefined, startsAt, endsAt, allDay, attendeeUserIds: attendeeIds,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New event</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="checkbox-row">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <label style={{ margin: 0 }}>All day</label>
          </div>
          {!allDay && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Start time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          {canManageAll && users.length > 0 && (
            <div className="form-group">
              <label>Invite others</label>
              <div className="permission-grid" style={{ gridTemplateColumns: '1fr' }}>
                {users.map((u) => (
                  <label key={u.id}>
                    <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggleAttendee(u.id)} />
                    {u.first_name} {u.last_name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
