import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Image, Dimensions, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { useAppStore } from '../src/store/appStore';

const { width, height } = Dimensions.get('window');

const onboardingData = [
  { image: require('../assets/onboarding1.jpg'), cta: 'START THE SALT CHECK' },
  { image: require('../assets/onboarding2.jpg'), cta: 'LET PEPPER CUT IT' },
  { image: require('../assets/onboarding3.jpg'), cta: 'NEXT SANE MOVE' },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const router = useRouter();
  const { setIsOnboarded } = useAppStore();
  const scrollViewRef = useRef<ScrollView>(null);

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    setIsOnboarded(true);
    router.replace('/(tabs)/pepper-checkin');
  };

  const handleSkip = () => {
    setIsOnboarded(true);
    router.replace('/(tabs)/pepper-checkin');
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.pageIndicator} testID="onboarding-page-indicator">
            {currentIndex + 1} / {onboardingData.length}
          </Text>
          <TouchableOpacity onPress={handleSkip} testID="onboarding-skip-btn">
            <Text style={styles.skipText}>SKIP</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const index = Math.round(x / width);
          setCurrentIndex(index);
        }}
        style={styles.scrollView}
      >
        {onboardingData.map((item, index) => (
          <View key={index} style={styles.slide}>
            <Image source={item.image} style={styles.image} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>

      <SafeAreaView style={styles.safeBottom} edges={['bottom']}>
        <View style={styles.footer}>
          <View style={styles.pagination}>
            {onboardingData.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentIndex === index ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleNext}
            activeOpacity={0.85}
            testID="onboarding-next-btn"
          >
            <Text style={styles.buttonText}>{onboardingData[currentIndex].cta}</Text>
            <View style={styles.buttonArrow}>
              <Text style={styles.buttonArrowText}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing.sm,
  },
  pageIndicator: {
    color: Colors.pepperRed,
    fontSize: Typography.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
  },
  skipText: {
    color: Colors.text,
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width,
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  safeBottom: {
    backgroundColor: Colors.background,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: Colors.brightRed,
    width: 24,
  },
  dotInactive: {
    backgroundColor: Colors.steelBlueGrey,
    width: 6,
    opacity: 0.4,
  },
  button: {
    backgroundColor: Colors.brightRed,
    height: 56,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonText: {
    color: Colors.saltBone,
    fontSize: Typography.fontSize.md,
    fontWeight: '700',
    letterSpacing: 2,
    flex: 1,
    textAlign: 'center',
  },
  buttonArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.saltBone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonArrowText: {
    color: Colors.brightRed,
    fontSize: 20,
    fontWeight: 'bold',
  },
});
