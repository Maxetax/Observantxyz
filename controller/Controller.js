// controller/Controller.js
import { useState, useEffect, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';
import {
  getStoredPlayers,
  savePlayers,
  getStoredMatches,
  saveMatches,
  deleteStoredPlayer,
  deleteStoredMatch,
} from './storage';
import {
  computeAllStats,
  generateDefaultRounds,
  calculateMatchOutcome,
  parseMatchDate,
} from './statsEngine';

const sortMatchesByDate = (list) =>
  [...list].sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));

export const useAppController = (initialRoute = 'Page1') => {
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAll = async () => {
      const [p, m] = await Promise.all([getStoredPlayers(), getStoredMatches()]);
      if (isMounted) {
        setPlayers(p);
        setMatches(sortMatchesByDate(m));
        setIsLoaded(true);
      }
    };
    loadAll();

    let channel;
    if (supabase) {
      channel = supabase
        .channel('realtime_apollo_cascade_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'matches' },
          async () => {
            const refreshedMatches = await getStoredMatches();
            if (isMounted) setMatches(sortMatchesByDate(refreshedMatches));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players' },
          async () => {
            const refreshedPlayers = await getStoredPlayers();
            if (isMounted) setPlayers(refreshedPlayers);
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

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
      if (changed) savePlayers(updated, [changed]);
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
      if (changed) saveMatches(updated, [changed]);
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
      createdAt: new Date().toISOString(),
    };

    setPlayers((prev) => {
      const updated = [...prev, newP];
      savePlayers(updated, [newP]);
      return updated;
    });
  };

  const togglePlayerActive = (id) => {
    updateOnePlayer(id, (p) => ({ ...p, active: !p.active }));
  };

  // Cascading player deletion across all matches
  const deletePlayer = (id) => {
    confirmAction(
      'Speler definitief verwijderen',
      'Deze speler wordt ook direct uit alle wedstrijdopstellingen en aanwezigheidslijsten verwijderd. Weet je het zeker?',
      () => {
        setPlayers((prevPlayers) => {
          const updatedPlayers = prevPlayers.filter((p) => p.id !== id);
          savePlayers(updatedPlayers, []);
          deleteStoredPlayer(id);
          return updatedPlayers;
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

          saveMatches(updatedMatches, changedMatches);
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

    setMatches((prev) => {
      const updated = sortMatchesByDate([newM, ...prev]);
      saveMatches(updated, [newM]);
      return updated;
    });
  };

  const deleteMatch = (id) => {
    confirmAction('Wedstrijd verwijderen', 'Weet je zeker dat je deze wedstrijd wilt verwijderen?', () => {
      setMatches((prev) => {
        const updated = prev.filter((m) => m.id !== id);
        saveMatches(updated, []);
        deleteStoredMatch(id);
        return updated;
      });
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
    addPlayer,
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
