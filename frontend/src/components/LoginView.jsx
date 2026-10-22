import React, { useState } from 'react';
import { useSession } from '../context/SessionContext';
import { Shield, Lock, Mail, User, ArrowRight, CheckCircle2 } from 'lucide-react';

export function LoginView({ onComplete, onToast }) {
  const { login, signup, loginAsGuest } = useSession();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const [message, setMessage] = useState(null); // { text, type: 'error' | 'success' }
  const [submitting, setSubmitting] = useState(false);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);

    try {
      login(email, password);
      setMessage({ text: 'Welcome back! Launching map...', type: 'success' });
      if (onToast) onToast('Signed in successfully', 'success');
      setTimeout(() => {
        onComplete();
      }, 500);
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = (e) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);

    try {
      signup(name, email, password, confirmPassword);
      setMessage({
        text: 'Account created successfully! You can now log in.',
        type: 'success'
      });
      if (onToast) onToast('Account created! Please log in.', 'success');
      setTimeout(() => {
        setMode('login');
        setSubmitting(false);
        setPassword('');
        setConfirmPassword('');
      }, 700);
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
      setSubmitting(false);
    }
  };

  const handleGuest = () => {
    loginAsGuest();
    if (onToast) onToast('Browsing as Guest', 'info');
    onComplete();
  };

  return (
    <div className="auth-screen-layout">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-icon-wrap" style={{ width: 48, height: 48 }}>
            <Shield size={26} />
          </div>
          <h1 className="brand-title" style={{ fontSize: '1.4rem' }}>
            NaviGuard
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Safety-first navigation & hazard intelligence
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setMessage(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setMessage(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              fontWeight: 500,
              background:
                message.type === 'success'
                  ? 'var(--success-light)'
                  : 'var(--danger-light)',
              color:
                message.type === 'success' ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${
                message.type === 'success'
                  ? 'var(--success-border)'
                  : 'var(--danger-border)'
              }`
            }}
          >
            {message.text}
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="form-field-group">
              <label className="field-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="input-with-button">
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-field-group">
              <label className="field-label" htmlFor="login-password">
                Password
              </label>
              <div className="input-with-button">
                <input
                  id="login-password"
                  type="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)'
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}
                onClick={() => setMessage({ text: 'Password reset is not configured in this demo.', type: 'error' })}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              Sign In <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          /* Signup Form */
          <form className="auth-form" onSubmit={handleSignupSubmit}>
            <div className="form-field-group">
              <label className="field-label" htmlFor="signup-name">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                className="form-input"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field-group">
              <label className="field-label" htmlFor="signup-email">
                Email Address
              </label>
              <input
                id="signup-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field-group">
              <label className="field-label" htmlFor="signup-pass">
                Password
              </label>
              <input
                id="signup-pass"
                type="password"
                className="form-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="form-field-group">
              <label className="field-label" htmlFor="signup-confirm">
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              Create Account
            </button>
          </form>
        )}

        <div className="auth-divider">or</div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleGuest}
          style={{ width: '100%' }}
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}
