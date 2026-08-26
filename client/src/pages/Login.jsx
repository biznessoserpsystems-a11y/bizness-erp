import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLoginSafeStyle } from '../context/ThemeContext';
import { IconMail, IconLock, IconEye, IconEyeOff, IconSales, IconFinance, IconInventory } from '../components/icons.jsx';

// A colourful watermark for the branded auth panel: an open book (the
// ledger), a calculator, a stack of files, and seven currency symbols a
// Ghanaian trading business actually deals in day to day — Cedi, Dollar,
// GBP, Euro, Yen, Naira, and CFA. Every colour here is a fixed brand
// value, never a CSS theme variable, so switching the app's accent-colour
// preset never touches this panel — theme colour is reserved for the
// topbar/sidebar/mobile bars and the "Sign in" button only. Kept
// low-opacity so it reads as texture behind the tagline, never
// competing with it for attention.
function AuthWatermark() {
  return (
    <svg
      className="auth-watermark"
      viewBox="0 0 640 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Open book — upper area, away from the globe */}
      <g transform="translate(96,150) rotate(-8)" stroke="#E3B23C" strokeWidth="1.6" fill="none" opacity="0.18">
        <path d="M0 10 C 18 -6, 46 -6, 60 8 L 60 74 C 46 60, 18 60, 0 74 Z" />
        <path d="M60 8 C 74 -6, 102 -6, 120 10 L 120 74 C 102 60, 74 60, 60 74 Z" />
        <path d="M60 8 L60 74" />
      </g>

      {/* Calculator — small, tucked below the book */}
      <g transform="translate(70,410) rotate(6)" opacity="0.18">
        <rect x="0" y="0" width="62" height="86" rx="6" stroke="#8FD6C4" strokeWidth="1.4" fill="none" />
        <rect x="8" y="10" width="46" height="17" rx="2" stroke="#8FD6C4" strokeWidth="1.2" fill="none" />
        <rect x="8" y="36" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="26" y="36" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="44" y="36" width="10" height="10" rx="1.5" fill="#E3B23C" />
        <rect x="8" y="52" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="26" y="52" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="44" y="52" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="8" y="68" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="26" y="68" width="10" height="10" rx="1.5" fill="#8FD6C4" />
        <rect x="44" y="68" width="10" height="10" rx="1.5" fill="#5AA6D6" />
      </g>

      {/* Stack of files — right side, below the globe's upper reach */}
      <g transform="translate(430,60) rotate(-4)" opacity="0.18">
        <path d="M0 20 L0 5 C0 2 2 0 4 0 L20 0 C23 0 24 2 26 5 L56 5 C59 5 60 7 60 9 L60 20 Z" stroke="#E3B23C" strokeWidth="1.4" fill="none" />
        <path d="M0 20 L3 46 C3.3 48.5 5.2 50 7.6 50 L52.4 50 C54.8 50 56.7 48.5 57 46 L60 20 Z" stroke="#E3B23C" strokeWidth="1.4" fill="none" />
      </g>

      {/* Scattered currency symbols — seven in all, each its own colour:
          Cedi, Dollar, GBP, CFA franc, Euro, Naira, Yen. */}
      <text x="330" y="120" fontSize="72" fill="#E3B23C" opacity="0.16" fontFamily="Georgia, serif" transform="rotate(-6 330 120)">₵</text>
      <text x="70" y="330" fontSize="54" fill="#5AA6D6" opacity="0.15" fontFamily="Georgia, serif" transform="rotate(8 70 330)">$</text>
      <text x="500" y="230" fontSize="50" fill="#C68CD9" opacity="0.14" fontFamily="Georgia, serif" transform="rotate(-10 500 230)">£</text>
      <text x="150" y="480" fontSize="34" fill="#8FD6C4" opacity="0.16" fontFamily="Arial, sans-serif" fontWeight="700" transform="rotate(-4 150 480)">CFA</text>
      <text x="470" y="470" fontSize="46" fill="#3FBF8F" opacity="0.14" fontFamily="Georgia, serif" transform="rotate(9 470 470)">€</text>
      <text x="230" y="620" fontSize="44" fill="#E3846E" opacity="0.14" fontFamily="Georgia, serif" transform="rotate(-7 230 620)">₦</text>
      <text x="420" y="740" fontSize="40" fill="#5AA6D6" opacity="0.13" fontFamily="Georgia, serif" transform="rotate(6 420 740)">¥</text>
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const loginSafeStyle = useLoginSafeStyle();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password, mfaToken || undefined, rememberMe);
      if (result.mfaRequired) {
        setMfaRequired(true);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page" style={loginSafeStyle}>
      <div className="auth-brand-panel">
        <AuthWatermark />
        <div className="auth-brand-top">
          <div className="auth-brand-logo-badge">
            <img src="/logo-full.png" alt="Bizness-OS" className="auth-brand-logo" />
          </div>
        </div>

        <div className="auth-brand-mid">
          <h2>The System that runs Your Business Entirely</h2>
          <p>The ERP built for Ghanaian traders and SMEs: inventory, sales, procurement, and accounts, all reconciled together.</p>
        </div>

        <div className="auth-feature-list">
          <div className="auth-feature-list-row">Accounting • HR • Payroll</div>
          <div className="auth-feature-list-row">Inventory • CRM • School Management</div>
          <div className="auth-feature-list-row">Compliance • Business Intelligence</div>
        </div>

        <div className="auth-stat-chips">
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconSales /></span>
            <span>
              <span className="auth-stat-chip-text">Invoice #INV-1042</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>Paid in full</span>
            </span>
          </div>
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconFinance /></span>
            <span>
              <span className="auth-stat-chip-text">15% VAT</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>Applied automatically</span>
            </span>
          </div>
          <div className="auth-stat-chip">
            <span className="auth-stat-chip-icon"><IconInventory /></span>
            <span>
              <span className="auth-stat-chip-text">Stock synced</span>
              <span className="auth-stat-chip-sub" style={{ display: 'block' }}>Across all branches</span>
            </span>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-badge">
            <img src="/logo-full.png" alt="Bizness-OS" className="auth-card-logo" />
          </div>

          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to your Bizness-OS account</p>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <div className="input-icon-group">
                <IconMail />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-icon-group">
                <IconLock />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="has-visibility-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            </div>
            <div className="auth-remember-row">
              <label>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Remember me
              </label>
              <Link to="/forgot-password">Forgot password?</Link>
            </div>
            {mfaRequired && (
              <div className="form-group">
                <label>Authenticator code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  placeholder="6-digit code"
                  autoFocus
                />
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="auth-footer">
            New company? <Link to="/register">Create an account</Link>
          </div>
          <div className="auth-footer" style={{ marginTop: 6, fontSize: '11.5px' }}>
            Secure • Reliable — © {new Date().getFullYear()} Bizness-OS
          </div>
        </div>
      </div>
    </div>
  );
}
