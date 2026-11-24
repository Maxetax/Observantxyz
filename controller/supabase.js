// controller/supabase.js
// The publishable key is meant to be public: what it can do is limited by the
// database's row-level security (see supabase/migrations).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zhatqwobnsgmuocxsjmb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P7YOPKK4Ri2I4yoiXOuf3w_pzz9IaZH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
