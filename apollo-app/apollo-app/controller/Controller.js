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

export const useAppController = (initialRoute = 'Page1') => {
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const sortMatchesByDate = (list) => {
    return [...list].sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));
  };

  useEffect(() => {
    let isMounted = true;

    const loadAll = async () => {
      const p = await getStoredPlayers();
      const m = await getStoredMatches();
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

  // In controller/Controller.js toevoegen:

  const updatePlayer = async (id, updatedFields) => {
    setPlayers((prev) => {
      const updated = prev.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          ...updatedFields,
        };
      });
      savePlayers(updated);
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

  const addPlayer = async (name, type) => {
    const newP = {
      id: `p-${Date.now()}`,
      name: name.trim(),
      type,
      active: true,
      createdAt: new Date().toISOString(),
    };

    setPlayers((prev) => {
      const updated = [...prev, newP];
      savePlayers(updated);
      return updated;
    });
  };

  const togglePlayerActive = async (id) => {
    setPlayers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
      savePlayers(updated);
      return updated;
    });
  };

  // Cascading Player Deletion across entire database
  const deletePlayer = (id) => {
    confirmAction(
      'Speler definitief verwijderen',
      'Deze speler wordt ook direct uit alle wedstrijdopstellingen en aanwezigheidslijsten verwijderd. Weet je het zeker?',
      async () => {
        // 1. Verwijder uit spelerslijst
        setPlayers((prevPlayers) => {
          const updatedPlayers = prevPlayers.filter((p) => p.id !== id);
          deleteStoredPlayer(id);
          savePlayers(updatedPlayers);
          return updatedPlayers;
        });

        // 2. Cascade verwijdering uit alle wedstrijden
        setMatches((prevMatches) => {
          const updatedMatches = prevMatches.map((match) => {
            const hasSelected = match.selectedPlayerIds?.includes(id);
            const hasDeclined = match.declinedPlayerIds?.includes(id);
            const hasRoundAssignment = match.rounds?.some((r) => r.homePlayerIds?.includes(id));

            if (!hasSelected && !hasDeclined && !hasRoundAssignment) {
              return match;
            }

            const cleanSelected = (match.selectedPlayerIds || []).filter((pId) => pId !== id);
            const cleanDeclined = (match.declinedPlayerIds || []).filter((pId) => pId !== id);
            const cleanRounds = (match.rounds || []).map((round) => {
              if (!round.homePlayerIds?.includes(id)) return round;
              return {
                ...round,
                homePlayerIds: round.homePlayerIds.filter((pId) => pId !== id),
              };
            });

            const finalResult = calculateMatchOutcome(cleanRounds);

            return {
              ...match,
              selectedPlayerIds: cleanSelected,
              declinedPlayerIds: cleanDeclined,
              rounds: cleanRounds,
              finalResult,
            };
          });

          saveMatches(updatedMatches);
          return updatedMatches;
        });
      }
    );
  };

  const createMatch = async ({ opponent, date, location, isHome }) => {
    const autoSelected = players
      .filter((p) => p.type === 'VAST' && p.active)
      .map((p) => p.id);

    const newM = {
      id: `m-${Date.now()}`,
      date,
      opponent,
      location: location || (isHome ? 'Apollo Sporthal' : 'Uitlocatie'),
      isHome,
      status: 'GEPLAND',
      selectedPlayerIds: autoSelected,
      declinedPlayerIds: [],
      rounds: generateDefaultRounds(),
      finalResult: { homeScore: 0, awayScore: 0, outcome: 'PENDING' },
    };

    setMatches((prev) => {
      const updated = sortMatchesByDate([newM, ...prev]);
      saveMatches(updated);
      return updated;
    });
  };

  const deleteMatch = (id) => {
    confirmAction('Wedstrijd verwijderen', 'Weet je zeker dat je deze wedstrijd wilt verwijderen?', async () => {
      setMatches((prev) => {
        const updated = prev.filter((m) => m.id !== id);
        deleteStoredMatch(id);
        saveMatches(updated);
        return updated;
      });
      if (activeMatchId === id) {
        setActiveMatchId(null);
        setCurrentRoute('Page2');
      }
    });
  };

  const toggleDecline = async (matchId, playerId) => {
    setMatches((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== matchId) return m;
        const isDeclined = m.declinedPlayerIds.includes(playerId);
        const newDeclined = isDeclined
          ? m.declinedPlayerIds.filter((id) => id !== playerId)
          : [...m.declinedPlayerIds, playerId];
        const newSelected = isDeclined
          ? [...m.selectedPlayerIds, playerId]
          : m.selectedPlayerIds.filter((id) => id !== playerId);

        return {
          ...m,
          declinedPlayerIds: newDeclined,
          selectedPlayerIds: newSelected,
        };
      });
      saveMatches(updated);
      return updated;
    });
  };

  const toggleSubstitute = async (matchId, playerId) => {
    setMatches((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== matchId) return m;
        const isSelected = m.selectedPlayerIds.includes(playerId);
        const newSelected = isSelected
          ? m.selectedPlayerIds.filter((id) => id !== playerId)
          : [...m.selectedPlayerIds, playerId];
        return { ...m, selectedPlayerIds: newSelected };
      });
      saveMatches(updated);
      return updated;
    });
  };

  const updateRoundScore = async (matchId, roundId, setIndex, field, value) => {
    setMatches((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== matchId) return m;
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
          status: finalResult.outcome !== 'PENDING' ? 'GESPEELD' : m.status,
        };
      });
      saveMatches(updated);
      return updated;
    });
  };

  const assignPlayerToRound = async (matchId, roundId, slotIndex, playerId) => {
    setMatches((prev) => {
      const updated = prev.map((m) => {
        if (m.id !== matchId) return m;
        const updatedRounds = m.rounds.map((r) => {
          if (r.id !== roundId) return r;
          const current = [...r.homePlayerIds];
          current[slotIndex] = playerId;
          return { ...r, homePlayerIds: current.filter(Boolean) };
        });
        return { ...m, rounds: updatedRounds };
      });
      saveMatches(updated);
      return updated;
    });
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