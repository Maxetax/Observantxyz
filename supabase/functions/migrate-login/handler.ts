// Request logic for migrate-login, with database/auth calls injected so it can
// be tested in Node. index.ts wires it to Supabase.
import { hiddenEmail, onCreateFailure, planMigration } from './rules.ts';

export type PlayerRow = {
  id: string;
  password_hash: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
};

export type MigrateDeps = {
  now: () => Date;
  // Active VAST player with this name (case/space-insensitive) and no login yet.
  findPlayer: (name: string) => Promise<PlayerRow | null>;
  saveCounters: (playerId: string, failedAttempts: number, lockedUntil: string | null) => Promise<void>;
  createAuthUser: (email: string, password: string) => Promise<{ id: string } | { error: string }>;
  // For recovering from an earlier attempt that created the login but never linked it.
  findAuthUserByEmail: (email: string) => Promise<string | null>;
  isAuthUserLinked: (authUserId: string) => Promise<boolean>;
  updatePassword: (authUserId: string, password: string) => Promise<boolean>;
  // Sets auth_user_id, resets counters (see rules.ts linkFields). False unless exactly one row was linked.
  linkPlayer: (playerId: string, authUserId: string) => Promise<boolean>;
  deleteAuthUser: (authUserId: string) => Promise<void>;
};

export type HandlerResult = { httpStatus: 200 | 500; body: { status: string } };

const reply = (status: string, httpStatus: 200 | 500 = 200): HandlerResult => ({ httpStatus, body: { status } });

export async function handleMigrateLogin(body: unknown, deps: MigrateDeps): Promise<HandlerResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || typeof b.password !== 'string') return reply('invalid');
  if (b.newPassword !== undefined && typeof b.newPassword !== 'string') return reply('invalid');

  const player = await deps.findPlayer(b.name);
  if (!player) return reply('invalid');

  const plan = await planMigration({
    storedHash: player.password_hash,
    password: b.password,
    newPassword: b.newPassword as string | undefined,
    failedAttempts: player.failed_login_attempts ?? 0,
    lockedUntil: player.locked_until,
    now: deps.now(),
  });

  if (plan.action === 'reject') {
    if (plan.failedAttempts !== (player.failed_login_attempts ?? 0) || plan.lockedUntil !== player.locked_until) {
      await deps.saveCounters(player.id, plan.failedAttempts, plan.lockedUntil);
    }
    return reply(plan.status);
  }

  const login = await createOrReuseLogin(deps, hiddenEmail(player.id), plan.authPassword);
  if (!login) return reply('error', 500);

  const linked = await deps.linkPlayer(player.id, login.id);
  if (!linked) {
    // A login we just created is removed; a reused one is left for the next attempt.
    if (login.created && onCreateFailure(linked) === 'delete_auth_user') await deps.deleteAuthUser(login.id);
    return reply('error', 500);
  }
  return reply('ok');
}

// Creates the login, or reuses an unlinked one with the same hidden email left by
// an earlier attempt that died before linking (otherwise the player stays stuck).
export async function createOrReuseLogin(
  deps: Pick<MigrateDeps, 'createAuthUser' | 'findAuthUserByEmail' | 'isAuthUserLinked' | 'updatePassword'>,
  email: string,
  password: string,
): Promise<{ id: string; created: boolean } | null> {
  const created = await deps.createAuthUser(email, password);
  if (!('error' in created)) return { id: created.id, created: true };

  const existing = await deps.findAuthUserByEmail(email);
  if (!existing || (await deps.isAuthUserLinked(existing))) {
    console.error('createUser failed:', created.error);
    return null;
  }
  return (await deps.updatePassword(existing, password)) ? { id: existing, created: false } : null;
}
