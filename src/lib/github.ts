const API = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ProjectPulse",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 403 || res.status === 429)
    throw new Error("GitHub rate limit reached (set GITHUB_TOKEN for a higher limit)");
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export interface GhRepo {
  full_name: string;
  description: string | null;
  topics: string[];
  pushed_at: string;
  archived: boolean;
  stargazers_count: number;
  owner: { login: string; avatar_url: string };
}

export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  prerelease: boolean;
  published_at: string;
  html_url: string;
}

export interface GhMilestone {
  id: number;
  title: string;
  state: string;
  due_on: string | null;
  closed_issues: number;
  open_issues: number;
  html_url: string;
}

export interface GhIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  html_url: string;
  created_at: string;
}

export interface GhCommit {
  sha: string;
  commit: { message: string; author?: { name?: string } };
  html_url: string;
}

export const github = {
  repo: (owner: string, repo: string) =>
    gh<GhRepo>(`/repos/${owner}/${repo}`),
  releases: (owner: string, repo: string, perPage = 10) =>
    gh<GhRelease[]>(`/repos/${owner}/${repo}/releases?per_page=${perPage}`),
  readme: async (owner: string, repo: string): Promise<string | null> => {
    const res = await fetch(`${API}/repos/${owner}/${repo}/readme`, {
      headers: { ...headers(), "accept": "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return res.text();
  },
  milestones: (owner: string, repo: string) =>
    gh<GhMilestone[]>(`/repos/${owner}/${repo}/milestones?state=all&per_page=20`),
  issues: (owner: string, repo: string, labels: string) =>
    gh<GhIssue[]>(
      `/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(
        labels
      )}&state=open&per_page=30`
    ),
  commits: (owner: string, repo: string, perPage = 30) =>
    gh<GhCommit[]>(`/repos/${owner}/${repo}/commits?per_page=${perPage}`),
};

/** Parse "owner/repo" or a full github URL into [owner, repo] or null. */
export function parseGithubRef(
  input: string
): [string, string] | null {
  let s = input.trim();
  const urlMatch = s.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (urlMatch) return [urlMatch[1], urlMatch[2].replace(/\.git$/, "")];
  const pair = s.match(/^[\w.-]+\/[\w.-]+$/);
  if (pair) return [s.split("/")[0], s.split("/")[1]];
  return null;
}
