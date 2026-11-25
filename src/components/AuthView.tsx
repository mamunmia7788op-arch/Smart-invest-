import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { getSupabaseClient, initSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import type { SystemHealth } from '../types';

interface AuthViewProps {
  health: SystemHealth | null;
  supabaseReady: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AuthView({ health, supabaseReady, onSuccess, onCancel }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clientReady =
    (supabaseReady || isSupabaseConfigured || Boolean(getSupabaseClient())) &&
    (health?.supabaseClientConfigured ?? true);
  const serverReady = health?.supabaseServerConfigured ?? true;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const client = getSupabaseClient() ?? (await initSupabaseClient());
    if (!client) {
      setError('Supabase authentication is not configured in environment variables.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) throw signInError;
        onSuccess();
      } else {
        const { data, error: signUpError } = await client.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
            },
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          onSuccess();
        } else {
          setNotice(
            'Registration submitted. Please check your email inbox to confirm your account before signing in.'
          );
          setMode('login');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Supabase Verified Member Access</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {mode === 'login' ? 'Sign In to SMART INVEST' : 'Create Member Account'}
          </h1>
          <p className="text-sm text-slate-600">
            {mode === 'login'
              ? 'Access your verified balance, packages, and transaction ledger.'
              : 'Register a member account. Balances begin at ৳0.00 until deposits are verified.'}
          </p>
        </div>

        {(!clientReady || !serverReady) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Supabase Environment Configuration Required</span>
            </div>
            <p className="leading-relaxed">
              Set <span className="font-mono">VITE_SUPABASE_URL</span>, <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>, and server secret <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in Settings / Secrets, and apply <span className="font-mono">supabase/schema.sql</span> to your Supabase PostgreSQL database.
            </p>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your legal full name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <input
                  id="auth-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1.5">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientReady}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>
              {loading
                ? 'Authenticating...'
                : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </span>
          </button>
        </form>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={onCancel}
            className="hover:text-slate-900 font-medium cursor-pointer"
          >
            ← Back to Overview
          </button>
          <span className="text-slate-400">Encrypted Supabase Session</span>
        </div>
      </div>
    </main>
  );
}
