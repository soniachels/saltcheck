import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors } from '../src/theme';
import { loadStoredToken } from '../src/services/api';
import { fetchMe } from '../src/services/auth';

export default function Index() {
  const router = useRouter();
  const { setAuthUser } = useAppStore();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Restore session from the securely-stored token, if any.
      const token = await loadStoredToken();

      if (!token) {
        if (!cancelled) router.replace('/auth');
        return;
      }

      try {
        const user = await fetchMe();
        if (cancelled) return;
        setAuthUser(user);
        // isOnboarded is read fresh from the store after auth.
        const onboarded = useAppStore.getState().isOnboarded;
        router.replace(onboarded ? '/(tabs)' : '/onboarding');
      } catch {
        // Token invalid/expired (interceptor already cleared it).
        if (!cancelled) router.replace('/auth');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
