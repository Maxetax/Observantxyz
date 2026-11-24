// controller/accountActions.js
// Password and login management. The client is passed in so this can be tested
// without React Native. All functions return { status }.
import { normalizePassword, MIN_PASSWORD_LENGTH } from './passwordRules.js';

// The logged-in player changes their own password.
export async function changeOwnPassword(client, password) {
  const next = normalizePassword(password);
  if (next.length < MIN_PASSWORD_LENGTH) return { status: 'weak_password' };
  try {
    const { error } = await client.auth.updateUser({ password: next });
    return { status: error ? 'error' : 'ok' };
  } catch {
    return { status: 'error' };
  }
}

const callAdminAccount = async (client, body) => {
  try {
    const { data, error } = await client.functions.invoke('admin-account', { body });
    if (error || !data?.status) return { status: 'error' };
    return { status: data.status };
  } catch {
    return { status: 'error' };
  }
};

// Admin sets (or resets) a VAST player's password, creating their login if needed.
// Status: 'ok' | 'weak_password' | 'forbidden' | 'not_found' | 'invalid_request' | 'error'
export async function setPlayerPassword(client, playerId, password) {
  const next = normalizePassword(password);
  if (next.length < MIN_PASSWORD_LENGTH) return { status: 'weak_password' };
  return callAdminAccount(client, { action: 'set-password', playerId, password: next });
}

// Admin removes the login of a player whose row was just deleted.
export async function removeLogin(client, authUserId) {
  if (!authUserId) return { status: 'ok' };
  return callAdminAccount(client, { action: 'remove', authUserId });
}
