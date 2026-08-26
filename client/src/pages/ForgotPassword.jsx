import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { IconMail } from '../components/icons.jsx';
import { useLoginSafeStyle } from '../context/ThemeContext';

// The frontend half of a flow whose backend already existed —
// /auth/forgot-password and /auth/reset-password were built and
// security-reviewed earlier in this project (no account-enumeration
// leak, hashed tokens, 1-hour expiry) but never had a page to actually
// reach them from. Deliberately reuses the exact same wording the
// backend already returns rather than inventing new copy, since that
// response was written specifically to avoid confirming or denying
// whether an email address has an account here.
export default function ForgotPassword() {
  const loginSafeStyle = useLoginSafeStyle();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page" style={loginSafeStyle}>
      <div className="auth-form-panel" style={{ width: '100%' }}>
        <div className="auth-card">
          <div className="auth-card-badge">
            <img src="/logo-full.png" alt="Bizness-OS" className="auth-card-logo" />
          </div>

          <h1>Reset your password</h1>
          <p className="subtitle">Enter your email and we'll send you a reset link</p>

          {error && <div className="error-banner">{error}</div>}

          {submitted ? (
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              If that email exists, a reset link has been sent. Check your inbox — the link expires in 1 hour.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <div className="input-icon-group">
                  <IconMail />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <div className="auth-footer">
            <Link to="/login">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
