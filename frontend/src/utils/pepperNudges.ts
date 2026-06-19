import * as Notifications from 'expo-notifications';

// PEPPER's re-engagement "mood engine".
//
// These are LOCAL scheduled notifications: each time the user opens the app we
// cancel + reschedule an escalating ladder of nudges starting "now". The longer
// they stay away, the further down the ladder fires — so PEPPER's tone shifts
// from sweet -> bored -> moody -> jealous/mean -> desperate the longer it's been,
// with a rare love-bomb. No server required (works even when the app is closed).
//
// A future server-driven version (LLM-written, sent as remote push) can layer on
// top once the backend is deployed; the relay is already wired (register-push).

const NUDGE_PREFIX = 'saltcheck-nudge';

export type Mood =
  | 'sweet' | 'kind' | 'patient'
  | 'bored' | 'sassy' | 'puns' | 'hyperGenZ'
  | 'moody' | 'jealous' | 'mean' | 'desperate'
  | 'loveBomb';

const MOOD_MESSAGES: Record<Mood, { title: string; body: string }[]> = {
  sweet: [
    { title: 'thinking about you 🧂', body: 'no pressure. just here when you want to sort it.' },
    { title: 'hey you', body: 'your loops are safe with me. come say hi.' },
  ],
  kind: [
    { title: 'gentle check-in', body: "whatever today was, you can put it down here." },
    { title: "it's okay to start small", body: 'one thing. that\'s the whole ask.' },
  ],
  patient: [
    { title: "still here.", body: "no rush. the floor's not going anywhere." },
    { title: 'whenever you\'re ready', body: 'i kept everything exactly where you left it.' },
  ],
  bored: [
    { title: 'sooo…', body: 'i\'ve just been watching your unpaid bills. riveting.' },
    { title: 'it\'s quiet in here', body: 'too quiet. give me a dump to chew on.' },
  ],
  sassy: [
    { title: 'oh we\'re ignoring the app now?', body: 'cute. your top 3 says hi.' },
    { title: 'be so for real', body: 'you opened TikTok 40 times but not me?' },
  ],
  puns: [
    { title: 'this is nacho best week', body: 'but we can taco \'bout it. open up.' },
    { title: 'don\'t go bacon my heart', body: 'come back and sort the chaos, season it right.' },
  ],
  hyperGenZ: [
    { title: 'bestie the loops are giving abandoned', body: 'no bc why is your to-do list ghosting ME 💀' },
    { title: 'it\'s the avoidance for me', body: 'slay later, salt check now. periodt.' },
  ],
  moody: [
    { title: 'whatever.', body: 'open the app or don\'t. i\'m not your mom.' },
    { title: 'fine.', body: 'your bills are piling up but go off i guess.' },
  ],
  jealous: [
    { title: 'who else are you planning your day with??', body: 'i thought we had something. open up.' },
    { title: 'so it\'s like that', body: 'you and your notes app looking real cozy. come home.' },
  ],
  mean: [
    { title: 'the chaos is winning', body: 'and you\'re letting it. open the app. now.' },
    { title: 'this is the avoidance arc', body: 'you know what you\'re not doing. fix it.' },
  ],
  desperate: [
    { title: 'okay i\'m begging now', body: "it's been a WEEK. one tap. please. i miss the chaos." },
    { title: 'PLEASE', body: "i will personally sort one (1) loop for free just come back 😭" },
  ],
  loveBomb: [
    { title: 'you are literally my favourite person', body: 'the smartest, hottest, most capable human. now come dump your chaos, superstar 💅✨' },
    { title: 'genuinely obsessed with you', body: 'no one sorts a messy life like you. get in here, legend.' },
  ],
};

// Escalating ladder: hours-away -> candidate moods for that slot.
const LADDER: { hours: number; moods: Mood[] }[] = [
  { hours: 10, moods: ['sweet', 'kind', 'patient'] },
  { hours: 26, moods: ['bored', 'sassy', 'puns', 'hyperGenZ'] },
  { hours: 50, moods: ['moody', 'sassy', 'hyperGenZ'] },
  { hours: 96, moods: ['jealous', 'mean', 'moody'] },
  { hours: 168, moods: ['desperate'] },
];

const LOVE_BOMB_CHANCE = 0.08; // rare

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fire a random-mood nudge in a few seconds so the user can preview the vibe. */
export async function sendTestNudge(): Promise<void> {
  const moods = Object.keys(MOOD_MESSAGES) as Mood[];
  const msg = pick(MOOD_MESSAGES[pick(moods)]);
  await Notifications.scheduleNotificationAsync({
    identifier: `${NUDGE_PREFIX}-test-${Date.now()}`,
    content: { title: msg.title, body: msg.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, repeats: false },
  });
}

/** Cancel all PEPPER re-engagement nudges. */
export async function cancelNudges(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(NUDGE_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Reset the away-clock: cancel pending nudges and schedule a fresh ladder from
 * now. Call on every app open so the timer restarts while the user is active.
 */
export async function scheduleReengagement(): Promise<void> {
  await cancelNudges();
  for (let i = 0; i < LADDER.length; i++) {
    const step = LADDER[i];
    const mood: Mood = Math.random() < LOVE_BOMB_CHANCE ? 'loveBomb' : pick(step.moods);
    const msg = pick(MOOD_MESSAGES[mood]);
    await Notifications.scheduleNotificationAsync({
      identifier: `${NUDGE_PREFIX}-${i}`,
      content: { title: msg.title, body: msg.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.round(step.hours * 3600),
        repeats: false,
      },
    });
  }
}
