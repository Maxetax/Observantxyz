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
  // Sets auth_user_id, clears password_hash and counters. Returns false on failure.
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

  const created = await deps.createAuthUser(hiddenEmail(player.id), plan.authPassword);
  if ('error' in created) {
    console.error('migrate-login: createUser failed:', created.error);
    return reply('error', 500);
  }

  const linked = await deps.linkPlayer(player.id, created.id);
  if (onCreateFailure(linked) === 'delete_auth_user') {
    await deps.deleteAuthUser(created.id);
    return reply('error', 500);
  }
  return reply('ok');
}
