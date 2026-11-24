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
  findAuthUserByEmail: (email: string) => Promise<string | null>;
  // Sets auth_user_id (see rules.ts linkFields). False unless exactly one row was linked.
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

  const login = await createOrReuseLogin(deps, hiddenEmail(target.id), req.password);
  if (!login) return reply('error', 500);
  if (!(await deps.linkPlayer(target.id, login.id))) {
    // A login we just created is removed; a reused one is left for the next attempt.
    if (login.created) await deps.deleteAuthUser(login.id);
    return reply('error', 500);
  }
  return reply('ok');
}

// Same as migrate-login/handler.ts (dashboard functions can't share files):
// create the login, or reuse an unlinked one left by an earlier failed attempt.
async function createOrReuseLogin(
  deps: AdminDeps,
  email: string,
  password: string,
): Promise<{ id: string; created: boolean } | null> {
  const created = await deps.createAuthUser(email, password);
  if (!('error' in created)) return { id: created.id, created: true };

  const existing = await deps.findAuthUserByEmail(email);
  if (!existing || (await deps.isAuthUserLinked(existing))) {
    console.error('admin-account: createUser failed:', created.error);
    return null;
  }
  return (await deps.updatePassword(existing, password)) ? { id: existing, created: false } : null;
}
