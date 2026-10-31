// Portal module types plus this browser's localStorage cache.
// Cloud reads/writes live in storeCloud.ts; the cache only makes the UI paint instantly.

import type { Role } from "@/lib/auth";

export type NewsType = "Announcement" | "Update" | "Reminder";

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  type: NewsType;
  postedAtIso: string;
};

export type SummitInfo = {
  title: string;
  subtitle: string;
  venue: string;
  dateLabel: string;
  notes: string;
};

export type MapLocation = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

export type MapInfo = {
  embedUrl: string;
  notes: string;
  locations?: MapLocation[];
};

// Sport is dynamic (admin-manageable). Stored as string.
export type Sport = string;

// One row of an event's award table. The order is the placement: the first tier
// is the champion, so a finished bracket can be paid out by position.
export type EventPlacement = {
  id: string;
  label: string;
  points: number;
};

export type EventItem = {
  id: string;
  name: string;
  placements: EventPlacement[];

  // Teams that played without placing (medallists collect their award only),
  // and teams that were registered without ever taking the court.
  entryPoints: number;
  noEntryPoints: number;
};

export type EventCategory = {
  id: string;
  name: string;
  events: EventItem[];
};

export function defaultPlacements(): EventPlacement[] {
  return [
    { id: nanoId(), label: "Champion", points: 20 },
    { id: nanoId(), label: "1st Runner-up", points: 15 },
    { id: nanoId(), label: "2nd Runner-up", points: 15 },
  ];
}

export function makeEvent(name: string): EventItem {
  return {
    id: nanoId(),
    name,
    placements: defaultPlacements(),
    entryPoints: 10,
    noEntryPoints: 0,
  };
}

function pointsOf(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Anything arriving from localStorage or Supabase is untrusted JSON, so every
// field is re-typed and blank rows are dropped rather than rendered.
export function normalizeEvents(raw: unknown): EventCategory[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((category: any) => ({
      id: String(category?.id ?? nanoId()),
      name: String(category?.name ?? "").trim(),
      events: Array.isArray(category?.events)
        ? category.events
            .map((event: any) => ({
              id: String(event?.id ?? nanoId()),
              name: String(event?.name ?? "").trim(),
              placements: Array.isArray(event?.placements)
                ? event.placements
                    .map((placement: any) => ({
                      id: String(placement?.id ?? nanoId()),
                      label: String(placement?.label ?? "").trim(),
                      points: pointsOf(placement?.points),
                    }))
                    .filter((placement: EventPlacement) => placement.label)
                : defaultPlacements(),
              entryPoints: pointsOf(event?.entryPoints),
              noEntryPoints: pointsOf(event?.noEntryPoints),
            }))
            .filter((event: EventItem) => event.name)
        : [],
    }))
    .filter((category: EventCategory) => category.name);
}

// Projects created before the catalogue existed only had a flat list of sports;
// those become events of a single "Sports" category so nothing is lost.
function eventsFromSports(sports: string[]): EventCategory[] {
  if (!sports.length) return [];
  return [{ id: nanoId(), name: "Sports", events: sports.map(makeEvent) }];
}

export function eventNamesOf(categories: EventCategory[]): Sport[] {
  const names: string[] = [];
  for (const category of categories) {
    for (const event of category.events) {
      if (!names.includes(event.name)) names.push(event.name);
    }
  }
  return names;
}

export function findEvent(categories: EventCategory[], name: string): EventItem | null {
  for (const category of categories) {
    const event = category.events.find((item) => item.name === name);
    if (event) return event;
  }
  return null;
}

export function categoryOfEvent(
  categories: EventCategory[],
  name: string,
): EventCategory | null {
  return categories.find((category) => category.events.some((event) => event.name === name)) ?? null;
}

export type Permissions = {
  settingsEditors: Role[];
  newsEditors: Role[];
  summitEditors: Role[];
  leaderboardEditors: Role[];
  bracketEditors: Role[];
  scheduleEditors: Role[];
  mapEditors: Role[];
};

export type Settings = {
  countdownIso: string;
  countdownClosed: boolean;
  permissions: Permissions;
  bracketAutoAdvance: boolean;

  // The admin-authored catalogue: a category (Sports, Academics, Special) holds
  // the events that can be played, and each event carries its own award table.
  events: EventCategory[];

  // Derived from `events` so brackets and the leaderboard can keep keying on a
  // single event-name string instead of a pair of ids.
  sports: Sport[];
};

export type EvaluationQuestion = {
  id: string;
  label: string;
};

// The form definition is authored by the admin. opensAtIso/closesAtIso are set
// in Settings and decide when everyone else may submit.
export type EvaluationForm = {
  title: string;
  description: string;
  opensAtIso: string;
  closesAtIso: string;
  questions: EvaluationQuestion[];
};

export type ScoreRow = {
  id: string;
  team: string;
  points: number;
  sport: Sport | "Overall";
};

export type MatchSchedulePost = {
  id: string;
  title: string;
  location: string;

  // What the admin typed, shown to viewers exactly as written — one hour
  // ("4:00 PM") or a whole day ("8:00 AM to 12:00 NN, then 1:00 PM to 5:00 PM").
  timeText: string;
  postedAtIso: string;

  // Visibility window in the viewer. Both are optional: an empty start means the
  // post is visible right away and an empty end means it stays until deleted, so
  // an admin can post all three event days at once and have each day appear on
  // its own.
  visibleFromIso: string;
  visibleToIso: string;
};

const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Rows posted before the time became free text carry an ISO stamp, and those are
// the only values converted back into a readable time.
export function scheduleTimeLabel(value: string): string {
  if (!ISO_STAMP.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// Optional bounds: missing start means visible now, missing end means it stays
// until the admin deletes it.
export function scheduleIsVisible(post: MatchSchedulePost, now = new Date()): boolean {
  const from = post.visibleFromIso ? new Date(post.visibleFromIso).getTime() : Number.NEGATIVE_INFINITY;
  const to = post.visibleToIso ? new Date(post.visibleToIso).getTime() : Number.POSITIVE_INFINITY;
  const time = now.getTime();

  return time >= from && time <= to;
}

export type MatchSide = {
  team: string | null;
  score: number | null;
};

export type Match = {
  id: string;
  a: MatchSide;
  b: MatchSide;
  winner: "a" | "b" | null;
};

export type BracketRound = {
  name: string;
  matches: Match[];
};

export type BracketFormat = "single" | "double";

export type Bracket = {
  id: string;
  sport: Sport;
  name: string;
  format: BracketFormat;
  teams: string[];
  rounds: BracketRound[];
  losersRounds?: BracketRound[];
  grandFinal?: Match;
};

export type Store = {
  settings: Settings;
  news: NewsItem[];
  schedule: MatchSchedulePost[];
  summit: SummitInfo;
  map: MapInfo;
  leaderboard: ScoreRow[];
  brackets: Bracket[];
  evaluation: EvaluationForm;
};

// Brackets and leaderboard rows name an event with a string, so editing the
// catalogue has to follow them: a renamed event carries its rows over and a
// deleted event takes its brackets and scores with it.
export function applyCatalogue(store: Store, events: EventCategory[]): Store {
  const nextNames = eventNamesOf(events);
  const living = new Set(nextNames);

  const oldNameById = new Map<string, string>();
  for (const category of store.settings.events) {
    for (const event of category.events) oldNameById.set(event.id, event.name);
  }

  const renamedFrom = new Map<string, string>();
  for (const category of events) {
    for (const event of category.events) {
      const previousName = oldNameById.get(event.id);
      if (previousName && previousName !== event.name) {
        renamedFrom.set(previousName, event.name);
      }
    }
  }

  const rekey = (name: string) => renamedFrom.get(name) ?? name;

  return {
    ...store,
    settings: { ...store.settings, events, sports: nextNames },

    brackets: store.brackets
      .map((bracket) => ({ ...bracket, sport: rekey(bracket.sport) }))
      .filter((bracket) => living.has(bracket.sport)),

    leaderboard: store.leaderboard
      .map((row) => (row.sport === "Overall" ? row : { ...row, sport: rekey(row.sport) }))
      .filter((row) => row.sport === "Overall" || living.has(row.sport)),
  };
}

const LS_KEY = "rcess.portal.store.v1";

export function nanoId(): string {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundName(matchCount: number) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semifinals";
  if (matchCount === 4) return "Quarterfinals";
  return `Round of ${matchCount * 2}`;
}

function losersRoundName(idx: number) {
  return `Losers Round ${idx + 1}`;
}

export function buildDoubleElimExtras(
  teams: string[],
): { losersRounds: BracketRound[]; grandFinal: Match } {
  const clean = teams.map((t) => t.trim()).filter(Boolean);
  const size = nextPow2(Math.max(2, clean.length));
  const roundsCount = Math.max(1, Math.log2(size));
  const losersRoundsCount = Math.max(0, 2 * (roundsCount - 1));

  const losersRounds: BracketRound[] = [];

  for (let l = 0; l < losersRoundsCount; l++) {
    const matchCount = Math.max(
      1,
      Math.floor(size / Math.pow(2, Math.floor(l / 2) + 2)),
    );

    losersRounds.push({
      name: losersRoundName(l),
      matches: Array.from({ length: matchCount }, () => ({
        id: nanoId(),
        a: { team: null, score: null },
        b: { team: null, score: null },
        winner: null,
      })),
    });
  }

  const grandFinal: Match = {
    id: nanoId(),
    a: { team: null, score: null },
    b: { team: null, score: null },
    winner: null,
  };

  return { losersRounds, grandFinal };
}

export function buildSingleElimRounds(teams: string[]): BracketRound[] {
  const clean = teams.map((t) => t.trim()).filter(Boolean);
  const size = nextPow2(Math.max(2, clean.length));
  const padded = clean.concat(
    Array.from({ length: size - clean.length }, () => ""),
  );

  const firstMatches: Match[] = [];

  for (let i = 0; i < size; i += 2) {
    const aTeam = padded[i] || null;
    const bTeam = padded[i + 1] || null;

    const m: Match = {
      id: nanoId(),
      a: { team: aTeam, score: null },
      b: { team: bTeam, score: null },
      winner: null,
    };

    if (aTeam && !bTeam) m.winner = "a";
    if (!aTeam && bTeam) m.winner = "b";

    firstMatches.push(m);
  }

  const rounds: BracketRound[] = [
    { name: roundName(firstMatches.length), matches: firstMatches },
  ];

  let matchCount = firstMatches.length;

  while (matchCount > 1) {
    matchCount = Math.floor(matchCount / 2);

    rounds.push({
      name: roundName(matchCount),
      matches: Array.from({ length: matchCount }, () => ({
        id: nanoId(),
        a: { team: null, score: null },
        b: { team: null, score: null },
        winner: null,
      })),
    });
  }

  propagateWinners(rounds);
  return rounds;
}

// What one bracket pays out: every team that reached a placement tier, the ones
// that played without medalling, and the ones that never took the court.
export type PayoutRow = { team: string; points: number; reason: string };

export type EventPayout = {
  event: string;
  category: string;
  brackets: string[];
  rows: PayoutRow[];
};

function contested(match: Match): boolean {
  return Boolean(match.a.team) && Boolean(match.b.team);
}

function hasDecision(match: Match): boolean {
  return match.winner === "a" || match.winner === "b";
}

function winnerOf(match: Match): string | null {
  return match.winner === "a" ? match.a.team : match.winner === "b" ? match.b.team : null;
}

function loserOf(match: Match): string | null {
  return match.winner === "a" ? match.b.team : match.winner === "b" ? match.a.team : null;
}

function bracketPayout(bracket: Bracket, event: EventItem): PayoutRow[] {
  const rows: PayoutRow[] = [];
  const placed = new Set<string>();

  // A team is paid for one placement only, the highest it reached.
  const awardPlacement = (team: string | null, tier: number) => {
    if (!team || placed.has(team)) return;
    const placement = event.placements[tier];
    if (!placement) return;
    placed.add(team);
    rows.push({ team, points: placement.points, reason: placement.label });
  };

  const allRounds = [...bracket.rounds, ...(bracket.losersRounds ?? [])];

  // Only the bracket's title match crowns anyone, so an unfinished final never
  // pays out the winner of an earlier round.
  const titleMatch =
    bracket.format === "double" && bracket.grandFinal
      ? bracket.grandFinal
      : bracket.rounds[bracket.rounds.length - 1]?.matches[0];
  const finalMatch = titleMatch && hasDecision(titleMatch) ? titleMatch : undefined;

  if (finalMatch) {
    awardPlacement(winnerOf(finalMatch), 0);
    awardPlacement(loserOf(finalMatch), 1);

    if (bracket.format === "double") {
      const losersRounds = bracket.losersRounds ?? [];
      const bronzeMatch = losersRounds[losersRounds.length - 1]?.matches.find(hasDecision);
      if (bronzeMatch) awardPlacement(winnerOf(bronzeMatch), 2);
    } else {
      const semifinals = bracket.rounds[bracket.rounds.length - 2];
      if (semifinals) {
        for (const match of semifinals.matches.filter(hasDecision)) {
          awardPlacement(loserOf(match), 2);
        }
      }
    }
  }

  const played = new Set<string>();
  for (const round of allRounds) {
    for (const match of round.matches) {
      if (!contested(match)) continue;
      if (match.a.team) played.add(match.a.team);
      if (match.b.team) played.add(match.b.team);
    }
  }

  // A placed team collects its award only; entry points are reserved for teams
  // that played without reaching a placement. Teams listed in the bracket that
  // never actually played take the no-entry score instead.
  const roster = [...bracket.teams];
  for (const team of played) if (!roster.includes(team)) roster.push(team);

  for (const team of roster) {
    const entered = played.has(team);
    if (entered && placed.has(team)) continue;
    const points = entered ? event.entryPoints : event.noEntryPoints;
    if (points) rows.push({ team, points, reason: entered ? "Entry" : "No entry" });
  }

  return rows.filter((row) => row.points !== 0);
}

// Two divisions of the same event (men's and women's) add up into one score.
export function payoutsForBrackets(store: Store): EventPayout[] {
  const grouped = new Map<string, EventPayout>();

  for (const bracket of store.brackets) {
    const event = findEvent(store.settings.events, bracket.sport);
    if (!event) continue;

    const payout = grouped.get(bracket.sport) ?? {
      event: bracket.sport,
      category: categoryOfEvent(store.settings.events, bracket.sport)?.name ?? "",
      brackets: [],
      rows: [],
    };

    payout.brackets.push(bracket.name);
    payout.rows = [...payout.rows, ...bracketPayout(bracket, event)];
    grouped.set(bracket.sport, payout);
  }

  return [...grouped.values()];
}

// The leaderboard after the payouts are applied: one row per team per event plus
// an Overall row that totals every event score. Manual rows for teams that did
// not appear in a bracket are left alone.
export function leaderboardWithPayouts(store: Store, payouts: EventPayout[]): ScoreRow[] {
  const totals = new Map<string, Map<string, number>>();

  for (const payout of payouts) {
    const perTeam = totals.get(payout.event) ?? new Map<string, number>();
    for (const row of payout.rows) {
      perTeam.set(row.team, (perTeam.get(row.team) ?? 0) + row.points);
    }
    totals.set(payout.event, perTeam);
  }

  const eventRows: ScoreRow[] = [];
  const overall = new Map<string, number>();

  for (const [event, perTeam] of totals) {
    for (const [team, points] of perTeam) {
      eventRows.push({ id: nanoId(), team, points, sport: event });
      overall.set(team, (overall.get(team) ?? 0) + points);
    }
  }

  // A derived score replaces the manual row for the same team and score view;
  // every other row the admin typed by hand survives.
  const kept = store.leaderboard.filter((row) => {
    const view = row.sport ?? "Overall";
    if (view === "Overall") return !overall.has(row.team);
    return !totals.has(view) || !totals.get(view)!.has(row.team);
  });

  const overallRows: ScoreRow[] = [...overall.entries()].map(([team, points]) => ({
    id: nanoId(),
    team,
    points,
    sport: "Overall",
  }));

  return [...kept, ...overallRows, ...eventRows];
}

export function determineWinnerAuto(m: Match): Match["winner"] {
  const a = m.a.score;
  const b = m.b.score;

  if (a == null || b == null) return null;
  if (a === b) return null;

  return a > b ? "a" : "b";
}

export function propagateWinners(
  rounds: BracketRound[],
  mode: "auto" | "manual" = "auto",
) {
  for (let r = 0; r < rounds.length - 1; r++) {
    const curr = rounds[r];
    const next = rounds[r + 1];

    for (const nm of next.matches) {
      nm.a.team = null;
      nm.b.team = null;
      nm.a.score = null;
      nm.b.score = null;
      nm.winner = null;
    }

    curr.matches.forEach((m, idx) => {
      if (mode === "auto") {
        m.winner = determineWinnerAuto(m);
      }

      const winnerTeam =
        m.winner === "a"
          ? m.a.team
          : m.winner === "b"
            ? m.b.team
            : null;

      const targetMatch = next.matches[Math.floor(idx / 2)];
      const slot = idx % 2 === 0 ? "a" : "b";

      (targetMatch as any)[slot].team = winnerTeam;

      if (slot === "b") {
        if (targetMatch.a.team && !targetMatch.b.team) {
          targetMatch.winner = "a";
        }

        if (!targetMatch.a.team && targetMatch.b.team) {
          targetMatch.winner = "b";
        }
      }
    });
  }
}

export function defaults(): Store {
  const events: EventCategory[] = [
    {
      id: nanoId(),
      name: "Sports",
      events: ["Basketball", "Volleyball", "Badminton", "Chess"].map(makeEvent),
    },
    { id: nanoId(), name: "Academics", events: [makeEvent("Quiz Bee")] },
    { id: nanoId(), name: "Special", events: [] },
  ];

  return {
    settings: {
      countdownIso: "2026-08-01T00:00:00+08:00",
      countdownClosed: false,
      permissions: {
        settingsEditors: ["admin"],
        newsEditors: ["admin"],
        summitEditors: ["admin"],
        leaderboardEditors: ["admin"],
        bracketEditors: ["admin"],
        scheduleEditors: ["admin"],
        mapEditors: ["admin"],
      },
      bracketAutoAdvance: true,
      events,
      sports: eventNamesOf(events),
    },

    news: [
      {
        id: nanoId(),
        title: "RCESS Portal is now live (Limited Access)",
        body: "Registration is limited for school representatives. Attendees can view the countdown and announcements.",
        type: "Announcement",
        postedAtIso: new Date().toISOString(),
      },
    ],

    schedule: [
      {
        id: nanoId(),
        title: "Team A vs Team B",
        location: "Main Court",
        timeText: "8:00 AM to 12:00 NN, then 1:00 PM to 5:00 PM",
        postedAtIso: new Date().toISOString(),
        visibleFromIso: "",
        visibleToIso: "",
      },
    ],

    summit: {
      title: "Regional Civil Engineering Students Summit",
      subtitle: "Summit Hub",
      venue: "Coming soon",
      dateLabel: "Coming soon",
      notes: "Replace placeholders with official details.",
    },

    map: {
      embedUrl: "",
      notes: "Paste a Google Maps embed URL here.",
    },

    leaderboard: [
      { id: nanoId(), team: "Team Alpha", points: 10, sport: "Overall" },
      { id: nanoId(), team: "Team Bravo", points: 8, sport: "Overall" },
      { id: nanoId(), team: "Team Charlie", points: 6, sport: "Overall" },
    ],

    brackets: [
      {
        id: nanoId(),
        sport: "Basketball",
        name: "Men's Division",
        format: "single",
        teams: ["Team A", "Team B", "Team C", "Team D"],
        rounds: buildSingleElimRounds([
          "Team A",
          "Team B",
          "Team C",
          "Team D",
        ]),
      },
    ],

    evaluation: {
      title: "Event Evaluation",
      description: "",
      opensAtIso: "",
      closesAtIso: "",
      questions: [],
    },
  };
}

// The catalogue wins over the flat list it replaced; a cache or cloud row that
// only knows sports gets them wrapped into one "Sports" category on the way in.
function catalogueOf(parsed: any): Pick<Settings, "events" | "sports"> {
  const rawEvents = Array.isArray(parsed?.settings?.events) ? parsed.settings.events : null;

  const legacySports: string[] = Array.isArray(parsed?.settings?.sports)
    ? parsed.settings.sports.map((s: any) => String(s)).filter(Boolean)
    : [];

  const events = rawEvents ? normalizeEvents(rawEvents) : eventsFromSports(legacySports);

  // A project whose settings row never carried sports would otherwise come up
  // with an empty catalogue and hide the brackets that are already stored, so
  // any event still referenced by a bracket or a score row is brought back.
  if (!events.length) {
    const referenced: string[] = [];
    for (const row of [
      ...(Array.isArray(parsed?.brackets) ? parsed.brackets : []),
      ...(Array.isArray(parsed?.leaderboard) ? parsed.leaderboard : []),
    ]) {
      const name = String(row?.sport ?? "");
      if (name && name !== "Overall" && !referenced.includes(name)) referenced.push(name);
    }
    return { events: eventsFromSports(referenced), sports: referenced };
  }

  return { events, sports: eventNamesOf(events) };
}

export function migrateStore(parsed: any): Store {
  const d = defaults();

  const next: Store = {
    ...d,
    ...parsed,

    settings: {
      ...d.settings,
      ...(parsed?.settings ?? {}),

      permissions: {
        ...d.settings.permissions,
        ...(parsed?.settings?.permissions ?? {}),

        settingsEditors: Array.isArray(
          parsed?.settings?.permissions?.settingsEditors,
        )
          ? parsed.settings.permissions.settingsEditors
          : d.settings.permissions.settingsEditors,

        newsEditors: Array.isArray(parsed?.settings?.permissions?.newsEditors)
          ? parsed.settings.permissions.newsEditors
          : d.settings.permissions.newsEditors,

        summitEditors: Array.isArray(parsed?.settings?.permissions?.summitEditors)
          ? parsed.settings.permissions.summitEditors
          : d.settings.permissions.summitEditors,

        leaderboardEditors: Array.isArray(
          parsed?.settings?.permissions?.leaderboardEditors,
        )
          ? parsed.settings.permissions.leaderboardEditors
          : d.settings.permissions.leaderboardEditors,

        bracketEditors: Array.isArray(
          parsed?.settings?.permissions?.bracketEditors,
        )
          ? parsed.settings.permissions.bracketEditors
          : d.settings.permissions.bracketEditors,

        scheduleEditors: Array.isArray(
          parsed?.settings?.permissions?.scheduleEditors,
        )
          ? parsed.settings.permissions.scheduleEditors
          : d.settings.permissions.scheduleEditors,

        mapEditors: Array.isArray(parsed?.settings?.permissions?.mapEditors)
          ? parsed.settings.permissions.mapEditors
          : d.settings.permissions.mapEditors,
      },

      bracketAutoAdvance:
        typeof parsed?.settings?.bracketAutoAdvance === "boolean"
          ? parsed.settings.bracketAutoAdvance
          : d.settings.bracketAutoAdvance,

      ...catalogueOf(parsed),
    },
    // A cache written by an older build can still hold snake_case news rows.
    // Fold them onto postedAtIso so the uploader always has a timestamp to send.
    news: Array.isArray(parsed?.news)
      ? parsed.news.map(({ posted_at_iso, ...item }: any) => ({
          ...item,
          postedAtIso: String(item.postedAtIso ?? posted_at_iso ?? new Date().toISOString()),
        }))
      : d.news,
    schedule: Array.isArray(parsed?.schedule)
      ? parsed.schedule.map(({ status, timeIso, sport, ...post }: any) => ({
          ...post,
          // Older posts stored a datetime value; it stays as-is and is rendered as
          // a time, while anything typed by an admin is rendered verbatim.
          timeText: String(post?.timeText ?? timeIso ?? ""),
          visibleFromIso: String(post?.visibleFromIso ?? ""),
          visibleToIso: String(post?.visibleToIso ?? ""),
        }))
      : d.schedule,

    summit: parsed?.summit
      ? { ...d.summit, ...parsed.summit }
      : d.summit,

    map: parsed?.map
      ? { ...d.map, ...parsed.map }
      : d.map,

    leaderboard: Array.isArray(parsed?.leaderboard)
      ? parsed.leaderboard.map((row: any) => ({
          id: String(row?.id ?? nanoId()),
          team: String(row?.team ?? "Team"),
          points: Number.isFinite(Number(row?.points)) ? Number(row.points) : 0,
          sport: String(row?.sport ?? "Overall"),
        }))
      : d.leaderboard,

    evaluation: {
      title: String(parsed?.evaluation?.title ?? d.evaluation.title),
      description: String(parsed?.evaluation?.description ?? ""),
      opensAtIso: String(parsed?.evaluation?.opensAtIso ?? ""),
      closesAtIso: String(parsed?.evaluation?.closesAtIso ?? ""),
      questions: Array.isArray(parsed?.evaluation?.questions)
        ? parsed.evaluation.questions
            .map((q: any) => ({
              id: String(q?.id ?? nanoId()),
              label: String(q?.label ?? "").trim(),
            }))
            .filter((q: any) => q.label)
        : d.evaluation.questions,
    },

    brackets: Array.isArray(parsed?.brackets) ? parsed.brackets : d.brackets,
  };

  next.brackets = next.brackets.map((b: any) => {
    const teams: string[] = Array.isArray(b?.teams)
      ? b.teams
      : Array.isArray(b?.entries)
        ? b.entries.map((e: any) => String(e?.team ?? "")).filter(Boolean)
        : [];

    const detectedFormat: any =
      b?.format ?? (Array.isArray(b?.losersRounds) ? "double" : "single");

    const format = detectedFormat === "double" ? "double" : "single";

    if (Array.isArray(b?.rounds) && Array.isArray(b?.teams)) {
      const base: Bracket = {
        ...(b as any),
        id: String(b?.id ?? nanoId()),
        sport: (b?.sport as Sport) ?? "Basketball",
        name: String(b?.name ?? "Bracket"),
        format,
        teams,
        rounds: b.rounds,
      };

      if (format === "double") {
        const extras = buildDoubleElimExtras(
          teams.length ? teams : ["Team A", "Team B"],
        );

        return {
          ...base,
          losersRounds: Array.isArray(b?.losersRounds)
            ? b.losersRounds
            : extras.losersRounds,
          grandFinal: b?.grandFinal ?? extras.grandFinal,
        };
      }

      return base;
    }

    const rounds = buildSingleElimRounds(
      teams.length ? teams : ["Team A", "Team B"],
    );

    const extras = buildDoubleElimExtras(
      teams.length ? teams : ["Team A", "Team B"],
    );

    return {
      id: String(b?.id ?? nanoId()),
      sport: (b?.sport as Sport) ?? "Basketball",
      name: String(b?.name ?? "Bracket"),
      format,
      teams,
      rounds,
      ...(format === "double"
        ? {
            losersRounds: extras.losersRounds,
            grandFinal: extras.grandFinal,
          }
        : {}),
    } satisfies Bracket;
  });

  return next;
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);

    if (!raw) {
      const d = defaults();
      localStorage.setItem(LS_KEY, JSON.stringify(d));
      return d;
    }

    const parsed = JSON.parse(raw);
    const migrated = migrateStore(parsed);

    localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const d = defaults();
    localStorage.setItem(LS_KEY, JSON.stringify(d));
    return d;
  }
}

export function saveStore(next: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}
