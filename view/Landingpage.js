// view/Landingpage.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAppController } from '../controller/Controller';
import { SubformRouter } from '../router/Router';
import { clearLocalCache } from '../controller/storage';
import { supabase } from '../controller/supabase';
import Page0_Login from './pages/Page0_Login';

export default function Landingpage() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const controller = useAppController('Page1', session);

  // The Supabase Auth session is the only source of truth for who is logged in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await clearLocalCache();
  };

  // The logged-in player's live record.
  const currentUser = session
    ? controller.players.find((p) => p.authUserId === session.user.id) ?? null
    : null;

  // Sign out a player who has been removed or deactivated since logging in.
  const mustSignOut = !!session && controller.isLoaded && (!currentUser || !currentUser.active);
  useEffect(() => {
    if (mustSignOut) handleLogout();
  }, [mustSignOut]);

  if (!sessionChecked || (session && (!controller.isLoaded || mustSignOut))) {
    return (
      <View style={[styles.screenContainer, styles.centered]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!session) {
    return (
      <View
        style={[
          styles.screenContainer,
          {
            paddingTop: Math.max(
              insets.top,
              Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0
            ),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Page0_Login />
      </View>
    );
  }

  const navTabs = [
    { id: 'Page1', label: 'Overzicht', icon: 'grid' },
    { id: 'Page2', label: 'Wedstrijden', icon: 'calendar' },
    { id: 'Page3', label: 'Spelers', icon: 'users' },
    { id: 'Page4', label: 'Stats', icon: 'trending-up' },
    { id: 'Page5', label: 'Score', icon: 'edit-3' },
  ];

  return (
    <View
      style={[
        styles.screenContainer,
        {
          paddingTop: Math.max(
            insets.top,
            Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0
          ),
        },
      ]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
        translucent={Platform.OS === 'android'}
      />

      {/* Top Profile & Logout Header */}
      <View style={styles.topUserBar}>
        <View style={styles.userBadge}>
          <Feather
            name={currentUser?.isAdmin ? 'shield' : 'user'}
            size={12}
            color="#2563EB"
          />
          <Text style={styles.userBadgeText}>{currentUser?.name}</Text>
          {currentUser?.isAdmin && <Text style={styles.adminTinyTag}>(Admin)</Text>}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={12} color="#DC2626" />
          <Text style={styles.logoutBtnText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>

      {/* Main Dynamic View */}
      <View style={styles.contentArea}>
        <SubformRouter controller={controller} currentUser={currentUser} />
      </View>

      {/* Bottom Nav */}
      <View
        style={[
          styles.bottomNavWrapper,
          {
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.navBar}>
          {navTabs.map((tab) => {
            const isActive = controller.currentRoute === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => controller.navigateTo(tab.id)}
                activeOpacity={0.7}
              >
                <Feather
                  name={tab.icon}
                  size={18}
                  color={isActive ? '#2563EB' : '#94A3B8'}
                />
                <Text
                  style={[styles.navLabel, isActive && styles.navLabelActive]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#F8FAFC', width: '100%' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  topUserBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  userBadgeText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  adminTinyTag: { fontSize: 9, fontWeight: '800', color: '#1D4ED8' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3 },
  logoutBtnText: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
  contentArea: { flex: 1, width: '100%' },
  bottomNavWrapper: { width: '100%', paddingHorizontal: 12, paddingTop: 6, backgroundColor: '#F8FAFC' },
  navBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
    }),
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, marginHorizontal: 2, borderRadius: 10, gap: 2 },
  navItemActive: { backgroundColor: '#EFF6FF' },
  navLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', textAlign: 'center' },
  navLabelActive: { color: '#2563EB', fontWeight: '800' },
});