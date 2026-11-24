// controller/storage.js
// Reads and writes players/matches. Supabase is the source of truth; AsyncStorage
// is only an offline cache for a logged-in player.
//
// Never use upsert: Postgres checks the INSERT policy on upsert even when it
// ends up updating, and inserts are admin-only. Existing rows use update(),
// new rows use insert().
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { PLAYER_COLUMNS } from './columns';

export { PLAYER_COLUMNS };

const STORAGE_KEY_PLAYERS = '@apollo_badminton_players_v8';
const STORAGE_KEY_MATCHES = '@apollo_badminton_matches_v8';
// Keys used by older app versions (contained password hashes / cached user).
const LEGACY_KEYS = [
  '@apollo_badminton_players_v7',
  '@apollo_badminton_matches_v7',
  '@apollo_auth_current_user_v2',
];

// Editable player fields (no id/created_at: those are never updated).
const playerFieldsForDb = (p) => ({
  name: p.name,
  type: p.type,
  active: p.active ?? true,
  is_admin: p.isAdmin ?? false,
  phone: p.phone || '',
  address: p.address || '',
  notes: p.notes || '',
});

const formatPlayerFromDb = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  active: p.active ?? true,
  isAdmin: p.is_admin ?? false,
  phone: p.phone || '',
  address: p.address || '',
  notes: p.notes || '',
  createdAt: p.created_at,
  authUserId: p.auth_user_id ?? null,
});

const matchFieldsForDb = (m) => ({
  date: m.date,
  opponent: m.opponent,
  location: m.location,
  is_home: m.isHome,
  status: m.status,
  selected_player_ids: m.selectedPlayerIds,
  declined_player_ids: m.declinedPlayerIds,
  rounds: m.rounds,
  final_result: m.finalResult,
});

const formatMatchFromDb = (m) => ({
  id: m.id,
  date: m.date,
  opponent: m.opponent,
  location: m.location,
  isHome: m.is_home,
  status: m.status,
  selectedPlayerIds: m.selected_player_ids ?? [],
  declinedPlayerIds: m.declined_player_ids ?? [],
  rounds: m.rounds ?? [],
  finalResult: m.final_result ?? { homeScore: 0, awayScore: 0, outcome: 'PENDING' },
});

const errorMessage = (err) => err?.message || String(err);

// Update each changed row; a row the database refused (0 rows back) counts as an error.
const updateRows = async (table, rows) => {
  for (const { id, fields } of rows) {
    const { data, error } = await supabase.from(table).update(fields).eq('id', id).select('id');
    if (error) return { error: errorMessage(error) };
    if (!data || data.length === 0) return { error: 'not allowed' };
  }
  return {};
};

const cache = (key, value) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

const readCache = async (key) => {
  try {
    const local = await AsyncStorage.getItem(key);
    return local ? JSON.parse(local) : [];
  } catch {
    return [];
  }
};

// ---------- players ----------

export const getStoredPlayers = async () => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_COLUMNS)
      .order('created_at', { ascending: true });
    if (!error && data) {
      const players = data.map(formatPlayerFromDb);
      await cache(STORAGE_KEY_PLAYERS, players);
      return players;
    }
  } catch {
    // offline: fall through to cache
  }
  return readCache(STORAGE_KEY_PLAYERS);
};

// `changed`: only the players that were modified (never the whole list).
export const savePlayers = async (players, changed = []) => {
  await cache(STORAGE_KEY_PLAYERS, players);
  try {
    return await updateRows('players', changed.map((p) => ({ id: p.id, fields: playerFieldsForDb(p) })));
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

export const insertPlayer = async (player) => {
  try {
    const { error } = await supabase
      .from('players')
      .insert({ id: player.id, created_at: player.createdAt, ...playerFieldsForDb(player) });
    return error ? { error: errorMessage(error) } : {};
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

export const deleteStoredPlayer = async (id) => {
  try {
    const { data, error } = await supabase.from('players').delete().eq('id', id).select('id');
    if (error) return { error: errorMessage(error) };
    if (!data || data.length === 0) return { error: 'not allowed' };
    return {};
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

// ---------- matches ----------

export const getStoredMatches = async () => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false });
    // A successful (even empty) response is the truth; only fall back to cache on error/offline.
    if (!error && data) {
      const matches = data.map(formatMatchFromDb);
      await cache(STORAGE_KEY_MATCHES, matches);
      return matches;
    }
  } catch {
    // offline: fall through to cache
  }
  return readCache(STORAGE_KEY_MATCHES);
};

// `changed`: only the matches that were modified (never the whole list).
export const saveMatches = async (matches, changed = []) => {
  await cache(STORAGE_KEY_MATCHES, matches);
  try {
    return await updateRows('matches', changed.map((m) => ({ id: m.id, fields: matchFieldsForDb(m) })));
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

export const insertMatch = async (match) => {
  try {
    const { error } = await supabase.from('matches').insert({ id: match.id, ...matchFieldsForDb(match) });
    return error ? { error: errorMessage(error) } : {};
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

export const deleteStoredMatch = async (id) => {
  try {
    const { data, error } = await supabase.from('matches').delete().eq('id', id).select('id');
    if (error) return { error: errorMessage(error) };
    if (!data || data.length === 0) return { error: 'not allowed' };
    return {};
  } catch (err) {
    return { error: errorMessage(err) };
  }
};

// ---------- session ----------

// Called on logout: nothing from the team stays on the device.
export const clearLocalCache = async () => {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEY_PLAYERS, STORAGE_KEY_MATCHES, ...LEGACY_KEYS]);
  } catch {
    // ignore
  }
};
