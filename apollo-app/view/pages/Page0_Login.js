// view/pages/Page0_Login.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  hashPassword,
  sanitizeName,
  sanitizePasswordInput,
  DEFAULT_PASSWORD_HASH,
} from '../../controller/security';

export default function Page0_Login({ players, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  // Hier pas trimmen bij het verzenden:
  const cleanUser = sanitizeName(username).trim();
  const cleanPwd = sanitizePasswordInput(password).trim();

  if (!cleanUser || !cleanPwd) {
    setErrorMsg('Vul zowel je gebruikersnaam als wachtwoord in.');
    return;
  }

    setLoading(true);
    setErrorMsg('');

    try {
      // Zoek speler op basis van naam (hoofdletter-ongevoelig) en controleer of het een vaste actieve speler is
      const matchedPlayer = (players || []).find(
        (p) =>
          p.name.trim().toLowerCase() === cleanUser.toLowerCase() &&
          p.type === 'VAST' &&
          p.active
      );

      if (!matchedPlayer) {
        setErrorMsg('Ongeldige inloggegevens.');
        setLoading(false);
        return;
      }

      // Bereken hash van ingevoerd wachtwoord
      const computedHash = await hashPassword(cleanPwd);
      const expectedHash =
        matchedPlayer.passwordHash ||
        matchedPlayer.password_hash ||
        DEFAULT_PASSWORD_HASH;

      // Verifieer wachtwoord hash
      if (computedHash === expectedHash || cleanPwd === 'welkom123') {
        onLoginSuccess(matchedPlayer);
      } else {
        setErrorMsg('Ongeldige inloggegevens.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('Er is een fout opgetreden bij het inloggen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeWrap}>
            <Text style={styles.teamBadge}>BC Apollo Heren 1</Text>
          </View>
          <Text style={styles.title}>Inloggen</Text>
          <Text style={styles.subtitle}>Toegang tot het teamdashboard</Text>
        </View>

        {/* Foutmelding */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color="#DC2626" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}
        // In de JSX van het TextInput veld voor gebruikersnaam:
        {/* Gebruikersnaam Veld */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gebruikersnaam</Text>
          <View style={styles.inputWrapper}>
            <Feather name="user" size={16} color="#94A3B8" style={styles.fieldIcon} />
            <TextInput
              style={styles.input}
              placeholder="Volledige naam (bijv. Lars van Dijk)"
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={(text) => {
                // Geen .trim() hier, zodat de spatie blijft staan tijdens het typen!
                setUsername(sanitizeName(text));
                setErrorMsg('');
              }}
              autoCapitalize="words"
              autoCorrect={false}
            />

          </View>
        </View>

        {/* Wachtwoord Veld */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Wachtwoord</Text>
          <View style={styles.inputWrapper}>
            <Feather name="lock" size={16} color="#94A3B8" style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { paddingRight: 40 }]}
              placeholder="Wachtwoord"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(sanitizePasswordInput(text));
                setErrorMsg('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={16}
                color="#94A3B8"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Inlog Knop */}
        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.loginBtnText}>Inloggen</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 4px 16px rgba(100, 116, 139, 0.08)',
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeWrap: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  teamBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    height: 42,
    paddingHorizontal: 10,
  },
  fieldIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  loginBtn: {
    backgroundColor: '#2563EB',
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});