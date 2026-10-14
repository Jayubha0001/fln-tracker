import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function isPlaceholder(value) {
  return /^(your_|placeholder|change_me|replace_me)/i.test(value.trim());
}

function isServiceRoleKey(value) {
  if (value.startsWith('sb_secret_')) return true;
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/i.test(decoded);
  } catch {
    return false;
  }
}

export const supabaseConfigError =
  !supabaseUrl || isPlaceholder(supabaseUrl)
    ? 'Supabase URL configure નથી. .env.local માં VITE_SUPABASE_URL તપાસો.'
    : !supabasePublishableKey || isPlaceholder(supabasePublishableKey)
      ? '.env.local માં VITE_SUPABASE_PUBLISHABLE_KEY માટે Supabase Dashboard માંથી Publishable key મૂકો.'
      : isServiceRoleKey(supabasePublishableKey)
        ? 'Service role/secret key Frontend માં વાપરી શકાતી નથી. Supabase Publishable key અથવા legacy anon key મૂકો.'
        : '';

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey);
