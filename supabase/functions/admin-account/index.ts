// Edge Function: admin-account
// Lets an admin set a player's password (creating their login if needed) and
// remove the login of a deleted player.
// Deploy with "Verify JWT" ON. Files: index.ts, handler.ts, rules.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleAdminAccount, type PlayerInfo } from './handler.ts';
import { linkFields } from './rules.ts';

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

const PLAYER_FIELDS = 'id, type, active, is_admin, auth_user_id';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as invalid_request */ }

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    const callerAuthId = userData?.user?.id ?? null;

    const result = await handleAdminAccount(body, callerAuthId, {
      getPlayerByAuthId: async (authUserId) => {
        const { data, error } = await admin.from('players').select(PLAYER_FIELDS).eq('auth_user_id', authUserId).maybeSingle();
        if (error) throw error;
        return data as PlayerInfo | null;
      },
      getPlayer: async (playerId) => {
        const { data, error } = await admin.from('players').select(PLAYER_FIELDS).eq('id', playerId).maybeSingle();
        if (error) throw error;
        return data as PlayerInfo | null;
      },
      isAuthUserLinked: async (authUserId) => {
        const { count, error } = await admin.from('players').select('id', { count: 'exact', head: true }).eq('auth_user_id', authUserId);
        if (error) throw error;
        return (count ?? 0) > 0;
      },
      updatePassword: async (authUserId, password) => {
        const { error } = await admin.auth.admin.updateUserById(authUserId, { password });
        if (error) console.error('admin-account: updateUserById failed:', error.message);
        return !error;
      },
      createAuthUser: async (email, password) => {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) return { error: error?.message ?? 'no user returned' };
        return { id: data.user.id };
      },
      linkPlayer: async (playerId, authUserId) => {
        const { data, error } = await admin
          .from('players')
          .update(linkFields(authUserId))
          .eq('id', playerId)
          .is('auth_user_id', null)
          .select('id');
        if (error) console.error('admin-account: link failed:', error.message);
        return !error && (data ?? []).length === 1;
      },
      findAuthUserByEmail: async (email) => {
        const { data, error } = await admin.rpc('auth_user_id_for_email', { p_email: email });
        if (error) throw error;
        return (data as string | null) ?? null;
      },
      deleteAuthUser: async (authUserId) => {
        const { error } = await admin.auth.admin.deleteUser(authUserId);
        // "User not found" means it is already gone, which is fine.
        if (error && !/not.?found/i.test(error.message)) console.error('admin-account: deleteUser failed:', error.message);
      },
    });
    return Response.json(result.body, { status: result.httpStatus, headers: cors });
  } catch (err) {
    console.error('admin-account: unexpected error:', err);
    return Response.json({ status: 'error' }, { status: 500, headers: cors });
  }
});
