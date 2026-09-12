import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { localDayStarts } from "./history-time.ts";
import { emptyGithubStore } from "./github-activity.ts";
import { GITHUB_REPOS_CAP, githubRepoPlainName, githubReposFromStore } from "./github-repos.ts";

const now = new Date(2026, 8, 5, 21, 0, 0, 0).getTime();
const days = localDayStarts(now, 7);
const hour = 3600_000;
const day = 86_400_000;

describe("github repo series", () => {
  test("empty store and bad day starts yield no repos", () => {
    expect(githubReposFromStore(emptyGithubStore(), days)).toEqual({ repos: [] });
    expect(githubReposFromStore(null, days)).toEqual({ repos: [] });
    expect(githubReposFromStore(emptyGithubStore(), [])).toEqual({ repos: [] });
    expect(githubReposFromStore(emptyGithubStore(), days.slice(0, 3))).toEqual({ repos: [] });
    expect(githubReposFromStore(emptyGithubStore(), [0, 0, 0, 0, 0, 0, 0])).toEqual({ repos: [] });
  });

  test("folds commits and PRs into a 7-day series per repo, short PlainText name", () => {
    const store = emptyGithubStore();
    store.commits.aaaaaaa = [days[1] + 10 * hour, "jordanpartridge/Asgard"];
    store.commits.bbbbbbb = [days[1] + 11 * hour, "jordanpartridge/Asgard"];
    store.commits.ccccccc = [days[6] + 2 * hour, "synapse-sentinel/lexi"];
    store.events["1"] = [days[3] + 4 * hour, "pr", "jordanpartridge/Asgard"];
    store.events["2"] = [days[3] + 5 * hour, "review", "jordanpartridge/Asgard"];
    store.events["3"] = [days[0] + hour, "issue", "jordanpartridge/Asgard"];
    store.events["4"] = [now - 8 * day, "pr", "jordanpartridge/Asgard"];
    const { repos } = githubReposFromStore(store, days);
    expect(repos).toEqual([
      { name: "Asgard", commits7: 2, prs7: 1, points: [0, 2, 0, 1, 0, 0, 0] },
      { name: "lexi", commits7: 1, prs7: 0, points: [0, 0, 0, 0, 0, 0, 1] },
    ]);
    expect(repos[0].points).toHaveLength(7);
  });

  test("keeps owner/name when two repos share a short name", () => {
    const store = emptyGithubStore();
    store.commits.aaaaaaa = [days[2] + hour, "jordanpartridge/lexi"];
    store.commits.bbbbbbb = [days[2] + 2 * hour, "synapse-sentinel/lexi"];
    const names = githubReposFromStore(store, days).repos.map((row) => row.name).sort();
    expect(names).toEqual(["jordanpartridge/lexi", "synapse-sentinel/lexi"]);
  });

  test("caps at 12 repos, busiest first", () => {
    const store = emptyGithubStore();
    for (let i = 0; i < 16; i++) {
      const repo = `owner/repo-${String(i).padStart(2, "0")}`;
      for (let n = 0; n < i + 1; n++) store.commits[`${i.toString(16).padStart(2, "0")}${n.toString(16).padStart(5, "0")}`] = [days[4] + hour, repo];
    }
    const { repos } = githubReposFromStore(store, days);
    expect(repos).toHaveLength(GITHUB_REPOS_CAP);
    expect(repos[0].name).toBe("repo-15");
    expect(repos[0].commits7).toBe(16);
    expect(repos[11].name).toBe("repo-04");
    expect(repos.map((row) => row.commits7 + row.prs7)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });

  test("PlainText-safe names strip controls and markup", () => {
    expect(githubRepoPlainName("owner/<script>", true)).toBe("‹script›");
    expect(githubRepoPlainName("owner/a&b", true)).toBe("a＆b");
    expect(githubRepoPlainName("owner/ab\u0000c", true)).toBe("ab c");
  });

  test("does not fetch and does not add a token path", () => {
    const source = readFileSync(join(import.meta.dir, "github-repos.ts"), "utf8");
    expect(source).not.toContain("refreshGithubActivity");
    expect(source).not.toContain("gh api");
    expect(source).not.toContain("GITHUB_TOKEN");
    expect(source).not.toContain("GH_TOKEN");
    expect(source).toContain("INFOMARCHY_SKIP_GITHUB");
  });
});

describe("desk wiring", () => {
  test("collector emits ai.githubRepos from the activity store", () => {
    const source = readFileSync(join(import.meta.dir, "collector.ts"), "utf8");
    expect(source).toContain("githubReposFromStore");
    expect(source).toMatch(/githubRepos:\s*githubReposFromStore/);
    expect(source).toContain("parseGithubStoreText(read(GITHUB_FILE))");
  });

  test("InfoView loads GithubRepos.qml behind githubRepos and leaves the heatmap alone", () => {
    const view = readFileSync(join(import.meta.dir, "InfoView.qml"), "utf8");
    expect(view).toContain("id: githubReposLoader");
    expect(view).toContain('source: "GithubRepos.qml"');
    expect(view).toContain('view.sectionEnabled("githubRepos")');
    expect(view.match(/HeatPanel \{/g)).toHaveLength(2);
    expect(view).toContain('title: "LIVE AI SESSIONS"');
    expect(view).toContain('title: "GITHUB · LAST 7 DAYS"');
  });
});
