import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === 'signup';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isSignup) await signup({ username, email, password });
      else await login({ email, password });
    } catch (requestError) {
      setError(requestError.message || 'Could not authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError('');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">NaviGuard</h1>
          <p className="mt-2 text-sm text-slate-400">Your routes and hazard reports stay private to your account.</p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isSignup ? 'Create an account to start planning safely.' : 'Sign in to access your private NaviGuard workspace.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <label className="block text-sm font-semibold text-slate-300">
                Username
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_]{3,30}"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="your_name"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">3–30 letters, numbers, or underscores.</span>
              </label>
            )}

            <label className="block text-sm font-semibold text-slate-300">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-300">
              Password
              <span className="relative mt-2 block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? '8 to 72 characters' : 'Your password'}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? 'Please wait...' : isSignup ? 'Create account' : 'Sign in'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isSignup ? 'Already have an account?' : 'New to NaviGuard?'}{' '}
            <button type="button" onClick={switchMode} className="font-bold text-blue-400 hover:text-blue-300">
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <p className="mt-5 border-t border-white/10 pt-4 text-center text-xs text-slate-500">
            Your password is securely hashed. Only your account can access your saved hazards.
          </p>
        </section>
      </div>
    </main>
  );
}
