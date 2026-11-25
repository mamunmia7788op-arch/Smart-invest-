import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    if (parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in')) {
      return parsed.origin;
    }
    const strippedPath = parsed.pathname.replace(/\/(rest|auth|storage|functions|realtime)\/v1.*$/i, '');
    return `${parsed.origin}${strippedPath}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function buildClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const buildUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const buildAnonKey = (rawSupabaseAnonKey || '').trim().replace(/^["']|["']$/g, '');

export let isSupabaseConfigured = Boolean(buildUrl && buildAnonKey);
export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? buildClient(buildUrl, buildAnonKey)
  : null;

let initPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

export async function initSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) {
    return supabase;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        supabaseUrl?: string;
        supabaseAnonKey?: string;
        configured?: boolean;
      };
      const runtimeUrl = normalizeSupabaseUrl(payload.supabaseUrl);
      const runtimeKey = (payload.supabaseAnonKey || '').trim().replace(/^["']|["']$/g, '');
      if (runtimeUrl && runtimeKey) {
        supabase = buildClient(runtimeUrl, runtimeKey);
        isSupabaseConfigured = true;
        return supabase;
      }
      return null;
    } catch {
      return null;
    } finally {
      if (!supabase) {
        initPromise = null;
      }
    }
  })();

  return initPromise;
}
