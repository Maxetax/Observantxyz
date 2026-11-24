// Request logic for admin-account, with database/auth calls injected so it can
// be tested in Node. index.ts wires it to Supabase.
import { hiddenEmail, parseAdminRequest } from './rules.ts';

export type PlayerInfo = { id: string; type: string; active: boolean; is_admin: boolean; auth_user_id: string | null };

export type AdminDeps = {
  getPlayerByAuthId: (authUserId: string) => Promise<PlayerInfo | null>;
  getPlayer: (playerId: string) => Promise<PlayerInfo | null>;
  isAuthUserLinked: (authUserId: string) => Promise<boolean>;
  updatePassword: (authUserId: string, password: string) => Promise<boolean>;
  createAuthUser: (email: string, password: string) => Promise<{ id: string } | { error: string }>;
  // Sets auth_user_id and clears password_hash. Returns false on failure.
  linkPlayer: (playerId: string, authUserId: string) => Promise<boolean>;
  deleteAuthUser: (authUserId: string) => Promise<void>;
};

export type HandlerResult = { httpStatus: 200 | 500; body: { status: string } };
const reply = (status: string, httpStatus: 200 | 500 = 200): HandlerResult => ({ httpStatus, body: { status } });

// callerAuthId: the verified auth user id of the caller, or null.
export async function handleAdminAccount(body: unknown, callerAuthId: string | null, deps: AdminDeps): Promise<HandlerResult> {
  if (!callerAuthId) return reply('forbidden');
  const caller = await deps.getPlayerByAuthId(callerAuthId);
  if (!caller || !caller.active || !caller.is_admin) return reply('forbidden');

  const req = parseAdminRequest(body);
  if ('error' in req) return reply(req.error);

  if (req.action === 'remove') {
    // Only logins no longer linked to any player may be removed.
    if (await deps.isAuthUserLinked(req.authUserId)) return reply('forbidden');
    await deps.deleteAuthUser(req.authUserId);
    return reply('ok');
  }

  const target = await deps.getPlayer(req.playerId);
  if (!target || target.type !== 'VAST' || !target.active) return reply('not_found');

  if (target.auth_user_id) {
    return (await deps.updatePassword(target.auth_user_id, req.password)) ? reply('ok') : reply('error', 500);
  }

  const created = await deps.createAuthUser(hiddenEmail(target.id), req.password);
  if ('error' in created) {
    console.error('admin-account: createUser failed:', created.error);
    return reply('error', 500);
  }
  if (!(await deps.linkPlayer(target.id, created.id))) {
    await deps.deleteAuthUser(created.id);
    return reply('error', 500);
  }
  return reply('ok');
}
