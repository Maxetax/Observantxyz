// controller/statsEngine.js

export const parseMatchDate = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.trim().split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
    if (parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
  }
  const fallback = new Date(dateStr).getTime();
  return isNaN(fallback) ? 0 : fallback;
};

export const formatToDDMMYYYY = (text) => {
  const cleaned = text.replace(/[^0-9]/g, '');
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 4)}-${cleaned.slice(4, 8)}`;
};

export const evaluateSet = (home, away) => {
  if (home === 30 && away < 30) return 'HOME';
  if (away === 30 && home < 30) return 'AWAY';
  if (home >= 21 && home - away >= 2) return 'HOME';
  if (away >= 21 && away - home >= 2) return 'AWAY';
  return 'PENDING';
};

export const evaluateRound = (sets) => {
  const set1Winner = evaluateSet(sets[0].homeScore, sets[0].awayScore);
  const set2Winner = evaluateSet(sets[1].homeScore, sets[1].awayScore);

  if (set1Winner === 'HOME' && set2Winner === 'HOME') return 'HOME';
  if (set1Winner === 'AWAY' && set2Winner === 'AWAY') return 'AWAY';

  if (set1Winner !== 'PENDING' && set2Winner !== 'PENDING' && set1Winner !== set2Winner) {
    const set3Winner = evaluateSet(sets[2].homeScore, sets[2].awayScore);
    if (set3Winner === 'HOME') return 'HOME';
    if (set3Winner === 'AWAY') return 'AWAY';
  }

  return 'PENDING';
};

export const calculateMatchOutcome = (rounds) => {
  let homeScore = 0;
  let awayScore = 0;

  rounds.forEach((r) => {
    const winner = evaluateRound(r.sets);
    r.winner = winner;
    if (winner === 'HOME') homeScore++;
    if (winner === 'AWAY') awayScore++;
  });

  let outcome = 'PENDING';
  const completedRounds = homeScore + awayScore;

  if (completedRounds === 8 || homeScore >= 5 || awayScore >= 5) {
    if (homeScore > awayScore) outcome = 'GEWONNEN';
    else if (homeScore < awayScore) outcome = 'VERLOREN';
    else if (completedRounds === 8 && homeScore === 4 && awayScore === 4) outcome = 'GELIJK';
  }

  return { homeScore, awayScore, outcome };
};

export const generateDefaultRounds = () => {
  const rounds = [];
  for (let i = 1; i <= 4; i++) {
    rounds.push({
      id: `round-e-${i}-${Date.now()}-${Math.random()}`,
      roundNumber: i,
      type: 'ENKEL',
      label: `Enkel ${i}`,
      homePlayerIds: [],
      awayPlayerNames: [''],
      sets: [
        { setNumber: 1, homeScore: 0, awayScore: 0 },
        { setNumber: 2, homeScore: 0, awayScore: 0 },
        { setNumber: 3, homeScore: 0, awayScore: 0 },
      ],
      winner: 'PENDING',
    });
  }
  for (let i = 1; i <= 4; i++) {
    rounds.push({
      id: `round-d-${i}-${Date.now()}-${Math.random()}`,
      roundNumber: i + 4,
      type: 'DUBBEL',
      label: `Dubbel ${i}`,
      homePlayerIds: [],
      awayPlayerNames: ['', ''],
      sets: [
        { setNumber: 1, homeScore: 0, awayScore: 0 },
        { setNumber: 2, homeScore: 0, awayScore: 0 },
        { setNumber: 3, homeScore: 0, awayScore: 0 },
      ],
      winner: 'PENDING',
    });
  }
  return rounds;
};

export const computeAllStats = (players, matches) => {
  const playedMatches = matches.filter((m) => m.status === 'GESPEELD');

  let teamMatchesWon = 0;
  let teamMatchesLost = 0;
  let teamMatchesDrawn = 0;
  let totalRoundsWon = 0;
  let totalRoundsLost = 0;
  let totalSinglesPlayed = 0;
  let totalDoublesPlayed = 0;

  // Dubbel teams tracking: key = "id1_id2" (gesorteerd)
  const duoMap = {};

  playedMatches.forEach((m) => {
    if (m.finalResult.outcome === 'GEWONNEN') teamMatchesWon++;
    if (m.finalResult.outcome === 'VERLOREN') teamMatchesLost++;
    if (m.finalResult.outcome === 'GELIJK') teamMatchesDrawn++;

    m.rounds.forEach((r) => {
      if (r.winner === 'HOME') totalRoundsWon++;
      if (r.winner === 'AWAY') totalRoundsLost++;
      if (r.type === 'ENKEL' && r.winner !== 'PENDING') totalSinglesPlayed++;
      
      if (r.type === 'DUBBEL' && r.winner !== 'PENDING') {
        totalDoublesPlayed++;

        // Controleer of beide spelers aanwezig zijn en VAST zijn
        if (r.homePlayerIds.length === 2) {
          const p1 = players.find((x) => x.id === r.homePlayerIds[0]);
          const p2 = players.find((x) => x.id === r.homePlayerIds[1]);

          // Alleen vaste spelers meenemen in de duo berekening
          if (p1 && p2 && p1.type === 'VAST' && p2.type === 'VAST') {
            const sortedIds = [p1.id, p2.id].sort();
            const pairKey = sortedIds.join('_');

            if (!duoMap[pairKey]) {
              duoMap[pairKey] = {
                player1Name: p1.name.split(' ')[0], // voornaam
                player2Name: p2.name.split(' ')[0],
                fullName: `${p1.name.split(' ')[0]} & ${p2.name.split(' ')[0]}`,
                played: 0,
                wins: 0,
                losses: 0,
              };
            }

            duoMap[pairKey].played++;
            if (r.winner === 'HOME') {
              duoMap[pairKey].wins++;
            } else {
              duoMap[pairKey].losses++;
            }
          }
        }
      }
    });
  });

  const totalTeamMatches = teamMatchesWon + teamMatchesLost + teamMatchesDrawn;
  const teamWinPercentage = totalTeamMatches > 0 ? Math.round((teamMatchesWon / totalTeamMatches) * 100) : 0;

  // Bereken individuele statistieken per speler
  const playerStats = players.map((p) => {
    let singlePlayed = 0, singleWins = 0, singleLosses = 0;
    let doublePlayed = 0, doubleWins = 0, doubleLosses = 0;
    const partnerMap = {};

    playedMatches.forEach((m) => {
      m.rounds.forEach((r) => {
        if (!r.homePlayerIds.includes(p.id) || r.winner === 'PENDING') return;

        const isWin = r.winner === 'HOME';
        if (r.type === 'ENKEL') {
          singlePlayed++;
          if (isWin) singleWins++; else singleLosses++;
        } else if (r.type === 'DUBBEL') {
          doublePlayed++;
          if (isWin) doubleWins++; else doubleLosses++;

          const partnerId = r.homePlayerIds.find((id) => id !== p.id);
          if (partnerId) {
            if (!partnerMap[partnerId]) partnerMap[partnerId] = { matches: 0, wins: 0, losses: 0 };
            partnerMap[partnerId].matches++;
            if (isWin) partnerMap[partnerId].wins++; else partnerMap[partnerId].losses++;
          }
        }
      });
    });

    const totalMatchesPlayed = singlePlayed + doublePlayed;
    const totalWins = singleWins + doubleWins;
    const totalLosses = singleLosses + doubleLosses;
    const overallWinRate = totalMatchesPlayed > 0 ? Math.round((totalWins / totalMatchesPlayed) * 100) : 0;
    const singleWinRate = singlePlayed > 0 ? Math.round((singleWins / singlePlayed) * 100) : 0;
    const doubleWinRate = doublePlayed > 0 ? Math.round((doubleWins / doublePlayed) * 100) : 0;

    let mostFrequentPartner = null;
    let bestPartner = null;

    const partnerStatsList = Object.entries(partnerMap).map(([pId, data]) => {
      const partnerObj = players.find((x) => x.id === pId);
      const winRate = data.matches > 0 ? Math.round((data.wins / data.matches) * 100) : 0;
      const score = (winRate * data.matches) / (data.matches + 2);
      return {
        partnerId: pId,
        partnerName: partnerObj ? partnerObj.name : 'Onbekend',
        matchesTogether: data.matches,
        wins: data.wins,
        losses: data.losses,
        winRate,
        score,
      };
    });

    if (partnerStatsList.length > 0) {
      mostFrequentPartner = [...partnerStatsList].sort((a, b) => b.matchesTogether - a.matchesTogether)[0];
      bestPartner = [...partnerStatsList].sort((a, b) => b.score - a.score)[0];
    }

    return {
      playerId: p.id,
      name: p.name,
      type: p.type,
      active: p.active,
      totalMatchesPlayed,
      totalWins,
      totalLosses,
      overallWinRate,
      singlePlayed,
      singleWins,
      singleLosses,
      singleWinRate,
      doublePlayed,
      doubleWins,
      doubleLosses,
      doubleWinRate,
      mostFrequentPartner,
      bestPartner,
    };
  });

  // 1. BESTE ENKEL: Alleen VASTE spelers met minimaal 1 gespeelde enkelpartij
  const vastPlayersWithSingles = playerStats.filter(
    (s) => s.type === 'VAST' && s.singlePlayed >= 1
  );
  const bestSingle = [...vastPlayersWithSingles].sort((a, b) => {
    if (b.singleWinRate !== a.singleWinRate) return b.singleWinRate - a.singleWinRate;
    return b.singleWins - a.singleWins;
  })[0] || null;

  // 2. BESTE DUBBELTEAM: Alleen vaste duo's met minimaal 1 gespeelde partij
  const rankedDuos = Object.values(duoMap).map((d) => ({
    ...d,
    winRate: Math.round((d.wins / d.played) * 100),
  }));

  const bestDuo = [...rankedDuos].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  })[0] || null;

  return {
    team: {
      totalMatches: totalTeamMatches,
      won: teamMatchesWon,
      lost: teamMatchesLost,
      drawn: teamMatchesDrawn,
      winRate: teamWinPercentage,
      totalRoundsWon,
      totalRoundsLost,
      totalSinglesPlayed,
      totalDoublesPlayed,
      bestSinglePlayer: bestSingle ? bestSingle.name : 'Nog geen',
      bestSingleWinRate: bestSingle ? bestSingle.singleWinRate : 0,
      bestDoubleTeam: bestDuo ? bestDuo.fullName : 'Nog geen',
      bestDoubleTeamWinRate: bestDuo ? bestDuo.winRate : 0,
      bestDoubleTeamMatches: bestDuo ? bestDuo.played : 0,
    },
    players: playerStats,
  };
};