import axios from 'axios';
import { API_URL } from '../constants/api';
import { storage } from '../utils/storage';

const TOKEN_KEY = 'saltcheck-auth-token';

// In-memory copy of the auth token so the request interceptor stays synchronous.
let authToken: string | null = null;

/** Load the persisted token (Keychain on native) into memory. Call once on app boot. */
export async function loadStoredToken(): Promise<string | null> {
  const stored = await storage.secureGet<string>(TOKEN_KEY, '');
  authToken = stored && stored.length > 0 ? stored : null;
  return authToken;
}

/** Persist + activate a token (after login/register). */
export async function setAuthToken(token: string): Promise<void> {
  authToken = token;
  await storage.secureSet(TOKEN_KEY, token);
}

/** Drop the token everywhere (logout / expired session). */
export async function clearAuthToken(): Promise<void> {
  authToken = null;
  await storage.secureRemove(TOKEN_KEY);
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Generous default — PEPPER's AI calls (sort/advise) can take a while.
  timeout: 60000,
});

// Request interceptor — attach the bearer token to every call.
apiClient.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If the session is rejected, drop the stale token so the next launch
    // routes back to the login screen.
    const status = error.response?.status;
    if (status === 401) {
      clearAuthToken();
    }
    // Only log genuine problems (server/network). 4xx are expected states the
    // callers handle (e.g. an empty day), so don't spam the dev error overlay.
    if (!error.response || status >= 500) {
      console.error('API Error:', error.response?.data || error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
