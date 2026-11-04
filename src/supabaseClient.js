import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

let client;

export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.'
    );
  }

  if (!client) client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
};
