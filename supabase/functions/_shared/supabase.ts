import { createClient } from 'npm:@supabase/supabase-js@2.99.1';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const supabaseAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
const supabaseServiceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const assertEnv = (name: string, value: string) => {
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
};

const buildClientOptions = () => ({
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'boh-altcha-auth-gateway',
    },
  },
});

export const createServiceClient = () => {
  assertEnv('SUPABASE_URL', supabaseUrl);
  assertEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey);
  return createClient(supabaseUrl, supabaseServiceRoleKey, buildClientOptions());
};

export const createAnonClient = () => {
  assertEnv('SUPABASE_URL', supabaseUrl);
  assertEnv('SUPABASE_ANON_KEY', supabaseAnonKey);
  return createClient(supabaseUrl, supabaseAnonKey, buildClientOptions());
};
