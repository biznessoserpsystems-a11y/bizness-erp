import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AccessControl() {
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [ipData, setIpData] = useState({ rules: [], enabled: false, yourIp: '' });
  const [ipLoading, setIpLoading] = useState(true);
  const [newCidr, setNewCidr] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [addRuleError, setAddRuleError] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [toggling, setToggling] = useState(false);

  function loadSessions() {
    setSessionsLoading(true);
    api.get('/access-control/sessions').then(({ data }) => setSessions(data)).finally(() => setSessionsLoading(false));
  }

  function loadIpRules() {
    setIpLoading(true);
    api.get('/access-control/ip-rules').then(({ data }) => setIpData(data)).finally(() => setIpLoading(false));
  }

  useEffect(() => {
    loadSessions();
    loadIpRules();
  }, []);

  async function handleRevoke(session) {
    const ok = await confirm(
      `Sign out ${session.first_name} ${session.last_name} from this device? They will be signed out the next time their session refreshes, usually within a few minutes.`,
      { confirmLabel: 'Revoke session', danger: true }
    );
    if (!ok) return;
    await api.delete(`/access-control/sessions/${session.id}`);
    showToast('Session revoked', 'success');
    loadSessions();
  }

  async function handleAddRule(e) {
    e.preventDefault();
    setAddRuleError('');
    try {
      await api.post('/access-control/ip-rules', { cidr: newCidr, description: newDescription });
      setNewCidr('');
      setNewDescription('');
      loadIpRules();
    } catch (err) {
      setAddRuleError(err.response?.data?.error || 'Could not add that rule.');
    }
  }

  async function handleDeleteRule(rule) {
    const ok = await confirm(`Remove the rule for ${rule.cidr}? Anyone connecting only from that range will no longer be able to sign in.`, { confirmLabel: 'Remove rule', danger: true });
    if (!ok) return;
    await api.delete(`/access-control/ip-rules/${rule.id}`);
    loadIpRules();
  }

  async function handleToggle(nextEnabled) {
    setToggleError('');
    if (nextEnabled) {
      const ok = await confirm(
        "Once enabled, sign-in will be blocked from any IP address not covered by a rule below — for everyone, including you if your current address isn't covered. Are you sure?",
        { confirmLabel: 'Enable IP restriction', danger: true }
      );
      if (!ok) return;
    }
    setToggling(true);
    try {
      await api.patch('/access-control/ip-restriction', { enabled: nextEnabled });
      loadIpRules();
    } catch (err) {
      setToggleError(err.response?.data?.error || 'Could not change this setting.');
    } finally {
      setToggling(false);
    }
  }

  return (
    <DashboardLayout title="Access Control" breadcrumb={[{ label: 'Settings' }, { label: 'Access Control' }]}>
      <div className="card">
        <h2>Active sessions</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Everyone currently signed in across every device. Revoking a session signs that device out the next time it tries to refresh — usually within a few minutes, not instantly.
        </p>
        {sessionsLoading ? (
          <p>Loading…</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No active sessions.</p>
        ) : (
          <table>
            <thead>
              <tr><th>User</th><th>IP address</th><th>Device</th><th>Signed in</th><th></th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.first_name} {s.last_name}<br /><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.email}</span></td>
                  <td>{s.ip_address || '—'}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent || '—'}</td>
                  <td>{timeAgo(s.created_at)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleRevoke(s)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>IP sign-in restriction</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          When enabled, sign-in is only allowed from the IP addresses or ranges listed below. Off by default — most companies don't need this.
        </p>

        {ipLoading ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="info-banner" style={{ marginBottom: 16 }}>
              Your current IP address is <strong>{ipData.yourIp}</strong>.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span className={`badge ${ipData.enabled ? 'badge-success' : 'badge-neutral'}`}>
                {ipData.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                className={`btn btn-sm ${ipData.enabled ? 'btn-secondary' : 'btn-primary'}`}
                style={{ width: 'auto' }}
                disabled={toggling}
                onClick={() => handleToggle(!ipData.enabled)}
              >
                {ipData.enabled ? 'Disable restriction' : 'Enable restriction'}
              </button>
            </div>
            {toggleError && <div className="error-banner" style={{ marginBottom: 16 }}>{toggleError}</div>}

            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr><th>Range</th><th>Description</th><th></th></tr>
              </thead>
              <tbody>
                {ipData.rules.length === 0 && (
                  <tr><td colSpan={3} style={{ color: 'var(--color-text-muted)' }}>No rules yet.</td></tr>
                )}
                {ipData.rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.cidr}</td>
                    <td>{r.description || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(r)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={handleAddRule} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>IP address or range</label>
                <input value={newCidr} onChange={(e) => setNewCidr(e.target.value)} placeholder="203.0.113.5 or 203.0.113.0/24" required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Description (optional)</label>
                <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Head office" />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>+ Add rule</button>
            </form>
            {addRuleError && <div className="error-banner" style={{ marginTop: 12 }}>{addRuleError}</div>}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
