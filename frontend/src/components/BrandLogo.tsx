import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '../theme';

/**
 * Brand logo for a bill/income row.
 * Resolution order:
 *   1. Known brand → Clearbit logo (real logo, fetched online).
 *   2. Single-word label → guess `<label>.com` on Clearbit.
 *   3. Generic keyword (phone, rent, car…) → a themed Ionicon.
 *   4. Anything else / network miss → a colored initial badge.
 * Always degrades gracefully: if the remote logo 404s, it falls back.
 */

// label keyword → domain for the brands users actually subscribe to.
const BRAND_DOMAINS: Record<string, string> = {
  spotify: 'spotify.com', netflix: 'netflix.com', adobe: 'adobe.com',
  youtube: 'youtube.com', disney: 'disney.com', hulu: 'hulu.com',
  amazon: 'amazon.com', prime: 'amazon.com', apple: 'apple.com',
  icloud: 'apple.com', google: 'google.com', microsoft: 'microsoft.com',
  office: 'microsoft.com', xbox: 'xbox.com', playstation: 'playstation.com',
  nintendo: 'nintendo.com', steam: 'steampowered.com', twitch: 'twitch.tv',
  hbo: 'hbomax.com', max: 'hbomax.com', paramount: 'paramountplus.com',
  notion: 'notion.so', figma: 'figma.com', canva: 'canva.com',
  dropbox: 'dropbox.com', github: 'github.com', linkedin: 'linkedin.com',
  grammarly: 'grammarly.com', audible: 'audible.com', patreon: 'patreon.com',
  claude: 'claude.ai', anthropic: 'anthropic.com', openai: 'openai.com',
  chatgpt: 'openai.com', capcut: 'capcut.com', tiktok: 'tiktok.com',
  uber: 'uber.com', grab: 'grab.com', shopee: 'shopee.com', lazada: 'lazada.com',
  astro: 'astro.com.my', maxis: 'maxis.com.my', digi: 'digi.com.my',
  celcom: 'celcom.com.my', unifi: 'unifi.com.my',
};

// generic category keyword → icon + tint (for non-brand bills)
const KEYWORD_ICONS: { match: string[]; icon: keyof typeof Ionicons.glyphMap; tint: string }[] = [
  { match: ['phone', 'mobile', 'telco', 'sim'], icon: 'phone-portrait', tint: Colors.softSpiceLilac },
  { match: ['rent', 'home', 'house', 'mortgage'], icon: 'home', tint: Colors.limeElectric },
  { match: ['car', 'auto', 'vehicle', 'petrol', 'fuel'], icon: 'car-sport', tint: Colors.steelBlueGrey },
  { match: ['electric', 'power', 'utility', 'tnb'], icon: 'flash', tint: Colors.limeBright },
  { match: ['water', 'air'], icon: 'water', tint: Colors.steelBlueGrey },
  { match: ['wifi', 'internet', 'broadband', 'fibre', 'fiber'], icon: 'wifi', tint: Colors.softSpiceLilac },
  { match: ['gym', 'fitness'], icon: 'barbell', tint: Colors.limeElectric },
  { match: ['insurance', 'takaful'], icon: 'shield-checkmark', tint: Colors.steelBlueGrey },
  { match: ['card', 'loan', 'repayment', 'credit'], icon: 'card', tint: Colors.berryPill },
];

// stable colored badge for unknown labels
const BADGE_TINTS = [Colors.limeElectric, Colors.softSpiceLilac, Colors.brightRed, Colors.steelBlueGrey, Colors.pickleLime];
function tintFor(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return BADGE_TINTS[h % BADGE_TINTS.length];
}

function resolveDomain(label: string): string | null {
  const l = label.toLowerCase();
  for (const key of Object.keys(BRAND_DOMAINS)) {
    if (l.includes(key)) return BRAND_DOMAINS[key];
  }
  // single bare word that looks like a brand → guess <word>.com
  const word = l.trim();
  if (/^[a-z0-9]+$/.test(word) && word.length > 2) return `${word}.com`;
  return null;
}

function keywordIcon(label: string) {
  const l = label.toLowerCase();
  return KEYWORD_ICONS.find((k) => k.match.some((m) => l.includes(m))) || null;
}

interface Props {
  label: string;
  size?: number;
}

export const BrandLogo: React.FC<Props> = ({ label, size = 44 }) => {
  const [failed, setFailed] = useState(false);
  const domain = resolveDomain(label);
  const radius = size * 0.28;
  const box = { width: size, height: size, borderRadius: radius };

  if (domain && !failed) {
    return (
      <View style={[styles.logoWrap, box]}>
        <Image
          source={{ uri: `https://logo.clearbit.com/${domain}?size=128` }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  const kw = keywordIcon(label);
  if (kw) {
    return (
      <View style={[styles.iconBadge, box, { backgroundColor: Colors.inkBlack, borderColor: kw.tint }]}>
        <Ionicons name={kw.icon} size={size * 0.5} color={kw.tint} />
      </View>
    );
  }

  const tint = tintFor(label);
  return (
    <View style={[styles.iconBadge, box, { backgroundColor: tint }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42, color: Colors.inkBlack }]}>
        {(label.trim()[0] || '?').toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  logoWrap: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  initial: {
    fontFamily: Typography.fontFamily.display,
  },
});
