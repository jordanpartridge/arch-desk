// Per-repo 7-day series folded from the GitHub activity store.
//
// The heatmap stays a shared 7×24 grid. This file does not call `gh`, does not
// grow a token path, and does not refresh the store: INFOMARCHY_SKIP_GITHUB=1
// is honoured in github-activity.ts / the collector, which never fetch when
// set. Cached rows still graph.

import { localDayIndex } from "./history-time";
import { type GithubStore, validRepo } from "./github-activity";

export const GITHUB_REPOS_CAP = 12;

export type GithubRepoSeries = {
  name: string;
  commits7: number;
  prs7: number;
  points: number[];
};

export type GithubReposSnapshot = { repos: GithubRepoSeries[] };

const EMPTY: GithubReposSnapshot = { repos: [] };

// Matches InfoModel.plainText so a name is safe in Text.PlainText and never
// carries markup or C0 controls into the desk.
export function githubRepoPlainName(repo: string, short: boolean): string {
  const raw = short ? (repo.split("/")[1] || repo) : repo;
  return String(raw || "").slice(0, 80).replace(/[<>&]/g, (character) => {
    return character === "<" ? "‹" : character === ">" ? "›" : "＆";
  }).replace(/[\u0000-\u001f\u007f]/g, " ");
}

type Acc = { repo: string; commits7: number; prs7: number; points: number[] };

function emptyPoints(): number[] { return [0, 0, 0, 0, 0, 0, 0]; }

export function githubReposFromStore(store: GithubStore | null | undefined, dayStarts: unknown): GithubReposSnapshot {
  if (!store || typeof store !== "object") return EMPTY;
  if (!Array.isArray(dayStarts) || dayStarts.length !== 7) return EMPTY;
  const days = dayStarts.map(Number);
  if (days.some((value) => !Number.isFinite(value) || value <= 0)) return EMPTY;

  const byRepo = new Map<string, Acc>();
  const bump = (repoRaw: unknown, ts: unknown, kind: "commit" | "pr") => {
    const repo = validRepo(repoRaw);
    if (!repo) return;
    const time = Number(ts);
    if (!Number.isFinite(time) || time <= 0) return;
    const day = localDayIndex(time, days);
    if (day < 0 || day > 6) return;
    let acc = byRepo.get(repo);
    if (!acc) {
      acc = { repo, commits7: 0, prs7: 0, points: emptyPoints() };
      byRepo.set(repo, acc);
    }
    if (kind === "commit") acc.commits7++;
    else acc.prs7++;
    acc.points[day]++;
  };

  for (const row of Object.values(store.commits || {})) {
    if (!Array.isArray(row)) continue;
    bump(row[1], row[0], "commit");
  }
  for (const row of Object.values(store.events || {})) {
    if (!Array.isArray(row)) continue;
    if (row[1] !== "pr") continue;
    bump(row[2], row[0], "pr");
  }

  const ranked = [...byRepo.values()]
    .filter((acc) => acc.commits7 + acc.prs7 > 0)
    .sort((a, b) => (b.commits7 + b.prs7) - (a.commits7 + a.prs7) || b.commits7 - a.commits7 || a.repo.localeCompare(b.repo))
    .slice(0, GITHUB_REPOS_CAP);

  const shortCount = new Map<string, number>();
  for (const acc of ranked) {
    const short = acc.repo.split("/")[1] || acc.repo;
    shortCount.set(short, (shortCount.get(short) || 0) + 1);
  }

  return {
    repos: ranked.map((acc) => {
      const short = acc.repo.split("/")[1] || acc.repo;
      return {
        name: githubRepoPlainName(acc.repo, (shortCount.get(short) || 0) < 2),
        commits7: acc.commits7,
        prs7: acc.prs7,
        points: acc.points.slice(),
      };
    }),
  };
}
