// In view/pages/Page4_Statistieken.js:
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function Page4_Statistieken({ controller }) {
  const { stats } = controller;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.teamBadge}>Analyses & Prestaties</Text>
        <Text style={styles.title}>Statistieken</Text>
      </View>

      {/* Top Performers Cards (Alleen Vaste Spelers) */}
      <View style={styles.leadersRow}>
        <View style={styles.leaderCard}>
          <View style={styles.leaderIconWrap}>
            <Ionicons name="trophy" size={16} color="#D97706" />
          </View>
          <Text style={styles.leaderLabel}>BESTE ENKEL</Text>
          <Text style={styles.leaderName} numberOfLines={1}>
            {stats.team.bestSinglePlayer}
          </Text>
          <Text style={styles.leaderSub}>
            {stats.team.bestSingleWinRate > 0 ? `${stats.team.bestSingleWinRate}% winrate` : 'Vaste speler'}
          </Text>
        </View>

        <View style={styles.leaderCard}>
          <View style={[styles.leaderIconWrap, { backgroundColor: '#EFF6FF' }]}>
            <MaterialCommunityIcons name="badminton" size={16} color="#2563EB" />
          </View>
          <Text style={styles.leaderLabel}>BESTE DUBBELTEAM</Text>
          <Text style={styles.leaderName} numberOfLines={1}>
            {stats.team.bestDoubleTeam}
          </Text>
          <Text style={styles.leaderSub}>
            {stats.team.bestDoubleTeamWinRate > 0 
              ? `${stats.team.bestDoubleTeamWinRate}% winrate (${stats.team.bestDoubleTeamMatches}x)` 
              : 'Vast koppel'}
          </Text>
        </View>
      </View>

      {/* Player Stats Section */}
      <Text style={styles.sectionHeading}>Spelersoverzicht ({stats.players.length})</Text>

      {stats.players.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Geen spelersstatistieken beschikbaar</Text>
        </View>
      ) : (
        stats.players.map((p) => {
          const hasMatches = p.totalMatchesPlayed > 0;
          return (
            <View key={p.playerId} style={styles.playerCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.playerName}>{p.name}</Text>
                    <View style={p.type === 'VAST' ? styles.tagFixed : styles.tagSub}>
                      <Text style={p.type === 'VAST' ? styles.tagFixedText : styles.tagSubText}>{p.type}</Text>
                    </View>
                  </View>
                  <Text style={styles.playerMatchesSub}>
                    {p.totalMatchesPlayed} {p.totalMatchesPlayed === 1 ? 'partij' : 'partijen'} gespeeld ({p.totalWins}W - {p.totalLosses}V)
                  </Text>
                </View>

                <View style={styles.winRateBadge}>
                  <Text style={styles.winRateNum}>{p.overallWinRate}%</Text>
                  <Text style={styles.winRateLabel}>WINST</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${Math.max(4, p.overallWinRate)}%` }]} />
              </View>

              <View style={styles.breakdownRow}>
                <View style={styles.miniStatBox}>
                  <Text style={styles.miniBoxLabel}>ENKEL</Text>
                  <Text style={styles.miniBoxValue}>
                    {p.singleWins}W <Text style={{ color: '#94A3B8' }}>/</Text> {p.singleLosses}V
                  </Text>
                  <Text style={styles.miniBoxPct}>{p.singleWinRate}% winst</Text>
                </View>

                <View style={styles.miniStatBox}>
                  <Text style={styles.miniBoxLabel}>DUBBEL</Text>
                  <Text style={styles.miniBoxValue}>
                    {p.doubleWins}W <Text style={{ color: '#94A3B8' }}>/</Text> {p.doubleLosses}V
                  </Text>
                  <Text style={styles.miniBoxPct}>{p.doubleWinRate}% winst</Text>
                </View>
              </View>

              {hasMatches && (p.mostFrequentPartner || p.bestPartner) && (
                <View style={styles.partnerContainer}>
                  {p.mostFrequentPartner && (
                    <View style={styles.partnerLine}>
                      <Feather name="repeat" size={12} color="#64748B" />
                      <Text style={styles.partnerText}>
                        Meest mee gespeeld: <Text style={styles.partnerBold}>{p.mostFrequentPartner.partnerName}</Text> ({p.mostFrequentPartner.matchesTogether}x)
                      </Text>
                    </View>
                  )}

                  {p.bestPartner && (
                    <View style={styles.partnerLine}>
                      <Feather name="star" size={12} color="#D97706" />
                      <Text style={styles.partnerText}>
                        Beste duo: <Text style={styles.partnerBold}>{p.bestPartner.partnerName}</Text> ({p.bestPartner.winRate}% winst)
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24 },
  header: { marginBottom: 10 },
  teamBadge: { fontSize: 11, fontWeight: '800', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  leadersRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  leaderCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  leaderIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  leaderLabel: { fontSize: 9, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  leaderName: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  leaderSub: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  sectionHeading: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8, paddingHorizontal: 2 },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  tagFixed: { backgroundColor: '#EFF6FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  tagFixedText: { fontSize: 9, fontWeight: '800', color: '#1D4ED8' },
  tagSub: { backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  tagSubText: { fontSize: 9, fontWeight: '800', color: '#475569' },
  playerMatchesSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  winRateBadge: { alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  winRateNum: { fontSize: 14, fontWeight: '900', color: '#2563EB' },
  winRateLabel: { fontSize: 8, fontWeight: '800', color: '#94A3B8' },
  progressTrack: { height: 5, backgroundColor: '#F1F5F9', borderRadius: 3, marginVertical: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  breakdownRow: { flexDirection: 'row', gap: 6 },
  miniStatBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  miniBoxLabel: { fontSize: 9, fontWeight: '800', color: '#64748B' },
  miniBoxValue: { fontSize: 12, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  miniBoxPct: { fontSize: 10, fontWeight: '600', color: '#059669', marginTop: 1 },
  partnerContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 4 },
  partnerLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partnerText: { fontSize: 11, color: '#475569' },
  partnerBold: { fontWeight: '700', color: '#0F172A' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 12, color: '#94A3B8' },
});