import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { IconLock, IconEye, IconEyeOff } from '../components/icons.jsx';
import { useLoginSafeStyle } from '../context/ThemeContext';

// The token arrives as a URL query parameter (/reset-password?token=...),
// matching exactly how a real emailed reset link would work — the
// backend's forgotPassword only logs the raw token to the server
// console in this sandbox (never emails it, since no mail service is
// configured here), so completing this flow end-to-end means copying
// that token from the server log into this page's URL by hand. That's
// a real, honest limitation of this environment, not something this
// page tries to paper over.
export default function ResetPassword() {
  const loginSafeStyle = useLoginSafeStyle();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
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

          <h1>Set a new password</h1>
          <p className="subtitle">Choose a new password for your account</p>

          {!token && (
            <div className="error-banner">This link is missing its reset token. Request a new one from the Forgot Password page.</div>
          )}
          {error && <div className="error-banner">{error}</div>}

          {done ? (
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>Password has been reset. Taking you to sign in…</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>New password</label>
                <div className="input-icon-group">
                  <IconLock />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="has-visibility-toggle"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="input-toggle-visibility"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  8+ characters, with an uppercase letter, a lowercase letter, and a number.
                </p>
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting || !token}>
                {submitting ? 'Resetting…' : 'Reset password'}
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
