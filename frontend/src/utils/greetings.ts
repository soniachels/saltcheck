// Daily rotating PEPPER greeting — picks one based on day-of-year so
// it's deterministic per day but feels alive when you open the app.

interface Greeting {
  title: string;
  sub: string;
}

const GREETINGS: Greeting[] = [
  { title: "hey.", sub: "clean slate. let's not waste it." },
  { title: "morning, troublemaker.", sub: "what's the actual move today." },
  { title: "you again?", sub: "fine. let's sort it." },
  { title: "ok let's go.", sub: "no fake-urgent today." },
  { title: "i'm here.", sub: "what's the first sane move." },
  { title: "we move.", sub: "small. specific. now." },
  { title: "deep breath.", sub: "then ONE thing. just one." },
  { title: "salt's on.", sub: "let me see the chaos." },
  { title: "be so for real.", sub: "what actually matters today." },
  { title: "the kitchen's open.", sub: "drop the dump. i'll plate it." },
  { title: "stop scrolling.", sub: "you have a life to run." },
  { title: "girl please.", sub: "we are not doing this again today." },
  { title: "ready when you are.", sub: "or now. now is fine." },
  { title: "your floor first.", sub: "feelings later. tasks now." },
  { title: "no diagnosing today.", sub: "just doing." },
  { title: "snack first?", sub: "then we sort." },
  { title: "log one thing.", sub: "watch the chaos shrink." },
  { title: "lock in.", sub: "you've done harder days." },
  { title: "let's pepper this.", sub: "spice level: you decide." },
  { title: "what's the vibe.", sub: "we shape it from there." },
  { title: "open the tabs.", sub: "we're closing three." },
  { title: "alright soldier.", sub: "boots on. no inspirational quotes." },
  { title: "we don't doom today.", sub: "we don't scroll today." },
  { title: "no plan? cool.", sub: "we make one in ninety seconds." },
  { title: "you're up.", sub: "i'm a tap away." },
];

export function getDailyGreeting(personalize?: string): Greeting {
  // day-of-year as seed
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const dayOfYear = Math.floor(diff);
  const base = GREETINGS[dayOfYear % GREETINGS.length];
  if (personalize) {
    // Inject nickname into a few greetings naturally
    const replaced = base.title.replace(/\bhey\b/i, `hey ${personalize.toLowerCase()}`);
    return { title: replaced, sub: base.sub };
  }
  return base;
}
