import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors } from '../src/theme';

export default function Index() {
  const router = useRouter();
  const { isOnboarded } = useAppStore();

  useEffect(() => {
    // Navigate based on onboarding status
    const timer = setTimeout(() => {
      if (isOnboarded) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOnboarded]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.pepperRed} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
