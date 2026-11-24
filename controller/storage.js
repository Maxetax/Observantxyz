// controller/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STORAGE_KEY_PLAYERS = '@apollo_badminton_players_v7';
const STORAGE_KEY_MATCHES = '@apollo_badminton_matches_v7';
const STORAGE_KEY_AUTH_USER = '@apollo_auth_current_user_v2';

const DEFAULT_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

const INITIAL_PLAYERS = [
  { id: 'p-1', name: 'Lars van Dijk', type: 'VAST', active: true, isAdmin: true, passwordHash: DEFAULT_HASH, phone: '06-12345678', address: 'Kerkstraat 1, Utrecht', notes: 'Aanvoerder' },
  { id: 'p-2', name: 'Daan Meijer', type: 'VAST', active: true, isAdmin: false, passwordHash: DEFAULT_HASH, phone: '', address: '', notes: '' },
  { id: 'p-3', name: 'Bram Bakker', type: 'VAST', active: true, isAdmin: false, passwordHash: DEFAULT_HASH, phone: '', address: '', notes: '' },
  { id: 'p-4', name: 'Sven de Jong', type: 'VAST', active: true, isAdmin: false, passwordHash: DEFAULT_HASH, phone: '', address: '', notes: '' },
  { id: 'p-5', name: 'Thijs Visser', type: 'WISSEL', active: true, isAdmin: false, passwordHash: null, phone: '', address: '', notes: '' },
  { id: 'p-6', name: 'Jasper Smit', type: 'WISSEL', active: true, isAdmin: false, passwordHash: null, phone: '', address: '', notes: '' },
];

const formatPlayerForDb = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  active: p.active ?? true,
  is_admin: p.isAdmin ?? p.is_admin ?? false,
  password_hash: p.passwordHash || p.password_hash || DEFAULT_HASH,
  phone: p.phone || '',
  address: p.address || '',
  notes: p.notes || '',
  created_at: p.createdAt || p.created_at || new Date().toISOString(),
});

const formatPlayerFromDb = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  active: p.active ?? true,
  isAdmin: p.is_admin ?? p.isAdmin ?? false,
  passwordHash: p.password_hash || p.passwordHash || DEFAULT_HASH,
  phone: p.phone || '',
  address: p.address || '',
  notes: p.notes || '',
  createdAt: p.created_at || p.createdAt || new Date().toISOString(),
});

export const getStoredPlayers = async () => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(formatPlayerFromDb);
      }
    }

    const local = await AsyncStorage.getItem(STORAGE_KEY_PLAYERS);
    if (local !== null) return JSON.parse(local);

    await AsyncStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(INITIAL_PLAYERS));
    if (supabase) {
      await supabase.from('players').upsert(INITIAL_PLAYERS.map(formatPlayerForDb));
    }
    return INITIAL_PLAYERS;
  } catch (err) {
    return INITIAL_PLAYERS;
  }
};

// `changed` = only the players that were actually modified. Upserting the whole
// list would overwrite other users' concurrent edits with this device's stale copy.
export const savePlayers = async (players, changed = players) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(players));
    if (supabase && changed.length > 0) {
      const { error } = await supabase.from('players').upsert(changed.map(formatPlayerForDb));
      if (error) console.error('Save players error:', error.message);
    }
  } catch (err) {
    console.error('Save players error:', err);
  }
};

export const deleteStoredPlayer = async (id) => {
  try {
    const local = await AsyncStorage.getItem(STORAGE_KEY_PLAYERS);
    if (local !== null) {
      const filtered = JSON.parse(local).filter((p) => p.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(filtered));
    }
    if (supabase) {
      await supabase.from('players').delete().eq('id', id);
    }
  } catch (err) {
    console.error('Delete player error:', err);
  }
};

export const getStoredMatches = async () => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false });

      // A successful (even empty) response is the truth; only fall back to cache on error/offline.
      if (!error && data) {
        const mapped = data.map((m) => ({
          id: m.id,
          date: m.date,
          opponent: m.opponent,
          location: m.location,
          isHome: m.is_home ?? m.isHome,
          status: m.status,
          selectedPlayerIds: m.selected_player_ids ?? m.selectedPlayerIds ?? [],
          declinedPlayerIds: m.declined_player_ids ?? m.declinedPlayerIds ?? [],
          rounds: m.rounds ?? [],
          finalResult: m.final_result ?? m.finalResult ?? { homeScore: 0, awayScore: 0, outcome: 'PENDING' },
        }));
        await AsyncStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(mapped));
        return mapped;
      }
    }

    const local = await AsyncStorage.getItem(STORAGE_KEY_MATCHES);
    if (local !== null) return JSON.parse(local);

    return [];
  } catch (err) {
    return [];
  }
};

// `changed` = only the matches that were actually modified (see savePlayers).
export const saveMatches = async (matches, changed = matches) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(matches));
    if (supabase && changed.length > 0) {
      const records = changed.map((m) => ({
        id: m.id,
        date: m.date,
        opponent: m.opponent,
        location: m.location,
        is_home: m.isHome,
        status: m.status,
        selected_player_ids: m.selectedPlayerIds,
        declined_player_ids: m.declinedPlayerIds,
        rounds: m.rounds,
        final_result: m.finalResult,
      }));
      const { error } = await supabase.from('matches').upsert(records);
      if (error) console.error('Save matches error:', error.message);
    }
  } catch (err) {
    console.error('Save matches error:', err);
  }
};

export const deleteStoredMatch = async (id) => {
  try {
    const local = await AsyncStorage.getItem(STORAGE_KEY_MATCHES);
    if (local !== null) {
      const filtered = JSON.parse(local).filter((m) => m.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(filtered));
    }
    if (supabase) {
      await supabase.from('matches').delete().eq('id', id);
    }
  } catch (err) {
    console.error('Delete match error:', err);
  }
};

export const getSavedUser = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY_AUTH_USER);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveAuthUser = async (user) => {
  try {
    if (user) {
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH_USER);
    }
  } catch (e) {
    console.error('Auth save error:', e);
  }
};