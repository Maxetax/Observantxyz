// view/pages/Page1_Dashboard.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Feather, Ionicons,MaterialCommunityIcons } from '@expo/vector-icons';
import { parseMatchDate } from '../../controller/statsEngine';


const isMatchOverdue = (match) => {
  if (match.status === 'GESPEELD') return false;
  const matchTimestamp = parseMatchDate(match.date);
  if (!matchTimestamp) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return matchTimestamp < today.getTime();
};

export default function Page1_Dashboard({ controller }) {
  const { stats, matches, navigateTo } = controller;

  // Soonest first
  const upcomingMatches = matches
    .filter((m) => m.status === 'GEPLAND')
    .sort((a, b) => parseMatchDate(a.date) - parseMatchDate(b.date));

  // Most recent first
  const recentMatches = matches
    .filter((m) => m.status === 'GESPEELD')
    .sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.teamBadge}>Apollo Heren 1</Text>
        <Text style={styles.title}>Team Dashboard</Text>
      </View>

      {/* Hero Stat Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroMain}>
          <View>
            <Text style={styles.heroSub}>WINPERCENTAGE</Text>
            <Text style={styles.heroPercent}>{stats.team.winRate}%</Text>
          </View>
          <View style={styles.heroPill}>
            <Feather name="activity" size={13} color="#2563EB" />
            <Text style={styles.heroPillText}>{stats.team.totalMatches} gespeeld</Text>
          </View>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.breakdownRow}>
          <View style={styles.miniStat}>
            <Text style={[styles.miniStatNumber, { color: '#059669' }]}>{stats.team.won}</Text>
            <Text style={styles.miniStatLabel}>Gewonnen</Text>
          </View>
          <View style={styles.miniDivider} />
          <View style={styles.miniStat}>
            <Text style={[styles.miniStatNumber, { color: '#D97706' }]}>{stats.team.drawn}</Text>
            <Text style={styles.miniStatLabel}>Gelijk</Text>
          </View>
          <View style={styles.miniDivider} />
          <View style={styles.miniStat}>
            <Text style={[styles.miniStatNumber, { color: '#DC2626' }]}>{stats.team.lost}</Text>
            <Text style={styles.miniStatLabel}>Verloren</Text>
          </View>
        </View>
      </View>

      {/* Compact Partijen Strip */}
      <View style={styles.partijenCard}>
        <View style={styles.partijenIcon}>
          <MaterialCommunityIcons name="badminton" size={20} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.partijenTitle}>
            {stats.team.totalSinglesPlayed + stats.team.totalDoublesPlayed} Partijen gespeeld
          </Text>
          <Text style={styles.partijenSub}>
            {stats.team.totalSinglesPlayed} enkel · {stats.team.totalDoublesPlayed} dubbel
          </Text>
        </View>
        <View style={styles.partijenStats}>
          <Text style={styles.partijenWin}>{stats.team.totalRoundsWon}W</Text>
          <Text style={styles.partijenSep}>-</Text>
          <Text style={styles.partijenLoss}>{stats.team.totalRoundsLost}V</Text>
        </View>
      </View>

      {/* Komende Wedstrijden */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Geplande wedstrijden</Text>
          <TouchableOpacity onPress={() => navigateTo('Page2')}>
            <Text style={styles.sectionLink}>Bekijk alles</Text>
          </TouchableOpacity>
        </View>

        {upcomingMatches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Geen wedstrijden gepland</Text>
          </View>
        ) : (
          upcomingMatches.slice(0, 3).map((m) => {
            const overdue = isMatchOverdue(m);

            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.matchCard, overdue && styles.matchCardOverdue]}
                onPress={() => navigateTo('Page5', m.id)}
                activeOpacity={0.7}
              >
                <View style={styles.matchMain}>
                  <View style={styles.matchInfo}>
                    <Text style={styles.matchOpponent}>{m.opponent}</Text>
                    <Text style={styles.matchLocation}>
                      {m.date} · {m.isHome ? 'Thuis' : 'Uit'} · {m.location}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={overdue ? '#DC2626' : '#94A3B8'} />
                </View>

                {overdue && (
                  <View style={styles.overdueBadge}>
                    <Feather name="alert-triangle" size={11} color="#DC2626" />
                    <Text style={styles.overdueBadgeText}>Uitslag ontbreekt (Datum verstreken)</Text>
                  </View>
                )}

                {!overdue && m.declinedPlayerIds.length > 0 && (
                  <View style={styles.alertPill}>
                    <Feather name="alert-circle" size={11} color="#B45309" />
                    <Text style={styles.alertText}>
                      {m.declinedPlayerIds.length} afgemeld ({m.selectedPlayerIds.length}/4 compleet)
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Recente Uitslagen */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recente uitslagen</Text>
          <TouchableOpacity onPress={() => navigateTo('Page2')}>
            <Text style={styles.sectionLink}>Bekijk alles</Text>
          </TouchableOpacity>
        </View>

        {recentMatches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Geen uitslagen beschikbaar</Text>
          </View>
        ) : (
          recentMatches.slice(0, 3).map((m) => {
            const isWin = m.finalResult.outcome === 'GEWONNEN';
            const isLoss = m.finalResult.outcome === 'VERLOREN';

            return (
              <TouchableOpacity
                key={m.id}
                style={styles.resultCard}
                onPress={() => navigateTo('Page5', m.id)}
                activeOpacity={0.7}
              >
                <View style={styles.resultLeft}>
                  <Text style={styles.resultOpponent}>{m.opponent}</Text>
                  <Text style={styles.resultDate}>
                    {m.date} · {m.isHome ? 'Thuis' : 'Uit'}
                  </Text>
                </View>

                <View style={styles.resultRight}>
                  <Text style={styles.resultScore}>
                    {m.finalResult.homeScore} - {m.finalResult.awayScore}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      isWin && styles.winPill,
                      isLoss && styles.lossPill,
                      !isWin && !isLoss && styles.drawPill,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isWin && styles.winText,
                        isLoss && styles.lossText,
                        !isWin && !isLoss && styles.drawText,
                      ]}
                    >
                      {isWin ? 'Gewonnen' : isLoss ? 'Verloren' : 'Gelijk'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16 },
  header: { marginBottom: 10 },
  teamBadge: { fontSize: 11, fontWeight: '800', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  heroMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroSub: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },
  heroPercent: { fontSize: 28, fontWeight: '900', color: '#0F172A', marginTop: 1 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  heroPillText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  heroDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  miniStat: { alignItems: 'center', flex: 1 },
  miniStatNumber: { fontSize: 16, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
  miniDivider: { width: 1, height: 18, backgroundColor: '#E2E8F0' },
  partijenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 9,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  partijenTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  partijenSub: { fontSize: 10, color: '#64748B' },
  partijenStats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  partijenWin: { fontSize: 12, fontWeight: '800', color: '#059669' },
  partijenSep: { fontSize: 11, color: '#CBD5E1' },
  partijenLoss: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  sectionBlock: { marginTop: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  sectionLink: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  matchCardOverdue: { borderColor: '#FECACA', backgroundColor: '#FFFBFB' },
  matchMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchInfo: { flex: 1 },
  matchOpponent: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  matchLocation: { fontSize: 11, color: '#64748B', marginTop: 1 },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  overdueBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  alertText: { fontSize: 10, fontWeight: '600', color: '#B45309' },
  resultCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 9,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultLeft: { flex: 1 },
  resultOpponent: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  resultDate: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  resultRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultScore: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  winPill: { backgroundColor: '#ECFDF5' },
  lossPill: { backgroundColor: '#FEF2F2' },
  drawPill: { backgroundColor: '#FFFBEB' },
  statusText: { fontSize: 10, fontWeight: '700' },
  winText: { color: '#059669' },
  lossText: { color: '#DC2626' },
  drawText: { color: '#D97706' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 12, color: '#94A3B8' },
});