// App display fonts (bundled). Unlike the vector-icon fonts, these are real
// .ttf assets shipped with the app, so they load the same way everywhere.
//   • IBMPlexMono(*)    — the spaced uppercase mono labels + tabular numbers
//   • Anton             — the condensed bold headline ("broke, again?")
//   • Horizon           — the wide display (GIRL MATH, RM 300, card labels)
//   • SpaceMono/ArchivoBlack — legacy, kept until fully migrated
// NOTE: Horizon is added once assets/fonts/Horizon.ttf is dropped in (see
// HORIZON_PENDING). System Arial is used for bill names (no file needed).
// Usage: const [loaded, error] = useAppFonts();
import { useFonts } from 'expo-font';

export const useAppFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    'SpaceMono-Regular': require('../../assets/fonts/SpaceMono-Regular.ttf'),
    ArchivoBlack: require('../../assets/fonts/ArchivoBlack-Regular.ttf'),
    Anton: require('../../assets/fonts/Anton-Regular.ttf'),
    IBMPlexMono: require('../../assets/fonts/IBMPlexMono-Regular.ttf'),
    'IBMPlexMono-Medium': require('../../assets/fonts/IBMPlexMono-Medium.ttf'),
    'IBMPlexMono-SemiBold': require('../../assets/fonts/IBMPlexMono-SemiBold.ttf'),
    'IBMPlexMono-Bold': require('../../assets/fonts/IBMPlexMono-Bold.ttf'),
    Horizon: require('../../assets/fonts/Horizon.otf'),
  });
