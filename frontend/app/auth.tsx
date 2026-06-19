import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Layout, Spacing } from '../src/theme';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { useAppStore } from '../src/store/appStore';
import {
  loginAccount,
  registerAccount,
  authErrorMessage,
} from '../src/services/auth';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const { setAuthUser, isOnboarded } = useAppStore();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async () => {
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password, please.');
      return;
    }
    if (isSignup && !name.trim()) {
      setError('What should PEPPER call you?');
      return;
    }
    if (isSignup && password.length < 8) {
      setError('Password needs at least 8 characters. Make it count.');
      return;
    }

    setLoading(true);
    try {
      const user = isSignup
        ? await registerAccount({ email, password, name: name.trim() })
        : await loginAccount(email, password);

      setAuthUser(user);
      router.replace(isOnboarded ? '/(tabs)' : '/onboarding');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setError('');
    setMode(isSignup ? 'login' : 'signup');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.brand}>SALT CHECK</Text>
            <Text style={styles.tagline}>
              {isSignup ? 'Make an account. Lock your chaos to you.' : 'Welcome back. Let\'s sort it.'}
            </Text>
          </View>

          <View style={styles.form}>
            {isSignup && (
              <Input
                label="Your name"
                placeholder="What PEPPER calls you"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}

            <Input
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
            />

            <Input
              label="Password"
              placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Button
              title={isSignup ? 'CREATE ACCOUNT' : 'LOG IN'}
              onPress={handleSubmit}
              loading={loading}
              style={styles.submit}
            />

            <TouchableOpacity onPress={toggleMode} style={styles.toggle}>
              <Text style={styles.toggleText}>
                {isSignup
                  ? 'Already have an account? Log in'
                  : "New here? Make an account"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  brand: {
    fontSize: Typography.fontSize.xxl ?? 32,
    fontWeight: '800',
    color: Colors.brightRed,
    letterSpacing: 4,
  },
  tagline: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    opacity: 0.8,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  error: {
    color: Colors.brightRed,
    fontSize: Typography.fontSize.sm,
    marginBottom: Spacing.sm,
  },
  submit: {
    marginTop: Spacing.sm,
  },
  toggle: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  toggleText: {
    color: Colors.text,
    fontSize: Typography.fontSize.sm,
    opacity: 0.8,
  },
});
