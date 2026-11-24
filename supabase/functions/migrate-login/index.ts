// Edge Function: migrate-login
// Moves a player from the old SHA-256 password to a Supabase Auth login the
// first time they log in with the new app.
// Deploy with "Verify JWT" OFF: callers are not logged in yet.
// Files: index.ts, handler.ts, rules.ts (all three in this function).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleMigrateLogin, type PlayerRow } from './handler.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const nameKey = (s: string) => s.trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as invalid */ }

  try {
    const result = await handleMigrateLogin(body, {
      now: () => new Date(),
      findPlayer: async (name) => {
        // Small team: filter in code rather than building a LIKE pattern from user input.
        const { data, error } = await admin
          .from('players')
          .select('id, name, password_hash, failed_login_attempts, locked_until')
          .eq('type', 'VAST')
          .eq('active', true)
          .is('auth_user_id', null);
        if (error) throw error;
        const row = (data ?? []).find((p) => nameKey(p.name) === nameKey(name));
        return (row as PlayerRow | undefined) ?? null;
      },
      saveCounters: async (id, failedAttempts, lockedUntil) => {
        const { error } = await admin
          .from('players')
          .update({ failed_login_attempts: failedAttempts, locked_until: lockedUntil })
          .eq('id', id);
        if (error) throw error;
      },
      createAuthUser: async (email, password) => {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) return { error: error?.message ?? 'no user returned' };
        return { id: data.user.id };
      },
      linkPlayer: async (id, authUserId) => {
        const { error } = await admin
          .from('players')
          .update({ auth_user_id: authUserId, password_hash: null, failed_login_attempts: 0, locked_until: null })
          .eq('id', id)
          .is('auth_user_id', null);
        if (error) console.error('migrate-login: link failed:', error.message);
        return !error;
      },
      deleteAuthUser: async (authUserId) => {
        const { error } = await admin.auth.admin.deleteUser(authUserId);
        if (error) console.error('migrate-login: cleanup failed:', error.message);
      },
    });
    return Response.json(result.body, { status: result.httpStatus, headers: cors });
  } catch (err) {
    console.error('migrate-login: unexpected error:', err);
    return Response.json({ status: 'error' }, { status: 500, headers: cors });
  }
});
