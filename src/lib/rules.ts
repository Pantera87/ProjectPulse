import type { Priority, WatchRule } from "./db";

export interface RuleHit {
  rule: WatchRule;
  priority: Priority;
  matched: string[]; // keywords that matched
}

function wordBoundary(kw: string): RegExp {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i");
}

/**
 * Match a rule against a text blob. Word-boundary, case-insensitive.
 * Negated keywords veto the match.
 */
export function ruleMatchesText(rule: WatchRule, text: string): string[] {
  if (!text) return [];
  const matched: string[] = [];
  for (const kw of rule.keywords) {
    if (wordBoundary(kw).test(text)) matched.push(kw);
  }
  if (matched.length === 0) return [];
  if (rule.negate?.length) {
    for (const neg of rule.negate) {
      if (wordBoundary(neg).test(text)) return [];
    }
  }
  return matched;
}

/**
 * Find the highest-priority rule hit across all rules whose `sources`
 * include `sourceKind`.
 */
export function findRuleHit(
  rules: WatchRule[],
  sourceKind: string,
  texts: { kind: string; text: string }[]
): RuleHit | null {
  const order: Record<Priority, number> = { critical: 0, high: 1, normal: 2 };
  let best: RuleHit | null = null;
  for (const rule of rules) {
    if (!rule.sources.includes(sourceKind)) continue;
    for (const { kind, text } of texts) {
      const matched = ruleMatchesText(rule, text);
      if (matched.length > 0) {
        const hit: RuleHit = { rule, priority: rule.priority, matched };
        if (!best || order[hit.priority] < order[best.priority]) best = hit;
        break;
      }
    }
  }
  return best;
}

/** Semver helpers for release-priority heuristics. */
export function parseSemver(tag: string): { major: number; minor: number; patch: number } | null {
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function isMajorBump(prev: string | undefined, next: string): boolean {
  if (!prev) return false;
  const a = parseSemver(prev);
  const b = parseSemver(next);
  if (!a || !b) return false;
  return b.major > a.major;
}

const STABLE_HINTS = /\b(stable|ga|1\.0|general availability|major)\b/i;

export function looksLikeMilestoneRelease(title: string): boolean {
  return STABLE_HINTS.test(title);
}
