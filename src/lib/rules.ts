import type { Priority, WatchRule } from "./db";
import type { AIProvider, AIDoc, SemanticMatch } from "./ai";

export interface RuleHit {
  rule: WatchRule;
  priority: Priority;
  matched: string[]; // keywords that matched
  /** true when the hit came from the AI semantic pass (no literal keyword) */
  semantic?: boolean;
  /** AI one-sentence explanation of the semantic match (semantic hits only) */
  semanticSummary?: string;
  /** Topic the AI semantic match relates to (semantic hits only) */
  semanticTopic?: string;
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
    for (const { text } of texts) {
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

/** Priority ordering (lower = more urgent). */
const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, normal: 2 };

/**
 * Rule matching with an optional AI semantic second pass.
 *
 * Pass 1 (always): the deterministic keyword matcher — a literal hit wins
 * and is returned as-is, so AI can never veto or reorder a keyword match.
 * Pass 2 (only when pass 1 finds nothing and `ai?.enabled`): one
 * `semanticMatch` call per text blob against the union of candidate rule
 * keywords. On a match the highest-priority candidate rule is reported as
 * a semantic hit, carrying the AI's relevance classification (priority)
 * and a one-sentence summary of what matched. AI off / no reply / error →
 * null, i.e. behavior is exactly the keyword-only behavior of `findRuleHit`.
 *
 * `docs` (optional) carries the full content of the scanned text as a RAG
 * document: the AI semantic pass hands it to providers with built-in RAG
 * (Ollama ≥ 0.6.2) instead of a truncated in-prompt slice, so a
 * keyword/topic buried deep in a long README can still match.
 */
export async function findRuleHitSmart(
  rules: WatchRule[],
  sourceKind: string,
  texts: { kind: string; text: string }[],
  ai: AIProvider | null,
  docs?: AIDoc[]
): Promise<RuleHit | null> {
  const hit = findRuleHit(rules, sourceKind, texts);
  if (hit) return hit;
  if (!ai?.enabled) return null;

  const candidates = rules.filter(
    (r) => r.sources.includes(sourceKind) && r.keywords.length > 0
  );
  if (candidates.length === 0) return null;
  const keywords = [...new Set(candidates.flatMap((r) => r.keywords))];

  for (const { text } of texts) {
    if (!text) continue;
    let sm: SemanticMatch | null = null;
    try {
      // Long blobs ride the RAG document (if provided); short blobs (e.g.
      // just the added diff lines) stay fully in the prompt.
      sm = await ai.semanticMatch(
        text,
        keywords,
        docs && text.length > 2000 ? docs : undefined
      );
    } catch {
      // best-effort — treat as no match
    }
    if (!sm) continue;
    const best = [...candidates].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    )[0];
    return {
      rule: best,
      // The AI judges the relevance of the match itself; the candidate rule
      // is only used for bookkeeping. (Falls back to "normal" in the parser
      // when the model does not classify.)
      priority: sm.priority,
      matched: [],
      semantic: true,
      semanticSummary: sm.summary,
      semanticTopic: sm.topic,
    };
  }
  return null;
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

/**
 * Milestone releases get "high" priority even without notes. "1.0" is
 * bounded with (?<![.\d]) / (?![.\d]) on both sides — a plain \b would
 * ALSO match the "1.0" inside a version like "2.1.0" (the dot creates a
 * word boundary), false-flagging every x.1.0 release as a milestone.
 */
const STABLE_HINTS = /\b(stable|ga|general availability|major)\b|(?<![.\d])1\.0(?![.\d])/i;

export function looksLikeMilestoneRelease(title: string): boolean {
  return STABLE_HINTS.test(title);
}
