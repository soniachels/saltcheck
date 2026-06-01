import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export const API_URL = `${BACKEND_URL}/api`;

export const ENDPOINTS = {
  // User
  USERS: '/users',
  USER_BY_ID: (id: string) => `/users/${id}`,
  
  // PEPPER
  PEPPER_CHECKIN: '/pepper/checkin',
  PEPPER_HISTORY: (userId: string) => `/pepper/history/${userId}`,
  
  // Daily Entries
  DAILY_ENTRIES: '/daily-entries',
  DAILY_ENTRY_BY_DATE: (userId: string, date: string) => `/daily-entries/${userId}/${date}`,
  USER_DAILY_ENTRIES: (userId: string) => `/daily-entries/${userId}`,
  
  // Projects
  PROJECTS: '/projects',
  USER_PROJECTS: (userId: string) => `/projects/${userId}`,
  PROJECT_BY_ID: (id: string) => `/projects/${id}`,
  
  // Tasks
  TASKS: '/tasks',
  USER_TASKS: (userId: string) => `/tasks/${userId}`,
  TASK_BY_ID: (id: string) => `/tasks/${id}`,
  
  // Money
  MONEY_ENTRIES: '/money-entries',
  USER_MONEY_ENTRIES: (userId: string) => `/money-entries/${userId}`,
  MONEY_ENTRY_BY_ID: (id: string) => `/money-entries/${id}`,
  
  // Body Logs
  BODY_LOGS: '/body-logs',
  USER_BODY_LOGS: (userId: string) => `/body-logs/${userId}`,
  BODY_LOG_BY_ID: (id: string) => `/body-logs/${id}`,
  
  // Person Notes / Receipts
  PERSON_NOTES: '/person-notes',
  USER_PERSON_NOTES: (userId: string) => `/person-notes/${userId}`,
  PERSON_NOTE_BY_ID: (id: string) => `/person-notes/${id}`,
};
