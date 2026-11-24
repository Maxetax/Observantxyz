// view/pages/Page2_Wedstrijden.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { parseMatchDate, formatToDDMMYYYY } from '../../controller/statsEngine';

const isMatchOverdue = (match) => {
  if (match.status === 'GESPEELD') return false;
  const matchTimestamp = parseMatchDate(match.date);
  if (!matchTimestamp) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return matchTimestamp < today.getTime();
};

export default function Page2_Wedstrijden({ controller }) {
  const { matches, createMatch, deleteMatch, navigateTo } = controller;
  const [modalVisible, setModalVisible] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [isHome, setIsHome] = useState(true);

  const handleDateChange = (val) => {
    setDate(formatToDDMMYYYY(val));
  };

  const handleOpenModal = () => {
    setOpponent('');
    setDate('');
    setLocation('');
    setIsHome(true);
    setModalVisible(true);
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!opponent.trim() || date.trim().length !== 10) {
      alert('Vul een geldige datum in (formaat: DD-MM-YYYY)');
      return;
    }
    createMatch({ opponent, date, location, isHome });
    setModalVisible(false);
  };

  const plannedList = matches
    .filter((m) => m.status === 'GEPLAND')
    .sort((a, b) => parseMatchDate(a.date) - parseMatchDate(b.date));

  const playedList = matches
    .filter((m) => m.status === 'GESPEELD')
    .sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header with Top-Right + Button */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.teamBadge}>Programma</Text>
            <Text style={styles.title}>Wedstrijdbeheer</Text>
          </View>
          <TouchableOpacity
            style={styles.addIconBtn}
            onPress={handleOpenModal}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Geplande Wedstrijden */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Geplande Wedstrijden ({plannedList.length})</Text>
          {plannedList.length === 0 ? (
            <Text style={styles.emptyText}>Geen geplande wedstrijden</Text>
          ) : (
            plannedList.map((m) => {
              const overdue = isMatchOverdue(m);

              return (
                <View key={m.id} style={[styles.matchItem, overdue && styles.matchItemOverdue]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchOpponent}>Apollo vs {m.opponent}</Text>
                    <Text style={styles.matchDetails}>
                      📅 {m.date} · {m.isHome ? 'Thuis' : 'Uit'} ({m.location})
                    </Text>
                    {overdue && (
                      <View style={styles.overdueBadge}>
                        <Feather name="alert-triangle" size={10} color="#DC2626" />
                        <Text style={styles.overdueBadgeText}>Uitslag ontbreekt</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actionCol}>
                    <TouchableOpacity
                      style={[styles.openBtn, overdue && styles.openBtnOverdue]}
                      onPress={() => navigateTo('Page5', m.id)}
                    >
                      <Text style={[styles.openBtnText, overdue && styles.openBtnTextOverdue]}>
                        {overdue ? 'Invoeren' : 'Scores'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.delBtn} onPress={() => deleteMatch(m.id)}>
                      <Text style={styles.delBtnText}>Verwijder</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Gespeelde Wedstrijden */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Gespeelde Wedstrijden ({playedList.length})</Text>
          {playedList.length === 0 ? (
            <Text style={styles.emptyText}>Geen gespeelde wedstrijden</Text>
          ) : (
            playedList.map((m) => (
              <View key={m.id} style={styles.matchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchOpponent}>Apollo vs {m.opponent}</Text>
                  <Text style={styles.matchDetails}>
                    📅 {m.date} · {m.isHome ? 'Thuis' : 'Uit'}
                  </Text>
                  <Text style={styles.matchStatus}>
                    Eindstand:{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {m.finalResult.homeScore} - {m.finalResult.awayScore}
                    </Text>{' '}
                    ({m.finalResult.outcome})
                  </Text>
                </View>

                <View style={styles.actionCol}>
                  <TouchableOpacity
                    style={styles.openBtn}
                    onPress={() => navigateTo('Page5', m.id)}
                  >
                    <Text style={styles.openBtnText}>Bekijken</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.delBtn} onPress={() => deleteMatch(m.id)}>
                    <Text style={styles.delBtnText}>Verwijder</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal Overlay Formulier */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nieuwe Wedstrijd</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Tegenstander</Text>
              <TextInput
                style={styles.input}
                placeholder="Bijv. BC Drop Shot"
                value={opponent}
                onChangeText={setOpponent}
                autoFocus={true}
              />

              <Text style={styles.label}>Datum (DD-MM-YYYY)</Text>
              <TextInput
                style={styles.input}
                placeholder="Bijv. 12-09-2026"
                keyboardType="number-pad"
                maxLength={10}
                value={date}
                onChangeText={handleDateChange}
              />

              <Text style={styles.label}>Locatie</Text>
              <TextInput
                style={styles.input}
                placeholder="Bijv. Apollo Sporthal"
                value={location}
                onChangeText={setLocation}
              />

              <Text style={styles.label}>Speellocatie</Text>
              <View style={styles.locationToggle}>
                <TouchableOpacity
                  style={[styles.toggleBtn, isHome && styles.toggleBtnActive]}
                  onPress={() => setIsHome(true)}
                >
                  <Text style={[styles.toggleText, isHome && styles.toggleTextActive]}>
                    Thuis
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, !isHome && styles.toggleBtnActive]}
                  onPress={() => setIsHome(false)}
                >
                  <Text style={[styles.toggleText, !isHome && styles.toggleTextActive]}>
                    Uit
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit}>
              <Text style={styles.saveBtnText}>Wedstrijd Toevoegen</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  teamBadge: { fontSize: 11, fontWeight: '800', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  addIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  matchItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 8 },
  matchItemOverdue: { backgroundColor: '#FFFBFB', paddingHorizontal: 6, borderRadius: 6 },
  matchOpponent: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  matchDetails: { fontSize: 10, color: '#64748B', marginTop: 1 },
  matchStatus: { fontSize: 10, color: '#334155', marginTop: 2 },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  overdueBadgeText: { fontSize: 9, fontWeight: '700', color: '#DC2626' },
  actionCol: { justifyContent: 'center', gap: 4 },
  openBtn: { backgroundColor: '#EFF6FF', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  openBtnOverdue: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  openBtnText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  openBtnTextOverdue: { color: '#FFFFFF' },
  delBtn: { alignItems: 'center' },
  delBtnText: { fontSize: 10, color: '#DC2626', fontWeight: '600' },
  emptyText: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 4 },

  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  formRow: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#F8FAFC',
  },
  locationToggle: { flexDirection: 'row', gap: 8, marginTop: 2 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  toggleBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  toggleTextActive: { color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});