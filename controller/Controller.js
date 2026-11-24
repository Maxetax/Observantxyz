// controller/Controller.js
import { useState, useEffect, useMemo, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';
import {
  getStoredPlayers,
  savePlayers,
  insertPlayer,
  getStoredMatches,
  saveMatches,
  insertMatch,
  deleteStoredPlayer,
  deleteStoredMatch,
} from './storage';
import {
  computeAllStats,
  generateDefaultRounds,
  calculateMatchOutcome,
  parseMatchDate,
} from './statsEngine';
import {
  changeOwnPassword as changeOwnPasswordWith,
  setPlayerPassword as setPlayerPasswordWith,
  removeLogin,
} from './accountActions';

const sortMatchesByDate = (list) =>
  [...list].sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));

const SAVE_FAILED = 'Opslaan mislukt. Controleer je verbinding of rechten.';

export const showMessage = (message) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message);
  } else {
    Alert.alert('Apollo', message);
  }
};

// `session`: the Supabase Auth session. Data is only loaded while it is set.
export const useAppController = (initialRoute = 'Page1', session = null) => {
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const mounted = useRef(true);
  const userId = session?.user?.id ?? null;

  const reload = async () => {
    const [p, m] = await Promise.all([getStoredPlayers(), getStoredMatches()]);
    if (mounted.current) {
      setPlayers(p);
      setMatches(sortMatchesByDate(m));
      setIsLoaded(true);
    }
  };

  // After a refused or failed save, tell the user and show the database's state again.
  const handleSaveResult = (result) => {
    if (result?.error) {
      showMessage(SAVE_FAILED);
      reload();
    }
    return result;
  };

  useEffect(() => {
    mounted.current = true;
    if (!userId) {
      setPlayers([]);
      setMatches([]);
      setActiveMatchId(null);
      setCurrentRoute(initialRoute);
      setIsLoaded(false);
      return () => {
        mounted.current = false;
      };
    }

    reload();

    const channel = supabase
      .channel('realtime_apollo_cascade_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, async () => {
        const refreshed = await getStoredMatches();
        if (mounted.current) setMatches(sortMatchesByDate(refreshed));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, async () => {
        const refreshed = await getStoredPlayers();
        if (mounted.current) setPlayers(refreshed);
      })
      .subscribe();

    return () => {
      mounted.current = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const stats = useMemo(() => computeAllStats(players, matches), [players, matches]);

  const activeMatch = useMemo(() => {
    return matches.find((m) => m.id === activeMatchId) || null;
  }, [matches, activeMatchId]);

  const navigateTo = (routeName, matchId = null) => {
    if (matchId) setActiveMatchId(matchId);
    setCurrentRoute(routeName);
  };

  // --- Persistence helpers: only the changed record is sent to Supabase ---

  const updateOnePlayer = (id, transform) => {
    setPlayers((prev) => {
      let changed = null;
      const updated = prev.map((p) => {
        if (p.id !== id) return p;
        changed = transform(p);
        return changed;
      });
      if (changed) savePlayers(updated, [changed]).then(handleSaveResult);
      return updated;
    });
  };

  const updateOneMatch = (id, transform) => {
    setMatches((prev) => {
      let changed = null;
      const updated = prev.map((m) => {
        if (m.id !== id) return m;
        changed = transform(m);
        return changed;
      });
      if (changed) saveMatches(updated, [changed]).then(handleSaveResult);
      return updated;
    });
  };

  const confirmAction = (title, message, onConfirm) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: 'Annuleren', style: 'cancel' },
          { text: 'Verwijderen', style: 'destructive', onPress: onConfirm },
        ],
        { cancelable: true }
      );
    }
  };

  // --- Players ---

  const updatePlayer = (id, updatedFields) => {
    updateOnePlayer(id, (p) => ({ ...p, ...updatedFields }));
  };

  const addPlayer = (name, type) => {
    const newP = {
      id: `p-${Date.now()}`,
      name: name.trim(),
      type,
      active: true,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };

    setPlayers((prev) => [...prev, newP]);
    // Resolves to the new id once the row exists (a password can only be set after that).
    return insertPlayer(newP).then((result) => {
      handleSaveResult(result);
      if (result.error) throw new Error(result.error);
      return newP.id;
    });
  };

  const changeOwnPassword = (password) => changeOwnPasswordWith(supabase, password);
  const setPlayerPassword = (playerId, password) => setPlayerPasswordWith(supabase, playerId, password);

  const togglePlayerActive = (id) => {
    updateOnePlayer(id, (p) => ({ ...p, active: !p.active }));
  };

  // Cascading player deletion across all matches
  const deletePlayer = (id) => {
    confirmAction(
      'Speler definitief verwijderen',
      'Deze speler wordt ook direct uit alle wedstrijdopstellingen en aanwezigheidslijsten verwijderd. Weet je het zeker?',
      () => {
        const authUserId = players.find((p) => p.id === id)?.authUserId ?? null;
        setPlayers((prevPlayers) => prevPlayers.filter((p) => p.id !== id));
        deleteStoredPlayer(id).then((result) => {
          handleSaveResult(result);
          // Only once the row is gone may the login be removed (the server checks this too).
          if (!result.error) removeLogin(supabase, authUserId);
        });

        setMatches((prevMatches) => {
          const changedMatches = [];
          const updatedMatches = prevMatches.map((match) => {
            const hasSelected = match.selectedPlayerIds?.includes(id);
            const hasDeclined = match.declinedPlayerIds?.includes(id);
            const hasRoundAssignment = match.rounds?.some((r) => r.homePlayerIds?.includes(id));

            if (!hasSelected && !hasDeclined && !hasRoundAssignment) {
              return match;
            }

            const cleanRounds = (match.rounds || []).map((round) => ({
              ...round,
              homePlayerIds: (round.homePlayerIds || []).filter((pId) => pId !== id),
            }));

            const cleaned = {
              ...match,
              selectedPlayerIds: (match.selectedPlayerIds || []).filter((pId) => pId !== id),
              declinedPlayerIds: (match.declinedPlayerIds || []).filter((pId) => pId !== id),
              rounds: cleanRounds,
              finalResult: calculateMatchOutcome(cleanRounds),
            };
            changedMatches.push(cleaned);
            return cleaned;
          });

          saveMatches(updatedMatches, changedMatches).then(handleSaveResult);
          return updatedMatches;
        });
      }
    );
  };

  // --- Matches ---

  const createMatch = ({ opponent, date, location, isHome }) => {
    const autoSelected = players
      .filter((p) => p.type === 'VAST' && p.active)
      .map((p) => p.id);

    const newM = {
      id: `m-${Date.now()}`,
      date,
      opponent: opponent.trim(),
      location: location?.trim() || (isHome ? 'Apollo Sporthal' : 'Uitlocatie'),
      isHome,
      status: 'GEPLAND',
      selectedPlayerIds: autoSelected,
      declinedPlayerIds: [],
      rounds: generateDefaultRounds(),
      finalResult: { homeScore: 0, awayScore: 0, outcome: 'PENDING' },
    };

    setMatches((prev) => sortMatchesByDate([newM, ...prev]));
    insertMatch(newM).then(handleSaveResult);
  };

  const deleteMatch = (id) => {
    confirmAction('Wedstrijd verwijderen', 'Weet je zeker dat je deze wedstrijd wilt verwijderen?', () => {
      setMatches((prev) => prev.filter((m) => m.id !== id));
      deleteStoredMatch(id).then(handleSaveResult);
      if (activeMatchId === id) {
        setActiveMatchId(null);
        setCurrentRoute('Page2');
      }
    });
  };

  const toggleDecline = (matchId, playerId) => {
    updateOneMatch(matchId, (m) => {
      const isDeclined = m.declinedPlayerIds.includes(playerId);
      return {
        ...m,
        declinedPlayerIds: isDeclined
          ? m.declinedPlayerIds.filter((id) => id !== playerId)
          : [...m.declinedPlayerIds, playerId],
        selectedPlayerIds: isDeclined
          ? [...m.selectedPlayerIds, playerId]
          : m.selectedPlayerIds.filter((id) => id !== playerId),
      };
    });
  };

  const toggleSubstitute = (matchId, playerId) => {
    updateOneMatch(matchId, (m) => {
      const isSelected = m.selectedPlayerIds.includes(playerId);
      return {
        ...m,
        selectedPlayerIds: isSelected
          ? m.selectedPlayerIds.filter((id) => id !== playerId)
          : [...m.selectedPlayerIds, playerId],
      };
    });
  };

  const updateRoundScore = (matchId, roundId, setIndex, field, value) => {
    updateOneMatch(matchId, (m) => {
      const updatedRounds = m.rounds.map((r) => {
        if (r.id !== roundId) return r;
        const updatedSets = [...r.sets];
        updatedSets[setIndex] = {
          ...updatedSets[setIndex],
          [field]: Math.max(0, value),
        };
        return { ...r, sets: updatedSets };
      });

      const finalResult = calculateMatchOutcome(updatedRounds);
      return {
        ...m,
        rounds: updatedRounds,
        finalResult,
        // Goes back to GEPLAND if a correction makes the result undecided again.
        status: finalResult.outcome !== 'PENDING' ? 'GESPEELD' : 'GEPLAND',
      };
    });
  };

  const assignPlayerToRound = (matchId, roundId, slotIndex, playerId) => {
    updateOneMatch(matchId, (m) => ({
      ...m,
      rounds: m.rounds.map((r) => {
        if (r.id !== roundId) return r;
        const current = [...r.homePlayerIds];
        current[slotIndex] = playerId;
        return { ...r, homePlayerIds: current.filter(Boolean) };
      }),
    }));
  };

  return {
    currentRoute,
    navigateTo,
    players,
    matches,
    stats,
    updatePlayer,
    activeMatch,
    isLoaded,
    reload,
    addPlayer,
    changeOwnPassword,
    setPlayerPassword,
    togglePlayerActive,
    deletePlayer,
    createMatch,
    deleteMatch,
    toggleDecline,
    toggleSubstitute,
    updateRoundScore,
    assignPlayerToRound,
  };
};
