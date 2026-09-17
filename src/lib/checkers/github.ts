import type Database from "better-sqlite3";
import type { SourceRow } from "../db";
import { github, parseGithubRef, type GhCommit, type GhRelease } from "../github";
import {
  findRuleHitSmart,
  isMajorBump,
  looksLikeMilestoneRelease,
} from "../rules";
import { getAI } from "../ai";
import {
  insertUpdate,
  indexForSearch,
  rulesOf,
  stateOf,
  touchSource,
} from "../models";
import { markdownSectionAnchor, truncate } from "../text";
import { notify } from "../notifiers";
import { captureScreenshot, downloadFile, fileIsStale } from "../screenshots";
import type { CheckResult } from "./website";

const pushCap = <T,>(arr: T[], item: T, cap: number): T[] =>
  [...arr, item].slice(-cap);

export async function checkGithub(
  d: Database.Database,
  source: SourceRow
): Promise<CheckResult> {
  const ref = parseGithubRef(source.url);
  if (!ref)
    return {
      ok: false,
      changed: false,
      updatesCreated: 0,
      error: "Invalid GitHub reference",
    };
  const [owner, repo] = ref;
  const state = stateOf(source);
  const rules = rulesOf(source);
  const firstRun = state.seen_tags === undefined;
  const seenTags: string[] = state.seen_tags ?? [];
  let updatesCreated = 0;

  const emit = (
    priority: "critical" | "high" | "normal",
    kind: "release" | "milestone" | "issue" | "keyword",
    title: string,
    summary: string | null,
    url: string,
    payload: unknown
  ) => {
    const id = insertUpdate(d, {
      source_id: source.id,
      priority,
      kind,
      title: truncate(title, 300),
      summary: summary ? truncate(summary, 1000) : null,
      url,
      payload,
    });
    updatesCreated++;
    void notify({
      id,
      title: truncate(title, 300),
      summary: summary ? truncate(summary, 300) : null,
      url,
      priority,
      kind,
      sourceName: source.name || `${owner}/${repo}`,
      sourceUrl: `https://github.com/${owner}/${repo}`,
    });
  };

  try {
    // --- Repo meta: goal backfill ---
    const meta = await github.repo(owner, repo);
    if (!source.goal && meta.description)
      touchSource(d, source.id, {
        goal: truncate(meta.description, 500),
        name: source.name || meta.full_name,
      });
    if (meta.archived)
      touchSource(d, source.id, {
        name: `${source.name || meta.full_name} [archived]`,
      });

    // --- Project logo (repo avatar) + visual screenshot of the repo page ---
    const logoRel = `logos/${source.id}.png`;
    if (await downloadFile(meta.owner.avatar_url, logoRel)) {
      touchSource(d, source.id, { logo: logoRel });
    }
    const shotRel = `screenshots/github-${source.id}.png`;
    if (fileIsStale(shotRel, 30)) {
      await captureScreenshot(`https://github.com/${owner}/${repo}`, shotRel, {
        github: true,
      });
    }

    // --- Releases ---
    const releases = await github.releases(owner, repo);
    if (firstRun) {
      // First check: silently record existing tags as the baseline
      for (const r of releases) seenTags.push(r.tag_name);
      state.prev_tag = releases[releases.length - 1]?.tag_name;
    } else {
      const newReleases: GhRelease[] = [];
      for (const r of releases) {
        if (!seenTags.includes(r.tag_name)) newReleases.push(r);
      }
      // oldest first for prev_tag ordering
      newReleases.sort((a, b) =>
        a.published_at.localeCompare(b.published_at)
      );
      for (const r of newReleases) {
        const hit = await findRuleHitSmart(
          rules,
          "releases",
          [{ kind: "releases", text: `${r.name ?? ""} ${r.body ?? ""}` }],
          getAI()
        );
        let priority: "critical" | "high" | "normal" = "normal";
        if (hit) priority = hit.priority;
        else if (
          isMajorBump(state.prev_tag, r.tag_name) ||
          looksLikeMilestoneRelease(r.name ?? r.tag_name)
        )
          priority = "high";
        emit(
          priority,
          hit ? "keyword" : "release",
          hit
            ? hit.semantic
              ? hit.semanticTopic
                ? `Topic match in release ${r.tag_name}: ${hit.semanticTopic}`
                : `AI topic match in release ${r.tag_name}`
              : `Keyword "${hit.matched.join(", ")}" in release ${r.tag_name}`
            : `Release ${r.tag_name}${r.prerelease ? " (pre-release)" : ""}`,
          hit?.semantic && hit.semanticSummary ? hit.semanticSummary : r.body ?? r.name ?? null,
          r.html_url,
          {
            tag: r.tag_name,
            prerelease: r.prerelease,
            semantic: !!hit?.semantic,
            semanticTopic: hit?.semanticTopic ?? null,
            semanticSummary: hit?.semanticSummary ?? null,
          }
        );
        seenTags.push(r.tag_name);
        state.prev_tag = r.tag_name;
      }
    }
    state.seen_tags = pushCap(seenTags, "", 200).filter(Boolean);

    // --- Milestones (big project moments) ---
    const milestones = await github.milestones(owner, repo);
    const known: Record<string, boolean> = state.seen_milestones ?? {};
    if (firstRun) {
      for (const m of milestones) known[String(m.id)] = m.state === "open";
    } else {
      for (const m of milestones) {
        const key = String(m.id);
        const wasOpen = known[key];
        const isOpen = m.state === "open";
        if (wasOpen === undefined) {
          emit(
            "high",
            "milestone",
            `New milestone: ${m.title}`,
            `${m.open_issues} open issue(s)` +
              (m.due_on ? `, due ${m.due_on}` : ""),
            m.html_url,
            { milestone: m.title, state: m.state }
          );
        } else if (wasOpen && !isOpen) {
          emit(
            "high",
            "milestone",
            `Milestone completed: ${m.title}`,
            `${m.closed_issues} issue(s) closed`,
            m.html_url,
            { milestone: m.title, state: m.state }
          );
        }
        known[key] = isOpen;
      }
    }
    state.seen_milestones = known;

    // --- Issue/PR label watching ---
    const labelRules = rules.filter((r) => r.labels?.length);
    if (labelRules.length > 0) {
      const labelSet = [
        ...new Set(labelRules.flatMap((r) => r.labels!)),
      ].join(",");
      const issues = await github.issues(owner, repo, labelSet);
      const seenIssues: string[] = state.seen_issues ?? [];
      if (firstRun) {
        for (const i of issues) seenIssues.push(String(i.number));
      } else {
        for (const i of issues) {
          if (seenIssues.includes(String(i.number))) continue;
          const lbl = i.labels.map((l) => l.name)[0] ?? "";
          const rule = labelRules.find((r) =>
            r.labels?.some((l) => l.toLowerCase() === lbl.toLowerCase())
          );
          emit(
            rule ? rule.priority : "normal",
            "issue",
            `Labeled "${lbl}": ${i.title}`,
            i.html_url,
            i.html_url,
            { label: lbl, number: i.number }
          );
          seenIssues.push(String(i.number));
        }
      }
      state.seen_issues = pushCap(seenIssues, "", 300).filter(Boolean);
    }

    // --- Keyword scans: README + recent commits (state-change detection) ---
    for (const scan of (["readme", "commits"] as const)) {
      let text = "";
      // Where a match links to (instead of the repo root): the README blob
      // URL for README hits, the individual commits for commit hits.
      let readmeUrl: string | null = null;
      let commits: GhCommit[] = [];
      if (scan === "readme") {
        const info = await github.readmeInfo(owner, repo);
        text = info?.text ?? "";
        readmeUrl = info?.htmlUrl ?? null;
      } else {
        commits = await github.commits(owner, repo, 30);
        text = commits.map((c) => c.commit.message).join("\n");
      }
      for (const rule of rules) {
        if (!rule.sources.includes(scan)) continue;
        // Keyword pass first; the AI semantic second pass only runs when the
        // keyword pass found nothing. The state-change bookkeeping below
        // dedupes repeated matches across checks for both kinds of hits.
        const hit = await findRuleHitSmart(
          [rule],
          scan,
          [{ kind: scan, text }],
          getAI(),
          // The README can be much longer than a prompt slice — hand the
          // full text to RAG-capable providers; commit messages stay in-prompt.
          scan === "readme" && text ? [{ name: "readme.md", content: text }] : undefined
        );
        const key = `${scan}:${rule.id}`;
        const previouslyMatched = state.readme_matched?.[key] === true;
        if (hit && !previouslyMatched) {
          // Link the update directly to where the match lives:
          //  - README: the README file itself, with a best-effort anchor
          //    to the section containing the matched keyword;
          //  - commits: the (newest) commit whose message contains one of
          //    the matched keywords — semantic hits have no literal keyword,
          //    so they link to the repo's commit list instead.
          let url = `https://github.com/${owner}/${repo}`;
          let commitSha: string | null = null;
          if (scan === "readme") {
            if (readmeUrl) {
              url = readmeUrl;
              if (!hit.semantic && hit.matched.length > 0) {
                const anchor = markdownSectionAnchor(text, hit.matched[0]);
                if (anchor) url = `${readmeUrl}#${anchor}`;
              }
            }
          } else {
            url = `https://github.com/${owner}/${repo}/commits`;
            if (!hit.semantic && hit.matched.length > 0) {
              const found = commits.find((c) =>
                hit.matched.some((kw) =>
                  /^[a-z0-9]+$/i.test(kw)
                    ? new RegExp(`\\b${kw}\\b`, "i").test(c.commit.message)
                    : c.commit.message.toLowerCase().includes(kw.toLowerCase())
                )
              );
              if (found) {
                url = found.html_url;
                commitSha = found.sha;
              }
            }
          }
          emit(
            hit.priority,
            "keyword",
            hit.semantic
              ? hit.semanticTopic
                ? `Topic match in ${scan}: ${hit.semanticTopic}`
                : `AI topic match now present in ${scan}`
              : `Keyword "${hit.matched.join(", ")}" now present in ${scan}`,
            hit.semanticSummary ?? null,
            url,
            {
              scan,
              keywords: hit.matched,
              semantic: !!hit.semantic,
              semanticTopic: hit.semanticTopic ?? null,
              semanticSummary: hit.semanticSummary ?? null,
              commitSha,
            }
          );
        }
        if (state.readme_matched)
          state.readme_matched[key] = hit !== null;
        else state.readme_matched = { [key]: hit !== null };
      }
    }

    touchSource(d, source.id, {
      last_checked_at: new Date().toISOString(),
      state_json: JSON.stringify(state),
      last_error: null,
    });
    indexForSearch(
      d,
      "source",
      source.id,
      source.name || `${owner}/${repo}`,
      `${source.goal ?? ""} ${meta.topics.join(" ")}`
    );
    return { ok: true, changed: updatesCreated > 0, updatesCreated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    touchSource(d, source.id, {
      last_checked_at: new Date().toISOString(),
      last_error: msg,
    });
    return { ok: false, changed: false, updatesCreated, error: msg };
  }
}
