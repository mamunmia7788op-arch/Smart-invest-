import { useState, type FormEvent } from 'react';
import { AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile, SystemHealth } from '../types';

interface AdminLoginViewProps {
  health: SystemHealth | null;
  onSuccess: () => void;
  onGoToMemberLogin: () => void;
  onCancel: () => void;
}

export function AdminLoginView({
  health,
  onSuccess,
  onGoToMemberLogin,
  onCancel,
}: AdminLoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientReady = isSupabaseConfigured && (health?.supabaseClientConfigured ?? true);
  const serverReady = health?.supabaseServerConfigured ?? true;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError('Supabase authentication is not configured in environment variables.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Administrator email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) throw signInError;

      // Authoritative server-side RBAC check
      const verify = await apiRequest<{ ok: boolean; admin: Profile }>('/api/admin/verify', {
        requireAuth: true,
      });

      if (!verify.ok || verify.admin?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error(
          'Access denied: This portal is restricted to authorized administrators only.'
        );
      }

      onSuccess();
    } catch (err) {
      // Ensure non-admin or deactivated sessions do not linger on the admin login screen
      if (err instanceof ApiError && err.status === 403) {
        await supabase.auth.signOut();
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify administrator credentials.'
      );
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
            <span>Restricted Administrator Portal</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            SMART INVEST Admin Sign In
          </h1>
          <p className="text-sm text-slate-600">
            Sign in with an authorized administrator account to verify deposits, process withdrawals, and manage packages.
          </p>
        </div>

        {(!clientReady || !serverReady) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Supabase Environment Configuration Required</span>
            </div>
            <p className="leading-relaxed">
              Configure <span className="font-mono">VITE_SUPABASE_URL</span>, <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>, and <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, apply <span className="font-mono">supabase/schema.sql</span>, and grant <span className="font-mono">role = &apos;admin&apos;</span> in <span className="font-mono">public.profiles</span>.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-medium text-slate-700 mb-1.5">
              Administrator Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter administrator password"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientReady}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>{loading ? 'Verifying Admin Role...' : 'Verify & Open Admin Panel'}</span>
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
          <button
            type="button"
            onClick={onGoToMemberLogin}
            className="text-blue-700 hover:text-blue-800 font-medium cursor-pointer"
          >
            Member Sign In →
          </button>
        </div>
      </div>
    </main>
  );
}
