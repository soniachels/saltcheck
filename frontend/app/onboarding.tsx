import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Layout, Spacing } from '../src/theme';
import { Button } from '../src/components/Button';
import { useAppStore } from '../src/store/appStore';

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    image: require('../assets/onboarding1.jpg'),
    title: 'LIFE IS A MESS',
    subtitle: 'DUMP IT HERE',
    description: 'Developed by saltylabz. Managed by PEPPER.',
  },
  {
    image: require('../assets/onboarding2.jpg'),
    title: 'MEET PEPPER',
    subtitle: 'YOUR PROTECTIVE BESTIE',
    description: "She cuts through the noise. Keeps what matters.",
  },
  {
    image: require('../assets/onboarding3.jpg'),
    title: "YOU'VE BEEN",
    subtitle: 'SALT CHECKED',
    description: 'Your lab result is ready. Get 3-5 sane moves.',
  },
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
      handleStart();
    }
  };

  const handleStart = () => {
    setIsOnboarded(true);
    router.replace('/pepper-checkin');
  };

  const handleSkip = () => {
    setIsOnboarded(true);
    router.replace('/pepper-checkin');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>SKIP</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const index = Math.round(x / width);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      >
        {onboardingData.map((item, index) => (
          <View key={index} style={styles.slide}>
            <Image source={item.image} style={styles.image} resizeMode="cover" />
            <View style={styles.overlay}>
              <View style={styles.content}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

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

        <Button
          title={currentIndex === onboardingData.length - 1 ? 'START THE SALT CHECK' : 'NEXT'}
          onPress={handleNext}
          variant="primary"
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: Layout.screenPadding,
    zIndex: 10,
    padding: Spacing.sm,
  },
  skipText: {
    color: Colors.text,
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  slide: {
    width,
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    paddingBottom: 150,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
  },
  title: {
    fontSize: Typography.fontSize.hero,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  description: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    lineHeight: Typography.fontSize.md * 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 40,
    backgroundColor: Colors.background,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: Colors.pepperRed,
    width: 24,
  },
  dotInactive: {
    backgroundColor: Colors.steelBlueGrey,
  },
  button: {
    width: '100%',
  },
});