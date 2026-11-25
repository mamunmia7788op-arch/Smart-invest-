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

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = (rawSupabaseAnonKey || '').trim().replace(/^["']|["']$/g, '');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
