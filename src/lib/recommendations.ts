/**
 * Lightweight recommendation engine for service opportunities.
 * Scores opportunities by recency, hours fit, and keyword overlap with the volunteer profile.
 */

export type OpportunityLike = {
  id: string;
  title?: string;
  description?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  possibleHours?: number;
  maxHours?: number;
  link?: string;
};

function opportunityStart(opp: OpportunityLike): string | undefined {
  return opp.date || opp.startDate;
}

function opportunityHours(opp: OpportunityLike): number {
  const n = Number(opp.possibleHours ?? opp.maxHours);
  return Number.isFinite(n) ? n : 0;
}

export type VolunteerProfileLike = {
  grade?: string;
  interestsText?: string; // free-text from recent activity descriptions
};

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

export function scoreOpportunity(
  opp: OpportunityLike,
  profile: VolunteerProfileLike,
  now = new Date()
): number {
  let score = 0;
  const start = parseDate(opportunityStart(opp));
  const end = parseDate(opp.endDate) ?? start;

  // Prefer upcoming opportunities; soft-penalize far-past items
  if (start) {
    const days = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0 && days <= 30) score += 40;
    else if (days > 30 && days <= 90) score += 25;
    else if (days < 0 && end && end >= now) score += 30; // ongoing
    else if (days < 0) score += 5;
  } else {
    score += 10;
  }

  const hours = opportunityHours(opp);
  if (hours >= 1 && hours <= 4) score += 15;
  else if (hours > 4) score += 8;

  const bag = tokenize(`${opp.title ?? ""} ${opp.description ?? ""}`);
  const interest = tokenize(profile.interestsText ?? "");
  let overlap = 0;
  interest.forEach((w) => {
    if (bag.has(w)) overlap += 1;
  });
  score += Math.min(25, overlap * 5);

  if (profile.grade && bag.has(profile.grade.toLowerCase())) score += 5;

  return score;
}

export function recommendOpportunities(
  opportunities: OpportunityLike[],
  profile: VolunteerProfileLike,
  limit = 3
): OpportunityLike[] {
  const now = new Date();
  return [...opportunities]
    .map((o) => ({ o, s: scoreOpportunity(o, profile, now) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.o);
}

export type OpportunityFilters = {
  query: string;
  timeframe: "all" | "upcoming" | "past";
  minHours: string;
  maxHours: string;
};

export function filterOpportunities(
  opportunities: OpportunityLike[],
  filters: OpportunityFilters,
  now = new Date()
): OpportunityLike[] {
  const q = filters.query.trim().toLowerCase();
  const minH = filters.minHours === "" ? null : Number(filters.minHours);
  const maxH = filters.maxHours === "" ? null : Number(filters.maxHours);

  return opportunities.filter((o) => {
    const start = parseDate(opportunityStart(o));
    const end = parseDate(o.endDate) ?? start;
    const isPast = !!(end && end < now);
    const isUpcoming = !isPast;

    if (filters.timeframe === "upcoming" && !isUpcoming) return false;
    if (filters.timeframe === "past" && !isPast) return false;

    const hours = opportunityHours(o);
    if (minH !== null && Number.isFinite(minH) && hours < minH) return false;
    if (maxH !== null && Number.isFinite(maxH) && hours > maxH) return false;

    if (!q) return true;
    const hay = `${o.title ?? ""} ${o.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}
