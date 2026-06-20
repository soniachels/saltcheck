import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ImageBackground,
  Image,
  TextInput,
  Animated,
  Easing,
  Platform,
  UIManager,
  LayoutAnimation,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme';
import { useAppStore } from '../src/store/appStore';

const { width, height } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LOGO = require('../assets/saltylabz-wordmark.png'); // tight crop, 711x206
const WORDMARK = require('../assets/saltcheck-wordmark.png'); // 462x160
const BG = [
  require('../assets/onb-bg-1.jpg'),
  require('../assets/onb-bg-2.jpg'),
  require('../assets/onb-bg-3.jpg'),
];

const CTA = ['CUT IT', 'LET PEPPER CUT IT', 'NEXT SANE MOVE'];
const TABS = ['Brand strategy', 'Shower', 'Vitamins'];
const TOP3 = [
  { title: 'send client follow-up', tag: 'WORK', color: Colors.saltBone },
  { title: 'check cash before spending', tag: 'MONEY', color: Colors.pickleLime },
  { title: 'eat something with protein', tag: 'BODY', color: Colors.softSpiceLilac },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { setIsOnboarded } = useAppStore();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  // interactive state
  const [dump, setDump] = useState('');
  const [closedTabs, setClosedTabs] = useState<Set<number>>(new Set());
  const [claimed, setClaimed] = useState<Set<number>>(new Set());

  const finish = () => {
    setIsOnboarded(true);
    router.replace('/(tabs)/pepper-checkin');
  };

  const goNext = () => {
    if (index < 2) {
      const n = index + 1;
      setIndex(n);
      scrollRef.current?.scrollTo({ x: n * width, animated: true });
    } else {
      finish();
    }
  };

  const closeTab = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setClosedTabs((prev) => new Set(prev).add(i));
  };
  const claim = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY));
    setClaimed((prev) => new Set(prev).add(i));
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
      >
        {/* ===== CARD 1 — the mess ===== */}
        <ImageBackground source={BG[0]} style={styles.slide} resizeMode="cover">
          <LinearGradient colors={['rgba(13,13,13,0.7)', 'rgba(13,13,13,0.2)', 'rgba(13,13,13,0.92)']} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <TopBar index={0} onSkip={finish} />
            <View style={styles.body}>
              <Text style={styles.kicker}>MANAGED BY <Text style={{ color: Colors.brightRed }}>PEPPER.</Text></Text>
              <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
              <Text style={styles.sub}>messages, money, work, that text you're ignoring. all of it.</Text>
            </View>
            <View style={styles.bottom}>
              <Text style={styles.label}>LIFE IS A MESS. DUMP IT HERE.</Text>
              <TextInput
                style={styles.dumpBox}
                value={dump}
                onChangeText={setDump}
                placeholder="ugh, i have SO much to do and zero energy…"
                placeholderTextColor="rgba(230,220,209,0.4)"
                multiline
                testID="onb-dump"
              />
              <CtaButton label={CTA[0]} onPress={goNext} />
            </View>
          </SafeAreaView>
        </ImageBackground>

        {/* ===== CARD 2 — PEPPER cuts it ===== */}
        <ImageBackground source={BG[1]} style={styles.slide} resizeMode="cover">
          <LinearGradient colors={['rgba(13,13,13,0.55)', 'rgba(13,13,13,0.15)', 'rgba(13,13,13,0.92)']} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <TopBar index={1} onSkip={finish} />
            <View style={styles.body}>
              <Text style={styles.heroBig}>PEPPER</Text>
              <Text style={styles.sub}>your protective bestie. she cuts the noise, keeps what matters.</Text>
            </View>
            <View style={styles.bottom}>
              <ReadingBubble />
              <View style={styles.pepperBubble}>
                <Text style={styles.pepperBubbleText}>okay, real quick — that's too many tabs. we're closing three. tap them.</Text>
              </View>
              {TABS.map((t, i) => {
                const closed = closedTabs.has(i);
                return (
                  <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => closeTab(i)} style={[styles.tab, closed && styles.tabClosed]}>
                    <Text style={[styles.tabText, closed && styles.tabTextClosed]}>{t}</Text>
                    <View style={[styles.tabP, closed && styles.tabPClosed]}>
                      <Ionicons name={closed ? 'checkmark' : 'close'} size={14} color={Colors.inkBlack} />
                    </View>
                  </TouchableOpacity>
                );
              })}
              <CtaButton label={CTA[1]} onPress={goNext} />
            </View>
          </SafeAreaView>
        </ImageBackground>

        {/* ===== CARD 3 — salt checked ===== */}
        <ImageBackground source={BG[2]} style={styles.slide} resizeMode="cover">
          <LinearGradient colors={['rgba(13,13,13,0.78)', 'rgba(13,13,13,0.25)', 'rgba(13,13,13,0.92)']} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <TopBar index={2} onSkip={finish} />
            <View style={styles.body}>
              <Text style={styles.kicker}>YOU'VE BEEN</Text>
              <Text style={styles.heroBig}>SALT{'\n'}CHECKED</Text>
              <View style={styles.labResult}>
                <View style={styles.labDot} />
                <Text style={styles.labResultText}>YOUR LAB RESULT IS READY</Text>
              </View>
            </View>
            <View style={styles.bottom}>
              <Text style={styles.label}>TOP 3 — TAP TO CLAIM</Text>
              {TOP3.map((t, i) => {
                const done = claimed.has(i);
                return (
                  <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => claim(i)} style={[styles.top3, { backgroundColor: t.color }, done && styles.top3Done]}>
                    <View style={[styles.top3Check, done && styles.top3CheckOn]}>
                      {done && <Ionicons name="checkmark" size={15} color={t.color} />}
                    </View>
                    <Text style={[styles.top3Text, done && styles.top3TextDone]} numberOfLines={1}>{t.title}</Text>
                    <Text style={styles.top3Tag}>{t.tag}</Text>
                  </TouchableOpacity>
                );
              })}
              <CtaButton label={CTA[2]} onPress={goNext} />
            </View>
          </SafeAreaView>
        </ImageBackground>
      </ScrollView>
    </View>
  );
}

// --- pieces ---

function TopBar({ index, onSkip }: { index: number; onSkip: () => void }) {
  return (
    <View style={styles.topBar}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <View style={styles.topRight}>
        <Text style={styles.pageIndicator}>{index + 1} / 3</Text>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skip}>SKIP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CtaButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.cta} onPress={onPress} activeOpacity={0.9} testID="onb-cta">
      <Text style={styles.ctaText}>{label}</Text>
      <View style={styles.ctaArrow}><Ionicons name="arrow-forward" size={18} color={Colors.brightRed} /></View>
    </TouchableOpacity>
  );
}

function ReadingBubble() {
  const dot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dot]);
  return (
    <View style={styles.reading}>
      <Text style={styles.readingText}>* PEPPER IS READING</Text>
      <Animated.Text style={[styles.readingDots, { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }]}>● ● ●</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  slide: { width, height },
  safe: { flex: 1, paddingHorizontal: Spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm },
  logo: { width: 104, height: 30 },
  wordmark: { width: 250, height: 90, marginVertical: Spacing.sm, alignSelf: 'flex-start' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pageIndicator: { color: Colors.brightRed, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  skip: { color: Colors.text, fontSize: Typography.fontSize.xs, fontWeight: '700', letterSpacing: 1, opacity: 0.7 },

  body: { flex: 1, justifyContent: 'center' },
  kicker: { color: Colors.text, fontSize: Typography.fontSize.sm, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  hero: { color: Colors.text, fontSize: Typography.fontSize.hero, fontWeight: '900', letterSpacing: -1, lineHeight: Typography.fontSize.hero * 1.05 },
  heroBig: { color: Colors.text, fontSize: 56, fontWeight: '900', letterSpacing: 1, lineHeight: 56 },
  sub: { color: Colors.textSubtle, fontSize: Typography.fontSize.md, marginTop: Spacing.md, lineHeight: Typography.fontSize.md * 1.4, maxWidth: '90%' },
  labResult: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brightRed, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: BorderRadius.full, marginTop: Spacing.lg },
  labDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.saltBone },
  labResultText: { color: Colors.saltBone, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },

  bottom: { paddingBottom: Spacing.md },
  label: { color: Colors.text, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 2, marginBottom: Spacing.sm },
  dumpBox: {
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg, padding: Spacing.md, minHeight: 88, color: Colors.text,
    fontSize: Typography.fontSize.base, textAlignVertical: 'top', marginBottom: Spacing.md,
  },

  reading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  readingText: { color: Colors.brightRed, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  readingDots: { color: Colors.brightRed, fontSize: 8 },
  pepperBubble: { backgroundColor: Colors.brightRed, borderRadius: BorderRadius.lg, borderBottomLeftRadius: 2, padding: Spacing.md, marginBottom: Spacing.md, alignSelf: 'flex-start', maxWidth: '92%' },
  pepperBubbleText: { color: Colors.saltBone, fontSize: Typography.fontSize.base, fontWeight: '600', lineHeight: Typography.fontSize.base * 1.35 },

  tab: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,18,22,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  tabClosed: { opacity: 0.45, backgroundColor: 'rgba(20,18,22,0.5)' },
  tabText: { flex: 1, color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '600' },
  tabTextClosed: { textDecorationLine: 'line-through', color: Colors.textSubtle },
  tabP: { width: 26, height: 26, borderRadius: 6, backgroundColor: Colors.saltBone, alignItems: 'center', justifyContent: 'center' },
  tabPClosed: { backgroundColor: Colors.pickleLime },

  top3: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  top3Done: { opacity: 0.85 },
  top3Check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(13,13,13,0.4)', alignItems: 'center', justifyContent: 'center' },
  top3CheckOn: { backgroundColor: Colors.inkBlack, borderColor: Colors.inkBlack },
  top3Text: { flex: 1, color: Colors.inkBlack, fontSize: Typography.fontSize.base, fontWeight: '700' },
  top3TextDone: { textDecorationLine: 'line-through' },
  top3Tag: { color: Colors.inkBlack, fontSize: Typography.fontSize.xs, fontWeight: '900', letterSpacing: 1, opacity: 0.6 },

  cta: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brightRed, height: 56, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  ctaText: { flex: 1, color: Colors.saltBone, fontSize: Typography.fontSize.md, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  ctaArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.saltBone, alignItems: 'center', justifyContent: 'center' },
});
