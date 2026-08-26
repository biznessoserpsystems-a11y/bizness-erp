import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLoginSafeStyle } from '../context/ThemeContext';
import api from '../services/api';
import { IconBuilding, IconUser, IconMail, IconLock, IconWorkflow, IconReports, IconAssets, IconTag } from '../components/icons.jsx';

export default function Register() {
  const { registerCompany } = useAuth();
  const loginSafeStyle = useLoginSafeStyle();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: '',
    natureOfBusiness: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    licenseToken: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [issuedToken, setIssuedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [natureOptions, setNatureOptions] = useState([]);

  // Fetched from the backend rather than duplicated here, so this list has
  // exactly one source of truth (the same one the server itself validates
  // against) instead of two copies that could quietly drift apart.
  useEffect(() => {
    api.get('/auth/nature-of-business-options').then(({ data }) => setNatureOptions(data)).catch(() => setNatureOptions([]));
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await registerCompany(form);
      setIssuedToken(data.licenseToken || '');
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(issuedToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="auth-page" style={loginSafeStyle}>
      <div className="auth-brand-panel">
        <div className="auth-brand-top">
          <div className="auth-brand-logo-badge">
            <img src="/logo-full.png" alt="Bizness-OS" className="auth-brand-logo" />
          </div>
        </div>

        <div className="auth-brand-mid">
          <h2>Set up your company's ledger in minutes.</h2>
          <p>You'll be the Super Admin — invite your team, add branches, and start recording sales and stock the same day.</p>
        </div>

        <div className="auth-stat-chips">
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconBuilding /></span>
            <span>
              <span className="auth-stat-chip-text">Multi-branch ready</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>Add locations anytime</span>
            </span>
          </div>
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconWorkflow /></span>
            <span>
              <span className="auth-stat-chip-text">Approval workflows</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>Built in from day one</span>
            </span>
          </div>
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconReports /></span>
            <span>
              <span className="auth-stat-chip-text">GRA-ready reports</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>TIN &amp; VAT built in</span>
            </span>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-badge">
            <img src="/logo-full.png" alt="Bizness-OS" className="auth-card-logo" />
          </div>

          <h1>Create your company</h1>
          <p className="subtitle">Set up Bizness-OS and become the Super Admin</p>

          {error && <div className="error-banner">{error}</div>}

          {success ? (
            <div>
              <div className="success-banner">Account created — you're all set to log in.</div>
              {issuedToken && (
                <div className="card" style={{ margin: '16px 0', padding: 16 }}>
                  <label style={{ marginBottom: 6 }}>Your license token</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', flex: 1 }}>{issuedToken}</code>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={copyToken}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <small style={{ color: 'var(--color-text-muted)', fontSize: 12, display: 'block', marginTop: 8 }}>
                    Save this now — you'll need it to register a second, related company under the same license.
                    It's also visible later in Company Profile.
                  </small>
                </div>
              )}
              <button className="btn btn-primary" type="button" onClick={() => navigate('/login')}>
                Continue to login
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Company name</label>
              <div className="input-icon-group">
                <IconBuilding />
                <input value={form.companyName} onChange={update('companyName')} required autoFocus />
              </div>
            </div>
            <div className="form-group">
              <label>License token</label>
              <div className="input-icon-group">
                <IconTag />
                <input
                  value={form.licenseToken}
                  onChange={(e) => setForm((f) => ({ ...f, licenseToken: e.target.value.toUpperCase() }))}
                  placeholder="Enter your license token"
                  maxLength={16}
                  required
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <small style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                A license token is required to register — contact your provider if you don't have one yet. One
                token covers up to 2 companies, so if you're registering a second, related business, use the same
                token you were given for the first.
              </small>
            </div>
            <div className="form-group">
              <label>Nature of business</label>
              <div className="input-icon-group">
                <IconTag />
                <select value={form.natureOfBusiness} onChange={update('natureOfBusiness')} required>
                  <option value="" disabled>Select the nature of your business</option>
                  {natureOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>First name</label>
              <div className="input-icon-group">
                <IconUser />
                <input value={form.firstName} onChange={update('firstName')} required />
              </div>
            </div>
            <div className="form-group">
              <label>Last name</label>
              <div className="input-icon-group">
                <IconUser />
                <input value={form.lastName} onChange={update('lastName')} required />
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
              <div className="input-icon-group">
                <IconMail />
                <input type="email" value={form.email} onChange={update('email')} required />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-icon-group">
                <IconLock />
                <input type="password" value={form.password} onChange={update('password')} required />
              </div>
              <small style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                8+ characters, with upper, lower, and a number
              </small>
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          )}

          <div className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
