export type PlayerType = 'VAST' | 'WISSEL';

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
  type: PlayerType;
  active: boolean;
  createdAt: string;
}

export interface GameSet {
  setNumber: number;
  homeScore: number;
  awayScore: number;
}

export type MatchType = 'ENKEL' | 'DUBBEL';

export interface MatchRound {
  id: string;
  roundNumber: number; // 1-4: Enkel, 5-8: Dubbel
  type: MatchType;
  label: string; // 'Enkel 1', ..., 'Dubbel 4'
  homePlayerIds: string[]; // 1 id bij enkel, 2 bij dubbel
  awayPlayerNames: string[]; // 1 of 2 namen van tegenstander
  sets: GameSet[];
  winner: 'HOME' | 'AWAY' | 'PENDING';
}

export interface Match {
  id: string;
  date: string; // YYYY-MM-DD
  opponent: string;
  location: string;
  isHome: boolean;
  status: 'GEPLAND' | 'GESPEELD';
  selectedPlayerIds: string[];
  declinedPlayerIds: string[]; // Afmeldingen van vaste spelers
  rounds: MatchRound[];
  finalResult: {
    homeScore: number;
    awayScore: number;
    outcome: 'GEWONNEN' | 'VERLOREN' | 'GELIJK' | 'PENDING';
  };
}

export interface PartnerStat {
  partnerId: string;
  partnerName: string;
  matchesTogether: number;
  wins: number;
  losses: number;
  winRate: number;
  score: number; // Gewogen score voor betrouwbaarheid
}

export interface PlayerStatistics {
  playerId: string;
  name: string;
  type: PlayerType;
  totalMatchesPlayed: number;
  totalWins: number;
  totalLosses: number;
  overallWinRate: number;
  singlePlayed: number;
  singleWins: number;
  singleLosses: number;
  singleWinRate: number;
  doublePlayed: number;
  doubleWins: number;
  doubleLosses: number;
  doubleWinRate: number;
  mostFrequentPartner: PartnerStat | null;
  bestPartner: PartnerStat | null;
}