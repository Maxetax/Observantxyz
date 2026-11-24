// controller/supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zhatqwobnsgmuocxsjmb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P7YOPKK4Ri2I4yoiXOuf3w_pzz9IaZH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);