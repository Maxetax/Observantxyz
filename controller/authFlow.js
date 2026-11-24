// controller/authFlow.js
// Name + password login on top of Supabase Auth. The client is passed in so
// this can be tested without React Native.
import { normalizePassword, MIN_PASSWORD_LENGTH } from './passwordRules.js';

// Returns { status }: 'ok' | 'invalid' | 'locked' | 'needs_new_password'
//                    | 'weak_new_password' | 'error'
export async function signInWithName(client, { name, password, newPassword }) {
  const pwd = normalizePassword(password);
  const next = newPassword === undefined ? undefined : normalizePassword(newPassword);
  if (next !== undefined && next.length < MIN_PASSWORD_LENGTH) return { status: 'weak_new_password' };

  try {
    const { data, error } = await client.rpc('login_email', { p_name: name });
    if (error) return { status: 'error' };
    const account = Array.isArray(data) ? data[0] : data;
    if (!account?.email) return { status: 'invalid' };

    let loginPassword = pwd;
    if (!account.migrated) {
      const body = next === undefined ? { name, password: pwd } : { name, password: pwd, newPassword: next };
      const { data: result, error: fnError } = await client.functions.invoke('migrate-login', { body });
      if (fnError || !result?.status) return { status: 'error' };
      if (result.status !== 'ok') return { status: result.status };
      loginPassword = next ?? pwd;
    }

    const { error: signInError } = await client.auth.signInWithPassword({
      email: account.email,
      password: loginPassword,
    });
    if (signInError) return { status: account.migrated ? 'invalid' : 'error' };
    return { status: 'ok' };
  } catch {
    return { status: 'error' };
  }
}
