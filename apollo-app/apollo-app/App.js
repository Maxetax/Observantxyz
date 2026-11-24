// App.js
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Landingpage from './view/Landingpage';

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <Landingpage />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});