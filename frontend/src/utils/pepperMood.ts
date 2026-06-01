// Daily-rotating PEPPER greetings. Seeded by date so it changes once per day.

interface PepperGreeting {
  mood: string; // small label shown above title, e.g. "* PEPPER IS FEELING FINE"
  greeting: (nickname?: string) => string; // big hero line
  vibe: string; // italic sub line
  accent: 'red' | 'lime' | 'lilac'; // color hint
}

const GREETINGS: PepperGreeting[] = [
  {
    mood: '* PEPPER IS OPTIMISTIC',
    greeting: (n) => (n ? `morning ${n.toLowerCase()}.` : 'morning.'),
    vibe: 'clean slate. let\'s not waste it.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS WATCHING',
    greeting: (n) => (n ? `hey ${n.toLowerCase()}.` : 'hey.'),
    vibe: 'show me the receipts of yesterday.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS A LIL TIRED',
    greeting: (n) => (n ? `back already, ${n.toLowerCase()}?` : 'back already?'),
    vibe: 'fine. let\'s sort it. slow today.',
    accent: 'lilac',
  },
  {
    mood: '* PEPPER IS SPICY',
    greeting: () => 'rise and grind?',
    vibe: 'don\'t make me cringe. let\'s go.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS UNBOTHERED',
    greeting: (n) => (n ? `you again, ${n.toLowerCase()}.` : 'you again.'),
    vibe: 'i kept your loops. tap one.',
    accent: 'lime',
  },
  {
    mood: '* PEPPER IS PROUD',
    greeting: () => 'look who\'s back.',
    vibe: 'momentum is a choice. pick three.',
    accent: 'lime',
  },
  {
    mood: '* PEPPER IS REGULATING',
    greeting: (n) => (n ? `breathe, ${n.toLowerCase()}.` : 'breathe.'),
    vibe: 'one thing at a time. soft today.',
    accent: 'lilac',
  },
  {
    mood: '* PEPPER IS DONE',
    greeting: () => 'oh you\'re here?',
    vibe: 'enough scrolling. give me the chaos.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS CURIOUS',
    greeting: (n) => (n ? `so, ${n.toLowerCase()}…` : 'so…'),
    vibe: 'what we ignoring today?',
    accent: 'lilac',
  },
  {
    mood: '* PEPPER IS PROTECTIVE',
    greeting: () => 'don\'t do anything dumb yet.',
    vibe: 'i\'ll tell you if it\'s a yes.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS SOFT',
    greeting: (n) => (n ? `hi ${n.toLowerCase()}.` : 'hi.'),
    vibe: 'gentle start. floor before fantasy.',
    accent: 'lilac',
  },
  {
    mood: '* PEPPER IS CHAOTIC GOOD',
    greeting: () => 'we\'re cooking today.',
    vibe: 'dump it. i\'ll plate it.',
    accent: 'lime',
  },
  {
    mood: '* PEPPER IS SUSPICIOUS',
    greeting: () => 'so… we doing it today?',
    vibe: 'the loop from tuesday is still open.',
    accent: 'red',
  },
  {
    mood: '* PEPPER IS PATIENT',
    greeting: () => 'no rush. yet.',
    vibe: 'start with one thing.',
    accent: 'lilac',
  },
];

/**
 * Returns a daily-rotating greeting from PEPPER. Same greeting all day,
 * changes at local midnight.
 */
export function getPepperGreeting(date: Date = new Date()): PepperGreeting {
  // Day-of-year as seed → rotates once per day, repeats yearly
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return GREETINGS[dayOfYear % GREETINGS.length];
}
