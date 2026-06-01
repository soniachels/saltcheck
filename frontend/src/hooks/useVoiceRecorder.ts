import { useState, useRef, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import apiClient from '../services/api';

interface UseVoiceRecorderResult {
  isRecording: boolean;
  isTranscribing: boolean;
  durationMs: number;
  start: () => Promise<boolean>;
  stopAndTranscribe: () => Promise<string | null>;
  cancel: () => Promise<void>;
}

const TIMER_TICK_MS = 200;

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tearDownTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Heads up', 'Voice dump works on iOS/Android only. Type for now.');
      return false;
    }

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain === false) {
          Alert.alert(
            'Microphone blocked',
            'Enable mic access in Settings to dump by voice.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
        return false;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      startTsRef.current = Date.now();
      setDurationMs(0);
      setIsRecording(true);
      tearDownTimer();
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTsRef.current);
      }, TIMER_TICK_MS);
      return true;
    } catch (e) {
      console.error('Start recording failed:', e);
      Alert.alert('Mic hiccup', 'Could not start recording. Try again.');
      return false;
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    tearDownTimer();
    setIsRecording(false);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setDurationMs(0);
        return null;
      }

      setIsTranscribing(true);

      const formData = new FormData();
      // @ts-ignore RN-style FormData file
      formData.append('file', {
        uri,
        name: 'dump.m4a',
        type: 'audio/m4a',
      });

      const response = await apiClient.post('/pepper/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      setDurationMs(0);
      return response.data?.text || null;
    } catch (e: any) {
      console.error('Transcription failed:', e);
      Alert.alert('PEPPER missed that', e?.response?.data?.detail || 'Try again or type it out.');
      setDurationMs(0);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [recorder]);

  const cancel = useCallback(async () => {
    tearDownTimer();
    try {
      if (isRecording) await recorder.stop();
    } catch {}
    setIsRecording(false);
    setDurationMs(0);
  }, [isRecording, recorder]);

  return {
    isRecording,
    isTranscribing,
    durationMs,
    start,
    stopAndTranscribe,
    cancel,
  };
}
