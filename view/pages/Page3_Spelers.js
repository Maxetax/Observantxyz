// view/pages/Page3_Spelers.js
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
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { sanitizeName, sanitizeText, sanitizePasswordInput } from '../../controller/security';
import { MIN_PASSWORD_LENGTH } from '../../controller/passwordRules';

const notify = (message) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message);
  } else {
    Alert.alert('Apollo', message);
  }
};

const PASSWORD_MESSAGES = {
  ok: 'Wachtwoord ingesteld.',
  weak_password: `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens bevatten.`,
  forbidden: 'Alleen een admin mag wachtwoorden instellen.',
  not_found: 'Deze speler kan niet inloggen (alleen actieve vaste spelers).',
  invalid_request: 'Wachtwoord instellen mislukt.',
  error: 'Wachtwoord instellen mislukt. Controleer je verbinding.',
};

export default function Page3_Spelers({ controller, currentUser }) {
  const { players, addPlayer, updatePlayer, deletePlayer, changeOwnPassword, setPlayerPassword } = controller;
  // Read admin rights from the live list, not the copy cached at login.
  const isAdmin = !!players.find((p) => p.id === currentUser?.id)?.isAdmin;
  const canEdit = (player) => isAdmin || player.id === currentUser?.id;

  // Add modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('VAST');
  const [newStartPassword, setNewStartPassword] = useState('');

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('VAST');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Open Edit Modal
  const handleOpenEdit = (player) => {
    setEditingPlayer(player);
    setEditName(player.name || '');
    setEditType(player.type || 'VAST');
    setEditPhone(player.phone || '');
    setEditAddress(player.address || '');
    setEditNotes(player.notes || '');
    setEditNewPassword('');
    setEditModalVisible(true);
  };

  // Opslaan van bewerking
  const handleSaveEdit = async () => {
    if (!editingPlayer || busy) return;
    const cleanName = sanitizeName(editName).trim();
    if (!cleanName) {
      notify('Vul een geldige naam in.');
      return;
    }

    // Eigen wachtwoord wijzigen (alleen als ingevuld)
    if (isSelf && editNewPassword.trim().length > 0) {
      setBusy(true);
      const { status } = await changeOwnPassword(editNewPassword);
      setBusy(false);
      if (status === 'weak_password') {
        notify(`Het nieuwe wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens bevatten.`);
        return;
      }
      if (status !== 'ok') {
        notify('Wachtwoord wijzigen mislukt. Controleer je verbinding.');
        return;
      }
    }

    updatePlayer(editingPlayer.id, {
      name: cleanName,
      type: isAdmin ? editType : editingPlayer.type,
      phone: sanitizeText(editPhone),
      address: sanitizeText(editAddress),
      notes: sanitizeText(editNotes),
    });
    setEditModalVisible(false);
    setEditingPlayer(null);
  };

  // Admin: wachtwoord van een andere vaste speler instellen
  const handleSetPassword = async () => {
    if (!editingPlayer || busy) return;
    setBusy(true);
    const { status } = await setPlayerPassword(editingPlayer.id, editNewPassword);
    setBusy(false);
    notify(PASSWORD_MESSAGES[status] ?? PASSWORD_MESSAGES.error);
    if (status === 'ok') setEditNewPassword('');
  };

  // Bevestigde verwijdering vanuit de edit modal
  const handleDeleteFromModal = () => {
    if (!editingPlayer || !isAdmin || editingPlayer.id === currentUser?.id) return;
    setEditModalVisible(false);
    deletePlayer(editingPlayer.id);
  };

  // Nieuwe speler toevoegen (vaste spelers krijgen direct een startwachtwoord)
  const handleAddSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isAdmin || busy) return;
    const cleanName = sanitizeName(newName).trim();
    if (!cleanName) {
      notify('Vul een spelersnaam in.');
      return;
    }
    if (newType === 'VAST' && newStartPassword.trim().length < MIN_PASSWORD_LENGTH) {
      notify(`Kies een startwachtwoord van minimaal ${MIN_PASSWORD_LENGTH} tekens.`);
      return;
    }

    setBusy(true);
    try {
      const newId = await addPlayer(cleanName, newType);
      setAddModalVisible(false);
      if (newType === 'VAST') {
        const { status } = await setPlayerPassword(newId, newStartPassword);
        if (status !== 'ok') {
          notify('Speler toegevoegd, maar wachtwoord instellen mislukt. Stel het opnieuw in via Aanpassen.');
        }
      }
    } catch {
      // addPlayer already showed "Opslaan mislukt" and reloaded.
    } finally {
      setBusy(false);
    }
  };

  const vastPlayers = players.filter((p) => p.type === 'VAST');
  const wisselPlayers = players.filter((p) => p.type === 'WISSEL');

  const isSelf = currentUser && editingPlayer && currentUser.id === editingPlayer.id;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header met + Knop */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.teamBadge}>Selectie</Text>
            <Text style={styles.title}>Spelersbeheer</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={styles.addIconBtn}
              onPress={() => {
                setNewName('');
                setNewStartPassword('');
                setNewType('VAST');
                setAddModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Vaste Spelers */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vaste Spelers ({vastPlayers.length})</Text>
          {vastPlayers.length === 0 ? (
            <Text style={styles.emptyText}>Geen vaste spelers toegevoegd</Text>
          ) : (
            vastPlayers.map((p) => (
              <View key={p.id} style={styles.playerItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  
                  {/* Kleine contactgegevens indien aanwezig */}
                  {(p.phone || p.address) ? (
                    <Text style={styles.contactDetails} numberOfLines={1}>
                      {p.phone ? `📞 ${p.phone}` : ''}
                      {p.phone && p.address ? '  ·  ' : ''}
                      {p.address ? `📍 ${p.address}` : ''}
                    </Text>
                  ) : null}

                  {p.notes ? (
                    <Text style={styles.notesPreview} numberOfLines={1}>
                      💬 {p.notes}
                    </Text>
                  ) : null}
                </View>

                {/* Aanpasknop */}
                {canEdit(p) && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleOpenEdit(p)}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={13} color="#2563EB" />
                    <Text style={styles.editBtnText}>Aanpassen</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Wisselspelers */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Wisselspelers ({wisselPlayers.length})</Text>
          {wisselPlayers.length === 0 ? (
            <Text style={styles.emptyText}>Geen wisselspelers toegevoegd</Text>
          ) : (
            wisselPlayers.map((p) => (
              <View key={p.id} style={styles.playerItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  
                  {(p.phone || p.address) ? (
                    <Text style={styles.contactDetails} numberOfLines={1}>
                      {p.phone ? `📞 ${p.phone}` : ''}
                      {p.phone && p.address ? '  ·  ' : ''}
                      {p.address ? `📍 ${p.address}` : ''}
                    </Text>
                  ) : null}

                  {p.notes ? (
                    <Text style={styles.notesPreview} numberOfLines={1}>
                      💬 {p.notes}
                    </Text>
                  ) : null}
                </View>

                {canEdit(p) && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleOpenEdit(p)}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={13} color="#2563EB" />
                    <Text style={styles.editBtnText}>Aanpassen</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* OVERLAY 1: Speler Aanpassen */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Gegevens Aanpassen</Text>
                <Text style={styles.modalSubtitle}>{editingPlayer?.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow}>
                <Text style={styles.label}>Naam</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                />

                <Text style={styles.label}>Rol / Type</Text>
                <View style={[styles.typeToggle, !isAdmin && { opacity: 0.5 }]} pointerEvents={isAdmin ? 'auto' : 'none'}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, editType === 'VAST' && styles.toggleBtnActive]}
                    onPress={() => setEditType('VAST')}
                  >
                    <Text style={[styles.toggleText, editType === 'VAST' && styles.toggleTextActive]}>
                      Vast
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, editType === 'WISSEL' && styles.toggleBtnActive]}
                    onPress={() => setEditType('WISSEL')}
                  >
                    <Text style={[styles.toggleText, editType === 'WISSEL' && styles.toggleTextActive]}>
                      Wissel
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Telefoonnummer</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Bijv. 06-12345678"
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.label}>Adres</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Straat en woonplaats"
                  value={editAddress}
                  onChangeText={setEditAddress}
                />

                <Text style={styles.label}>Notities</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Opmerkingen over beschikbaarheid of bijzonderheden"
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline={true}
                  numberOfLines={2}
                />

                {/* Eigen wachtwoord wijzigen: alleen voor de ingelogde gebruiker zelf */}
                {isSelf && (
                  <View style={styles.passwordChangeSection}>
                    <View style={styles.passwordHeaderRow}>
                      <Feather name="lock" size={12} color="#2563EB" />
                      <Text style={styles.passwordSectionTitle}>Wachtwoord Wijzigen</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder={`Nieuw wachtwoord, min. ${MIN_PASSWORD_LENGTH} tekens (leeg = ongewijzigd)`}
                      secureTextEntry
                      autoCapitalize="none"
                      value={editNewPassword}
                      onChangeText={(t) => setEditNewPassword(sanitizePasswordInput(t))}
                    />
                  </View>
                )}

                {/* Admin: wachtwoord instellen voor een andere vaste speler */}
                {isAdmin && !isSelf && editingPlayer?.type === 'VAST' && (
                  <View style={styles.passwordChangeSection}>
                    <View style={styles.passwordHeaderRow}>
                      <Feather name="key" size={12} color="#2563EB" />
                      <Text style={styles.passwordSectionTitle}>Wachtwoord instellen</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder={`Nieuw wachtwoord, min. ${MIN_PASSWORD_LENGTH} tekens`}
                      secureTextEntry
                      autoCapitalize="none"
                      value={editNewPassword}
                      onChangeText={(t) => setEditNewPassword(sanitizePasswordInput(t))}
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, { marginTop: 8 }, busy && { opacity: 0.6 }]}
                      onPress={handleSetPassword}
                      disabled={busy}
                    >
                      <Text style={styles.saveBtnText}>Wachtwoord instellen</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Opslaan & Verwijder Knoppen */}
            <View style={styles.modalActionButtons}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                <Text style={styles.saveBtnText}>Opslaan</Text>
              </TouchableOpacity>
              {isAdmin && !isSelf && (
                <TouchableOpacity style={styles.deleteLinkBtn} onPress={handleDeleteFromModal}>
                  <Feather name="trash-2" size={13} color="#DC2626" />
                  <Text style={styles.deleteLinkText}>Verwijder Speler</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* OVERLAY 2: Nieuwe Speler Toevoegen */}
      <Modal
        visible={addModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nieuwe Speler</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setAddModalVisible(false)}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Naam</Text>
              <TextInput
                style={styles.input}
                placeholder="Bijv. Lars van Dijk"
                value={newName}
                onChangeText={setNewName}
                autoFocus={true}
              />

              <Text style={styles.label}>Rol / Type</Text>
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[styles.toggleBtn, newType === 'VAST' && styles.toggleBtnActive]}
                  onPress={() => setNewType('VAST')}
                >
                  <Text style={[styles.toggleText, newType === 'VAST' && styles.toggleTextActive]}>
                    Vaste Speler
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, newType === 'WISSEL' && styles.toggleBtnActive]}
                  onPress={() => setNewType('WISSEL')}
                >
                  <Text style={[styles.toggleText, newType === 'WISSEL' && styles.toggleTextActive]}>
                    Wissel
                  </Text>
                </TouchableOpacity>
              </View>

              {newType === 'VAST' && (
                <>
                  <Text style={styles.label}>Startwachtwoord</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`Minimaal ${MIN_PASSWORD_LENGTH} tekens`}
                    secureTextEntry
                    autoCapitalize="none"
                    value={newStartPassword}
                    onChangeText={(t) => setNewStartPassword(sanitizePasswordInput(t))}
                  />
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, busy && { opacity: 0.6 }]}
              onPress={handleAddSubmit}
              disabled={busy}
            >
              <Text style={styles.saveBtnText}>Speler Toevoegen</Text>
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
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  playerName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  contactDetails: { fontSize: 10, color: '#64748B', marginTop: 2 },
  notesPreview: { fontSize: 10, color: '#94A3B8', marginTop: 1, fontStyle: 'italic' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
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
    maxWidth: 400,
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
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  formRow: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  textArea: {
    height: 52,
    textAlignVertical: 'top',
  },
  typeToggle: { flexDirection: 'row', gap: 6, marginTop: 2 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  toggleBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  toggleText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  toggleTextActive: { color: '#FFFFFF' },
  passwordChangeSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  passwordHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  passwordSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  modalActionButtons: {
    marginTop: 14,
    gap: 8,
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  deleteLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
  },
  deleteLinkText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
});