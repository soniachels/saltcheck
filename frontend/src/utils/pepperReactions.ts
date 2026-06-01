// Client-side PEPPER reactions — no extra LLM calls.
// Returns a short, witty one-liner based on user action.

const FIRST_DONE = [
  "one down. don't stop now.",
  "look at us actually doing things.",
  "first move locked in. keep cooking.",
  "ok ok. momentum.",
  "noted. two more to go.",
];

const SECOND_DONE = [
  "two down. you're scaring me (good way).",
  "wait. you're actually serious today.",
  "one more and you've earned a sit-down.",
  "the math is mathing.",
  "halfway? past halfway. obsessed.",
];

const ALL_DONE = [
  "TOP 3 DONE. now go drink water and log off.",
  "all three. on a school night. who are you.",
  "everything closed. permission to nap granted.",
  "this is what we like to see. go be smug.",
  "salt check passed. spice level: elite.",
];

const UNCHECKED = [
  "fine. taking that one back. no judgment.",
  "unchecking? ok. life happens.",
  "we'll get it next round.",
  "fair. nobody's perfect.",
];

const LOOP_DONE = [
  'loop closed. clean kitchen energy.',
  'one less thing in your brain. you\'re welcome.',
  'shipped it. exhale.',
  'consider that loop sealed.',
];

const LOOP_OVERDUE_NUDGES = [
  'this was due yesterday. did you do it or are we pretending?',
  'still open. still watching.',
  'the deadline came and went. give me a verdict.',
  'either close this loop or move the date. pick one.',
];

const LOOP_DUE_TODAY = [
  'due today. let\'s not be cute about it.',
  'today\'s the day. did you do it?',
  'deadline is today. talk to me.',
];

function pick<T>(arr: T[], seed?: number): T {
  if (seed == null) return arr[Math.floor(Math.random() * arr.length)];
  return arr[seed % arr.length];
}

export function priorityReaction(args: {
  newlyDone: boolean;
  totalDone: number;
  totalPriorities: number;
}): string {
  if (!args.newlyDone) {
    return pick(UNCHECKED);
  }
  if (args.totalDone >= args.totalPriorities && args.totalPriorities > 0) {
    return pick(ALL_DONE);
  }
  if (args.totalDone === 2) return pick(SECOND_DONE);
  return pick(FIRST_DONE);
}

export function loopDoneReaction(): string {
  return pick(LOOP_DONE);
}

export function loopOverdueNudge(seed?: number): string {
  return pick(LOOP_OVERDUE_NUDGES, seed);
}

export function loopDueTodayNudge(seed?: number): string {
  return pick(LOOP_DUE_TODAY, seed);
}
