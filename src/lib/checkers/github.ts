import type Database from "better-sqlite3";
import { createPatch } from "diff";
import type { SourceRow, Priority } from "../db";
import {
  github,
  parseGithubRef,
  type GhCommit,
  type GhMilestone,
  type GhRelease,
} from "../github";
import {
  findRuleHitSmart,
  isMajorBump,
  looksLikeMilestoneRelease,
} from "../rules";
import { getAI } from "../ai";
import {
  insertUpdate,
  indexForSearch,
  maxSnapshotVersion,
  pruneSnapshots,
  rulesOf,
  snapshotMode,
  stateOf,
  touchSource,
  higherPriority,
} from "../models";
import { markdownSectionAnchor, truncate, hashText, parseHtml, normalizeForHash, compressHtml, moveReadmeToTop } from "../text";
import { fetchText, downloadFile } from "../http";
import { archivePageHtml } from "../archive";
import { notify } from "../notifiers";
import type { CheckResult } from "./website";

const pushCap = <T,>(arr: T[], item: T, cap: number): T[] =>
  [...arr, item].slice(-cap);

/**
 * No-AI fallback for release notes: pull out the salient lines (bullet
 * lines first, otherwise plain non-empty lines) and join them into a single
 * readable line — the raw multi-line notes would be a wall of text in a
 * notification message.
 */
function salientNotesLines(notes: string, fallback: string, cap = 4): string {
  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, ""));
  return (bullets.length ? bullets : lines).slice(0, cap).join(" · ") || fallback;
}

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
    kind: "release" | "milestone" | "issue" | "keyword" | "readme" | "commit",
    title: string,
    summary: string | null,
    url: string,
    payload: unknown,
    /** Untruncated summary for the webhook (defaults to `summary`). */
    fullSummary?: string | null
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
    // The stored name may be the auto-filled "owner/repo" full name —
    // notifications/webhooks should only carry the project name
    // (e.g. "ProjectPulse", not "owner/ProjectPulse").
    const sourceNameRaw = source.name || repo;
    const sourceName = sourceNameRaw.startsWith(`${owner}/`)
      ? sourceNameRaw.slice(owner.length + 1)
      : sourceNameRaw;
    void notify({
      id,
      title: truncate(title, 300),
      summary: summary ? truncate(summary, 300) : null,
      fullSummary: fullSummary ?? summary,
      url,
      priority,
      kind,
      sourceName,
      sourceUrl: `https://github.com/${owner}/${repo}`,
    });
  };

  // --- Keywordless change tracking (per-source UI toggles, independent of
  // keyword rules) ---
  const trackReleases = (source.track_releases ?? 1) !== 0;
  const trackReadme = source.track_readme === 1;
  const trackCommits = source.track_commits === 1;
  const rulesTarget = (k: string) => rules.some((r) => r.sources.includes(k));
  const watchReadme = trackReadme || rulesTarget("readme");
  const watchCommits = trackCommits || rulesTarget("commits");
  const watchIssues = rules.some((r) => (r.labels ?? []).length > 0);

  const processMilestones = async (milestones: GhMilestone[]) => {
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
  };

  // --- Cheap pre-check: the releases Atom feed is a plain endpoint OUTSIDE
  // the GitHub API rate limit, so every cycle can ask "did anything
  // release-related happen?" for free. When the feed is unchanged and no
  // other watch target (README / commits / issue labels) is active, only
  // milestones are fetched from the API instead of the full check.
  let feedUnchanged = false;
  if (!firstRun) {
    try {
      const xml = await fetchText(
        `https://github.com/${owner}/${repo}/releases.atom`,
        {
          timeoutMs: 15_000,
          maxBytes: 500_000,
          headers: { accept: "application/atom+xml, application/xml, */*" },
        }
      );
      const h = hashText(xml);
      feedUnchanged =
        state.prev_release_feed_hash === h && state.release_feed_status !== "missing";
      state.prev_release_feed_hash = h;
      state.release_feed_status = "ok";
    } catch (e) {
      // Repos without releases get a 404 — that is a stable state too, so
      // two consecutive 404s count as "unchanged".
      const is404 = e instanceof Error && e.message.includes("404");
      feedUnchanged = is404 && state.release_feed_status === "missing";
      if (is404) state.release_feed_status = "missing";
    }
  }

  // Goal backfill (repo description) — fetched up front so it also runs on
  // the idle path below; a goal the user cleared is restored on the next
  // check.
  if (!source.goal) {
    try {
      const m = await github.repo(owner, repo);
      if (m.description)
        touchSource(d, source.id, {
          goal: truncate(m.description, 500),
          goal_source: "auto", // the repo description — not AI-generated
          name: source.name || m.full_name,
        });
    } catch {
      // best-effort — the full check below retries
    }
  }

  if (feedUnchanged && !watchReadme && !watchCommits && !watchIssues) {
    // Idle cycle: no new releases and nothing else to watch — milestones
    // (always tracked) are the only API call.
    try {
      await processMilestones(await github.milestones(owner, repo));
      touchSource(d, source.id, {
        last_checked_at: new Date().toISOString(),
        state_json: JSON.stringify(state),
        last_error: null,
      });
      return { ok: true, changed: updatesCreated > 0, updatesCreated };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      touchSource(d, source.id, {
        last_checked_at: new Date().toISOString(),
        state_json: JSON.stringify(state),
        last_error: msg,
      });
      return { ok: false, changed: false, updatesCreated, error: msg };
    }
  }

  try {
    // --- Repo meta ---
    const meta = await github.repo(owner, repo);
    if (meta.archived)
      touchSource(d, source.id, {
        name: `${source.name || meta.full_name} [archived]`,
      });

    // --- Project logo (repo avatar) ---
    const logoRel = `logos/${source.id}.png`;
    if (await downloadFile(meta.owner.avatar_url, logoRel)) {
      touchSource(d, source.id, { logo: logoRel });
    }

    // --- Offline snapshot of the repo page (versioned, hash-gated) ---
    // The page is stored with the README moved to the top, so the snapshot
    // viewer starts at the beginning of the README.
    try {
      const pageUrl = `https://github.com/${owner}/${repo}`;
      const pageHtml = moveReadmeToTop(await fetchText(pageUrl, { timeoutMs: 60_000 }));
      const pageHash = hashText(normalizeForHash(parseHtml(pageHtml).text));
      const mode = snapshotMode(d);
      // Also re-store when no snapshot row is left (e.g. the user deleted
      // them all), even if the page hash is unchanged.
      if (
        state.page_hash === undefined ||
        state.page_hash !== pageHash ||
        maxSnapshotVersion(d, source.id) === 0
      ) {
        const version = maxSnapshotVersion(d, source.id) + 1;
        let htmlLocal: string | null = null;
        if (mode === "full") {
          try {
            htmlLocal = await archivePageHtml(pageHtml, pageUrl, source.id, version);
          } catch {
            htmlLocal = null;
          }
        }
        d.prepare(
          `INSERT INTO snapshots (source_id, version, fetched_at, html, content_hash, title, html_local)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          source.id,
          version,
          new Date().toISOString(),
          compressHtml(pageHtml),
          pageHash,
          meta.full_name,
          htmlLocal ? compressHtml(htmlLocal) : null
        );
        pruneSnapshots(d, source.id);
      }
      state.page_hash = pageHash;
    } catch (e) {
      console.error(
        "[github] repo page snapshot failed:",
        e instanceof Error ? e.message : e
      );
    }

    // --- Releases ---
    const releases = await github.releases(owner, repo);
    if (firstRun) {
      // First check: silently record existing tags as the baseline.
      // GitHub returns releases newest-first — baseline the bump
      // comparison against the NEWEST existing release (steady state keeps
      // prev_tag = newest processed release after each check).
      for (const r of releases) seenTags.push(r.tag_name);
      state.prev_tag = releases[0]?.tag_name;
    } else {
      const newReleases: GhRelease[] = [];
      for (const r of releases) {
        if (!seenTags.includes(r.tag_name)) newReleases.push(r);
      }
      // oldest first for prev_tag ordering
      newReleases.sort((a, b) =>
        a.published_at.localeCompare(b.published_at)
      );
      const watchReleases = trackReleases || rulesTarget("releases");
      for (const r of newReleases) {
        const hit = watchReleases
          ? await findRuleHitSmart(
              rules,
              "releases",
              [{ kind: "releases", text: `${r.name ?? ""} ${r.body ?? ""}` }],
              getAI()
            )
          : null;
        // Capture the previous tag BEFORE overwriting state.prev_tag — the
        // major-bump comparison must be against the release that came
        // before, not the tag itself (comparing the tag with itself made
        // the "high" priority below unreachable).
        const prevTag = state.prev_tag;
        seenTags.push(r.tag_name);
        state.prev_tag = r.tag_name;
        // "Track changes: new releases" off AND no keyword hit → the tag is
        // recorded as seen but produces no update.
        if (!trackReleases && !hit) continue;
        let priority: Priority = "normal";
        if (hit) priority = hit.priority;
        else if (isMajorBump(prevTag, r.tag_name) || looksLikeMilestoneRelease(r.name ?? r.tag_name))
          priority = "high";
        // Optional AI summary + importance classification of the release
        // notes (skipped when a semantic rule match already summarized it).
        // Without AI, the raw multi-line notes are reduced to their salient
        // lines so the update stays a readable message, not a wall of text.
        const rawNotes = [r.name ?? "", r.body ?? ""].filter(Boolean).join("\n");
        let releaseSummary: string | null =
          hit?.semantic && hit.semanticSummary
            ? hit.semanticSummary
            : rawNotes
              ? salientNotesLines(rawNotes, r.tag_name ?? "")
              : null;
        let releaseSummarySource: string | null =
          hit?.semantic && hit.semanticSummary ? "ai" : null;
        if (!hit?.semantic) {
          if (rawNotes) {
            const aiRes = await getAI().summarizeUpdate(
              rawNotes,
              `${owner}/${repo} release ${r.tag_name}`
            );
            if (aiRes) {
              releaseSummary = aiRes.summary;
              releaseSummarySource = "ai";
              priority = higherPriority(priority, aiRes.priority);
            }
          }
        }
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
          releaseSummary,
          r.html_url,
          {
            tag: r.tag_name,
            prerelease: r.prerelease,
            semantic: !!hit?.semantic,
            semanticTopic: hit?.semanticTopic ?? null,
            semanticSummary: hit?.semanticSummary ?? null,
            summarySource: releaseSummarySource,
          }
        );
      }
    }
    state.seen_tags = pushCap(seenTags, "", 200).filter(Boolean);

    // --- Milestones (big project moments, always tracked) ---
    await processMilestones(await github.milestones(owner, repo));

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
          // Optional AI summary + importance classification of the issue
          // (title + body). Previously the "summary" was just the issue URL.
          let issuePriority: Priority = rule ? rule.priority : "normal";
          let issueSummary: string | null = null;
          const issueText = [i.title, i.body ?? ""].filter(Boolean).join("\n");
          const aiRes = await getAI().summarizeUpdate(
            issueText,
            `${owner}/${repo} issue #${i.number}`
          );
          if (aiRes) {
            issueSummary = aiRes.summary;
            issuePriority = higherPriority(issuePriority, aiRes.priority);
          }
          emit(
            issuePriority,
            "issue",
            `Labeled "${lbl}": ${i.title}`,
            issueSummary,
            i.html_url,
            // Issue summaries only ever come from the AI (or are absent).
            { label: lbl, number: i.number, summarySource: issueSummary ? "ai" : null }
          );
          seenIssues.push(String(i.number));
        }
      }
      state.seen_issues = pushCap(seenIssues, "", 300).filter(Boolean);
    }

    // --- README + commits: keywordless change tracking and/or keyword
    // scans (state-change detection). Nothing is fetched when neither the
    // track toggle nor any rule targets that area.
    for (const scan of (["readme", "commits"] as const)) {
      if (scan === "readme" ? !watchReadme : !watchCommits) continue;
      let text = "";
      // Where a match links to (instead of the repo root): the README blob
      // URL for README hits, the individual commits for commit hits.
      let readmeUrl: string | null = null;
      let commits: GhCommit[] = [];
      if (scan === "readme") {
        const info = await github.readmeInfo(owner, repo);
        text = info?.text ?? "";
        readmeUrl = info?.htmlUrl ?? null;
        // Keywordless "README changed" tracking (hash + stored-text diff)
        if (trackReadme && text) {
          const h = hashText(text);
          if (state.readme_hash === undefined) {
            state.readme_hash = h; // baseline — no update
          } else if (h !== state.readme_hash) {
            const prevText = state.readme_text ?? "";
            const patch = createPatch(
              "README.md",
              prevText,
              text,
              "",
              undefined,
              { context: 1 }
            );
            const added = patch
              .split("\n")
              .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
              .map((l) => l.slice(1).trim())
              .filter(Boolean);
            // Optional AI summary + importance classification of the README
            // change (diff as the input; heuristic added-lines as fallback).
            let readmePriority: Priority = "normal";
            let readmeSummary = truncate(
              added.slice(0, 10).join("\n") || "README changed",
              1000
            );
            const aiRes = await getAI().summarizeUpdate(
              patch,
              `${owner}/${repo} README`
            );
            if (aiRes) {
              readmeSummary = aiRes.summary;
              readmePriority = higherPriority(readmePriority, aiRes.priority);
            }
            emit(
              readmePriority,
              "readme",
              "README updated",
              truncate(readmeSummary, 1000),
              readmeUrl ?? `https://github.com/${owner}/${repo}`,
              // No AI → the summary is a heuristic list of added lines.
              { added: added.slice(0, 30), summarySource: aiRes ? "ai" : null }
            );
            state.readme_hash = h;
          }
          state.readme_text =
            text.length > 20_000 ? text.slice(0, 20_000) : text;
        }
      } else {
        commits = await github.commits(owner, repo, 30);
        text = commits.map((c) => c.commit.message).join("\n");
        // Keywordless "new commit" tracking (SHA bookkeeping)
        if (trackCommits) {
          if (state.seen_commit_shas === undefined) {
            state.seen_commit_shas = commits.map((c) => c.sha); // baseline
          } else {
            const seenShas = state.seen_commit_shas;
            const fresh = commits
              .filter((c) => !seenShas.includes(c.sha))
              .reverse(); // oldest first
            // Optional AI summary + importance classification per commit.
            // Capped: summarizing more than 10 commits at once would be a
            // burst of LLM calls for little extra value.
            const ai = getAI();
            const useAI = fresh.length <= 10;
            for (const c of fresh) {
              let commitPriority: Priority = "normal";
              let commitSummary: string | null = null;
              if (useAI) {
                const aiRes = await ai.summarizeUpdate(
                  c.commit.message,
                  `${owner}/${repo} commit`
                );
                if (aiRes) {
                  commitSummary = aiRes.summary;
                  commitPriority = higherPriority(
                    commitPriority,
                    aiRes.priority
                  );
                }
              }
              emit(
                commitPriority,
                "commit",
                `Commit: ${c.commit.message.split("\n")[0].slice(0, 120)}`,
                commitSummary,
                c.html_url,
                // Commit summaries only ever come from the AI (or are absent).
                { sha: c.sha, summarySource: commitSummary ? "ai" : null }
              );
            }
            state.seen_commit_shas = [
              ...seenShas,
              ...commits.map((c) => c.sha),
            ].slice(-300);
          }
        }
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
