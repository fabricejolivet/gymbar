import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initializationAttempted = false;

function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (initializationAttempted) {
    return null;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Environment variables not available yet');
    return null;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    initializationAttempted = true;
    console.log('[Supabase] Client initialized successfully');
    return supabaseInstance;
  } catch (err) {
    console.error('[Supabase] Failed to initialize client:', err);
    return null;
  }
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) {
      throw new Error('Supabase client not initialized');
    }
    return client[prop as keyof SupabaseClient];
  }
});
