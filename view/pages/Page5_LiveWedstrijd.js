// view/pages/Page5_LiveWedstrijd.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { evaluateSet } from '../../controller/statsEngine';

export default function Page5_LiveWedstrijd({ controller }) {
  const {
    activeMatch,
    players,
    toggleDecline,
    toggleSubstitute,
    updateRoundScore,
    assignPlayerToRound,
    navigateTo,
  } = controller;

  if (!activeMatch) {
    return (
      <View style={styles.center}>
        <Feather name="calendar" size={48} color="#CBD5E1" />
        <Text style={styles.emptyTitle}>Geen wedstrijd geselecteerd</Text>
        <Text style={styles.emptySub}>Kies een wedstrijd uit het overzicht om scores in te voeren.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigateTo('Page2')}>
          <Text style={styles.backBtnText}>Bekijk Wedstrijden</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Round scores always store Apollo as "home"; map them onto the real THUIS/UIT sides.
  const apolloScore = activeMatch.finalResult.homeScore;
  const opponentScore = activeMatch.finalResult.awayScore;
  const leftScore = activeMatch.isHome ? apolloScore : opponentScore;
  const rightScore = activeMatch.isHome ? opponentScore : apolloScore;

  const handleScoreChange = (roundId, setIdx, field, rawVal) => {
    let num = parseInt(rawVal, 10) || 0;
    // Cap strictly at 30 max
    num = Math.min(30, Math.max(0, num));
    updateRoundScore(activeMatch.id, roundId, setIdx, field, num);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Top Header Back Button */}
      <TouchableOpacity style={styles.topBackBtn} onPress={() => navigateTo('Page2')} activeOpacity={0.7}>
        <Feather name="arrow-left" size={16} color="#2563EB" />
        <Text style={styles.topBackText}>Alle wedstrijden</Text>
      </TouchableOpacity>

      {/* Match Scoreboard */}
      <View style={styles.headerCard}>
        <View style={styles.teamMatchup}>
          <View style={styles.teamColumn}>
            <Text style={styles.teamLabel}>THUIS</Text>
            <Text style={styles.teamNameMain} numberOfLines={1}>{activeMatch.isHome ? 'Apollo' : activeMatch.opponent}</Text>
          </View>
          
          <View style={styles.scoreContainer}>
            <Text style={[styles.largeScore, leftScore > rightScore && styles.leadingScore]}>
              {leftScore}
            </Text>
            <Text style={styles.scoreColon}>:</Text>
            <Text style={[styles.largeScore, rightScore > leftScore && styles.leadingScore]}>
              {rightScore}
            </Text>
          </View>

          <View style={[styles.teamColumn, { alignItems: 'flex-end' }]}>
            <Text style={styles.teamLabel}>UIT</Text>
            <Text style={styles.teamNameMain} numberOfLines={1}>{!activeMatch.isHome ? 'Apollo' : activeMatch.opponent}</Text>
          </View>
        </View>

        <View style={styles.matchMetaRow}>
          <Text style={styles.metaText}>📍 {activeMatch.location}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{activeMatch.finalResult.outcome}</Text>
          </View>
        </View>
      </View>

      {/* Spelersbeschikbaarheid */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>Aanwezigheid & Wissels</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterScroll}>
          {players.map((p) => {
            const isSelected = activeMatch.selectedPlayerIds.includes(p.id);
            const isDeclined = activeMatch.declinedPlayerIds.includes(p.id);

            if (p.type === 'VAST') {
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.rosterChip, isDeclined ? styles.chipDeclined : styles.chipActive]}
                  onPress={() => toggleDecline(activeMatch.id, p.id)}
                  activeOpacity={0.7}
                >
                  <Feather name={isDeclined ? 'user-x' : 'user-check'} size={13} color={isDeclined ? '#DC2626' : '#059669'} />
                  <Text style={[styles.rosterChipText, isDeclined && { color: '#DC2626' }]}>{p.name}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.rosterChip, isSelected ? styles.chipActive : styles.chipInactive]}
                onPress={() => toggleSubstitute(activeMatch.id, p.id)}
                activeOpacity={0.7}
              >
                <Feather name={isSelected ? 'check' : 'plus'} size={13} color={isSelected ? '#059669' : '#64748B'} />
                <Text style={[styles.rosterChipText, !isSelected && { color: '#64748B' }]}>{p.name} (W)</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Partijen Lijst */}
      <Text style={[styles.sectionHeading, { marginTop: 14, marginBottom: 6, paddingHorizontal: 2 }]}>
        Partijen (8 Rondes)
      </Text>

      {activeMatch.rounds.map((round) => {
        const isEnkel = round.type === 'ENKEL';
        const isRoundWon = round.winner === 'HOME';
        const isRoundLost = round.winner === 'AWAY';

        const set1Winner = evaluateSet(round.sets[0].homeScore, round.sets[0].awayScore);
        const set2Winner = evaluateSet(round.sets[1].homeScore, round.sets[1].awayScore);
        const isTwoZeroWin = (set1Winner === 'HOME' && set2Winner === 'HOME') || (set1Winner === 'AWAY' && set2Winner === 'AWAY');

        return (
          <View key={round.id} style={styles.roundCard}>
            <View style={styles.roundCardHeader}>
              <View style={styles.roundBadgeRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{round.label}</Text>
                </View>
                <Text style={styles.roundTypeSub}>{isEnkel ? '1 vs 1' : '2 vs 2 Dubbel'}</Text>
              </View>

              <View style={[styles.resultBadge, isRoundWon && styles.resultWon, isRoundLost && styles.resultLost]}>
                <Text style={[styles.resultBadgeText, isRoundWon && styles.textWon, isRoundLost && styles.textLost]}>
                  {isRoundWon ? 'Winst Apollo' : isRoundLost ? 'Winst Tegenstander' : 'Bezig'}
                </Text>
              </View>
            </View>

            {/* Speler Selectie */}
            <View style={styles.playerPickSection}>
              <Text style={styles.pickLabel}>
                {isEnkel ? 'Kies Apollo speler:' : 'Kies 2 Apollo dubbelspelers:'}
              </Text>
              <View style={styles.playerButtonGrid}>
                {activeMatch.selectedPlayerIds.map((pId) => {
                  const p = players.find((x) => x.id === pId);
                  const isAssigned = round.homePlayerIds.includes(pId);

                  return (
                    <TouchableOpacity
                      key={pId}
                      style={[styles.playerSelectPill, isAssigned && styles.playerSelectPillActive]}
                      onPress={() => {
                        if (isEnkel) {
                          assignPlayerToRound(activeMatch.id, round.id, 0, pId);
                        } else {
                          if (isAssigned) {
                            const filtered = round.homePlayerIds.filter((id) => id !== pId);
                            assignPlayerToRound(activeMatch.id, round.id, 0, filtered[0] || '');
                            assignPlayerToRound(activeMatch.id, round.id, 1, filtered[1] || '');
                          } else if (round.homePlayerIds.length < 2) {
                            assignPlayerToRound(activeMatch.id, round.id, round.homePlayerIds.length, pId);
                          }
                        }
                      }}
                    >
                      {isAssigned && <Feather name="check" size={11} color="#FFFFFF" style={{ marginRight: 3 }} />}
                      <Text style={[styles.playerSelectPillText, isAssigned && styles.playerSelectPillTextActive]}>
                        {p?.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Set Scores */}
            <View style={styles.setsWrapper}>
              {round.sets.map((set, setIdx) => {
                const setWinner = evaluateSet(set.homeScore, set.awayScore);
                const homeWin = setWinner === 'HOME';
                const awayWin = setWinner === 'AWAY';

                // Set 3 is disabled if first two sets were won by the same side
                if (setIdx === 2 && isTwoZeroWin) {
                  return (
                    <View key={setIdx} style={[styles.setRowBox, styles.setRowBoxDisabled]}>
                      <Text style={styles.setRowTitleDisabled}>
                        Set 3 niet nodig (Gewonnen in 2 sets)
                      </Text>
                    </View>
                  );
                }

                return (
                  <View key={setIdx} style={styles.setRowBox}>
                    <View style={styles.setRowHeader}>
                      <Text style={styles.setRowTitle}>Set {set.setNumber}</Text>
                      {setWinner !== 'PENDING' && (
                        <Text style={styles.setWinnerTag}>
                          {setWinner === 'HOME' ? '✓ Apollo' : '✓ Tegenstander'}
                        </Text>
                      )}
                    </View>

                    <View style={styles.stepperContainer}>
                      {/* Apollo Side */}
                      <View style={styles.teamScoreSection}>
                        <Text style={styles.teamScoreName}>Apollo</Text>
                        <View style={styles.stepperControls}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => handleScoreChange(round.id, setIdx, 'homeScore', set.homeScore - 1)}
                          >
                            <Feather name="minus" size={13} color="#475569" />
                          </TouchableOpacity>

                          <View style={[styles.scoreInputWrapper, homeWin && styles.scoreInputWrapperLead]}>
                            <TextInput
                              style={[styles.scoreDisplay, homeWin && styles.scoreDisplayLead]}
                              keyboardType="number-pad"
                              maxLength={2}
                              value={String(set.homeScore)}
                              onChangeText={(v) => handleScoreChange(round.id, setIdx, 'homeScore', v)}
                              selectTextOnFocus
                            />
                          </View>

                          <TouchableOpacity
                            style={[styles.stepBtn, styles.stepBtnAdd]}
                            onPress={() => handleScoreChange(round.id, setIdx, 'homeScore', set.homeScore + 1)}
                          >
                            <Feather name="plus" size={13} color="#2563EB" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.vsDivider}>-</Text>

                      {/* Opponent Side */}
                      <View style={styles.teamScoreSection}>
                        <Text style={styles.teamScoreName}>Tegenstander</Text>
                        <View style={styles.stepperControls}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => handleScoreChange(round.id, setIdx, 'awayScore', set.awayScore - 1)}
                          >
                            <Feather name="minus" size={13} color="#475569" />
                          </TouchableOpacity>

                          <View style={[styles.scoreInputWrapper, awayWin && styles.scoreInputWrapperLead]}>
                            <TextInput
                              style={[styles.scoreDisplay, awayWin && styles.scoreDisplayLead]}
                              keyboardType="number-pad"
                              maxLength={2}
                              value={String(set.awayScore)}
                              onChangeText={(v) => handleScoreChange(round.id, setIdx, 'awayScore', v)}
                              selectTextOnFocus
                            />
                          </View>

                          <TouchableOpacity
                            style={[styles.stepBtn, styles.stepBtnAdd]}
                            onPress={() => handleScoreChange(round.id, setIdx, 'awayScore', set.awayScore + 1)}
                          >
                            <Feather name="plus" size={13} color="#2563EB" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 10, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 3, marginBottom: 14 },
  backBtn: { backgroundColor: '#2563EB', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  backBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  topBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, paddingVertical: 2 },
  topBackText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teamMatchup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamColumn: { flex: 1 },
  teamLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  teamNameMain: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  scoreContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  largeScore: { fontSize: 20, fontWeight: '900', color: '#64748B' },
  leadingScore: { color: '#2563EB' },
  scoreColon: { fontSize: 18, fontWeight: '800', color: '#94A3B8', marginHorizontal: 4 },
  matchMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F8FAFC' },
  metaText: { fontSize: 11, color: '#64748B' },
  statusPill: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  statusPillText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionHeading: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  rosterScroll: { flexDirection: 'row', gap: 6, paddingTop: 8 },
  rosterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  chipActive: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  chipDeclined: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  chipInactive: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  rosterChipText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  roundCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  roundCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  roundBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeBadge: { backgroundColor: '#0F172A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  roundTypeSub: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  resultBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  resultWon: { backgroundColor: '#ECFDF5' },
  resultLost: { backgroundColor: '#FEF2F2' },
  resultBadgeText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  textWon: { color: '#059669' },
  textLost: { color: '#DC2626' },
  playerPickSection: { backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, marginBottom: 8 },
  pickLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  playerButtonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  playerSelectPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  playerSelectPillActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  playerSelectPillText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  playerSelectPillTextActive: { color: '#FFFFFF', fontWeight: '700' },
  setsWrapper: { gap: 6 },
  setRowBox: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  setRowBoxDisabled: { backgroundColor: '#F1F5F9', borderStyle: 'dashed', paddingVertical: 8, alignItems: 'center' },
  setRowHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 4 },
  setRowTitle: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  setRowTitleDisabled: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  setWinnerTag: { fontSize: 10, fontWeight: '700', color: '#059669' },
  stepperContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamScoreSection: { flex: 1, alignItems: 'center' },
  teamScoreName: { fontSize: 10, fontWeight: '600', color: '#64748B', marginBottom: 2 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stepBtn: { width: 30, height: 32, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  stepBtnAdd: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  scoreInputWrapper: {
    width: 44,
    height: 34,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreInputWrapperLead: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  scoreDisplay: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  scoreDisplayLead: {
    color: '#2563EB',
  },
  vsDivider: { fontSize: 14, fontWeight: '800', color: '#94A3B8', marginHorizontal: 4 },
});