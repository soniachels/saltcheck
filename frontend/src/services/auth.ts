import apiClient, { setAuthToken, clearAuthToken } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  pepper_spice_level: 'mild' | 'medium' | 'extra_spicy';
  timezone: string;
  height_cm?: number | null;
  unit_system?: 'metric' | 'imperial' | null;
}

export interface ProfileFields {
  nickname?: string;
  pepper_spice_level?: 'mild' | 'medium' | 'extra_spicy';
  timezone?: string;
  height_cm?: number;
  unit_system?: 'metric' | 'imperial';
}

/** Update profile fields and return the refreshed user. */
export async function updateProfile(fields: ProfileFields): Promise<AuthUser> {
  const { data } = await apiClient.put('/auth/me', fields);
  return data;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  nickname?: string;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Create an account. Stores the returned token and returns the user. */
export async function registerAccount(payload: RegisterPayload): Promise<AuthUser> {
  const { data } = await apiClient.post('/auth/register', {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    timezone: deviceTimezone(),
  });
  await setAuthToken(data.token);
  return data.user;
}

/** Log in. Stores the returned token and returns the user. */
export async function loginAccount(email: string, password: string): Promise<AuthUser> {
  const { data } = await apiClient.post('/auth/login', {
    email: email.trim().toLowerCase(),
    password,
  });
  await setAuthToken(data.token);
  return data.user;
}

/** Resolve the current user from a stored token. Throws if the token is invalid. */
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await apiClient.get('/auth/me');
  return data;
}

/** Clear the token locally. */
export async function logoutAccount(): Promise<void> {
  await clearAuthToken();
}

/** Turn an axios error into a human-readable message. */
export function authErrorMessage(err: any, fallback = 'Something went wrong. Try again.'): string {
  return err?.response?.data?.detail || err?.message || fallback;
}
