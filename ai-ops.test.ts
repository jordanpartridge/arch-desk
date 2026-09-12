import { describe, expect, test } from "bun:test";
import { attentionSignal, attentionState, parseCommitSummary, parseDiffNumstat, parseGitStatus, projectHealth, repoCollisions, workspaceGroups, resourceDelta, forecastPercent, usageWindowMs, limitForecast, thinkBoard, groupTone, THINK_TONES, THINK_LANES } from "./ai-ops";

describe("AI operations signals", () => {
  test("parses branch readiness and conflicts", () => {
    const state = parseGitStatus("# branch.head feature\n# branch.upstream origin/feature\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/file.ts\n1 M. N... 100644 100644 100644 a b staged.ts\n? new test.ts\nu UU N... 100644 100644 100644 100644 a b c conflict.ts\n");
    expect(state).toEqual({
      branch: "feature", upstream: "origin/feature", ahead: 2, behind: 1,
      dirty: 4, staged: 1, untracked: 1, conflicts: 1,
      files: ["src/file.ts", "staged.ts", "new test.ts", "conflict.ts"],
    });
  });

  test("summarizes bounded diff and commit metadata", () => {
    expect(parseDiffNumstat("12\t3\tsrc/a.ts\n-\t-\tasset.png\n4\t0\ttest/a.test.ts\n")).toEqual({ files: 3, additions: 16, deletions: 3 });
    expect(parseCommitSummary("abcdef0123456789\tabcdef0\t1787920000\tfeat: add operations intelligence\n")).toEqual({
      hash: "abcdef0123456789", short: "abcdef0", committedAt: 1787920000000, subject: "feat: add operations intelligence",
    });
    expect(parseCommitSummary("not-a-commit")).toBeNull();
    expect(parseCommitSummary("abcdef0\tabcdef0\t\tmissing timestamp")).toBeNull();
    expect(parseCommitSummary("abcdef0\tabcdef0\t-1\tpre-epoch timestamp")).toBeNull();
  });

  test("prioritizes blocked, waiting, and completed titles", () => {
    expect(attentionState("Permission required to continue")).toBe("waiting");
    expect(attentionState("✅ Ready for review")).toBe("done");
    expect(attentionState("working", 1)).toBe("blocked");
    expect(attentionSignal("Confirmation required")).toEqual({
      state: "waiting", reason: "waiting for your confirmation", action: "answer", detail: "Confirmation required",
    });
    expect(attentionSignal("working", 2)).toEqual({
      state: "blocked", reason: "2 merge conflicts need resolution", action: "resolve", detail: "working",
    });
    expect(attentionSignal("✅ Ready for review")?.action).toBe("review");
    expect(attentionSignal("Implement error handling")).toBeNull();
    expect(attentionSignal("Error: build stopped")?.state).toBe("blocked");
    expect(attentionSignal("actively editing files")).toBeNull();
  });

  test("reports agents sharing a repository", () => {
    const collisions = repoCollisions([
      { repoRoot: "/work/a", project: "a", provider: "claude", pid: 1 },
      { repoRoot: "/work/a", project: "a", provider: "codex", pid: 2 },
      { repoRoot: "/work/b", project: "b", provider: "grok", pid: 3 },
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].agents).toHaveLength(2);
  });

  test("aggregates repository health and prioritizes actionable projects", () => {
    const projects = projectHealth([
      { repoRoot: "/work/clean", cwd: "/work/clean", project: "clean", provider: "codex", pid: 1, git: { branch: "main", dirty: 0, behind: 0, conflicts: 0 }, ci: { state: "success" }, changes: { headShort: "abc1234" } },
      { repoRoot: "/work/risk", cwd: "/work/risk", project: "risk", provider: "claude", pid: 2, git: { branch: "feature", dirty: 2, behind: 1, conflicts: 0 }, ci: { state: "in_progress" } },
      { repoRoot: "/work/risk", cwd: "/work/risk", project: "risk", provider: "opencode", pid: 3, git: { branch: "feature", dirty: 2, behind: 1, conflicts: 0 }, ci: { state: "in_progress" } },
      { repoRoot: "/work/broken", cwd: "/work/broken", project: "broken", provider: "grok", pid: 4, git: { branch: "main", dirty: 0, behind: 0, conflicts: 0 }, ci: { state: "failure" } },
    ]);
    expect(projects.map(project => [project.project, project.status])).toEqual([
      ["broken", "blocked"], ["risk", "running"], ["clean", "healthy"],
    ]);
    expect(projects[1].agents.map(agent => agent.provider)).toEqual(["claude", "opencode"]);
  });

  test("groups addressable agents by workspace and puts the newest first", () => {
    expect(workspaceGroups([
      { provider: "codex", pid: 1, startedAt: 10, window: { workspace: 3, address: "0xabc" } },
      { provider: "claude", pid: 2, startedAt: 20, window: { workspace: 3, address: "0xdef" } },
      { provider: "grok", pid: 3, startedAt: 30, window: { workspace: 1, address: "0x123" } },
      { provider: "codex", pid: 4, window: null },
      { provider: "codex", pid: 5, window: { workspace: "bad", address: "oops" } },
    ])).toEqual([
      { workspace: 1, agents: [{ provider: "grok", address: "0x123", pid: 3, startedAt: 30 }] },
      { workspace: 3, agents: [
        { provider: "claude", address: "0xdef", pid: 2, startedAt: 20 },
        { provider: "codex", address: "0xabc", pid: 1, startedAt: 10 },
      ] },
    ]);
  });

  test("computes process-tree CPU deltas and rejects stale samples", () => {
    expect(resourceDelta(250, 100, 1.5)).toBe(100);
    expect(resourceDelta(90, 100, 2)).toBeNull();
    expect(resourceDelta(250, 100, 0.2)).toBeNull();
  });

  test("projects usage to reset and refuses immature or malformed windows", () => {
    expect(forecastPercent(0.25, 2 * 3600000, 4 * 3600000)).toBe(0.5);
    expect(forecastPercent(0.1, 3.95 * 3600000, 4 * 3600000)).toBeNull();
    expect(forecastPercent("bad", 1, 2)).toBeNull();
  });
});

describe("usage forecast", () => {
  const stamp = Date.UTC(2026, 7, 30, 12, 0, 0);
  test("classifies limit windows", () => {
    expect(usageWindowMs("WEEKLY")).toBe(7 * 86400000);
    expect(usageWindowMs("7-day")).toBe(7 * 86400000);
    expect(usageWindowMs("5-HOUR")).toBe(5 * 3600000);
    expect(usageWindowMs("SESSION")).toBe(5 * 3600000);
    expect(usageWindowMs("mystery")).toBe(0);
  });
  test("projects a limit at its window pace", () => {
    const resetsAt = new Date(stamp + 2 * 3600000).toISOString();
    expect(limitForecast({ label: "SESSION", percent: 0.25, resetsAt }, stamp)).toBeCloseTo(0.4166, 3);
  });
  test("refuses unusable limits instead of guessing", () => {
    expect(limitForecast(null, stamp)).toBeNull();
    expect(limitForecast({ label: "unknown", percent: 0.5, resetsAt: new Date(stamp).toISOString() }, stamp)).toBeNull();
    // Barely into the window — too little signal to extrapolate.
    expect(limitForecast({ label: "SESSION", percent: 0.1, resetsAt: new Date(stamp + 4.99 * 3600000).toISOString() }, stamp)).toBeNull();
  });
});

describe("project health honesty", () => {
  test("missing git state is unknown, not healthy", () => {
    const [project] = projectHealth([{ provider: "claude", pid: 1, cwd: "~/x", repoRoot: "", git: null, ci: null, project: "x" }]);
    expect(project.status).toBe("unknown");
    const [clean] = projectHealth([{ provider: "claude", pid: 1, cwd: "~/y", repoRoot: "~/y", git: { dirty: 0, behind: 0, conflicts: 0 }, ci: null, project: "y" }]);
    expect(clean.status).toBe("healthy");
  });
});

describe("think board", () => {
  test("empty input is an empty board", () => {
    expect(thinkBoard([])).toEqual({ sessionCount: 0, groupCount: 0, lanes: [] });
    expect(thinkBoard(null as any)).toEqual({ sessionCount: 0, groupCount: 0, lanes: [] });
  });

  test("name-123-crew is Asgard #123 and a matching parent joins", () => {
    const board = thinkBoard([
      { pid: 11, provider: "grok", project: "asgard-123-crew", cwd: "~/Work/die/asgard-123-crew", busy: true },
      { pid: 12, provider: "claude", project: "Asgard", cwd: "~/Projects/jordanpartridge/Asgard", name: "asgard", attention: "waiting" },
    ]);
    expect(board).toMatchObject({ sessionCount: 2, groupCount: 1 });
    expect(board.lanes.map(lane => lane.id)).toEqual(["inbox"]);
    expect(board.lanes[0].groups).toEqual([expect.objectContaining({
      id: "asgard-123", label: "Asgard #123", org: "jordanpartridge", count: 2,
      busy: true, attention: true, pids: [11, 12], providers: ["grok", "claude"],
    })]);
    expect(THINK_TONES).toContain(board.lanes[0].groups[0].tone);
  });

  test("asgard-host-ops-live is inbox, not the machine org path", () => {
    const board = thinkBoard([
      { pid: 7, provider: "grok", name: "asgard-host-ops-live", cwd: "~/Projects/jordanpartridge/Asgard", project: "Asgard" },
    ]);
    expect(board.lanes).toEqual([expect.objectContaining({
      id: "inbox",
      groups: [expect.objectContaining({ id: "asgard-host-ops-live", label: "host-ops live", org: "jordanpartridge", count: 1, pids: [7] })],
    })]);
  });

  test("~/Projects/<org>/... maps product, wiring, and machine", () => {
    const board = thinkBoard([
      { pid: 1, provider: "grok", cwd: "~/Projects/the-shit/kit", project: "kit" },
      { pid: 2, provider: "claude", cwd: "~/Projects/conduit-ui/core", project: "core" },
      { pid: 3, provider: "codex", cwd: "~/Projects/synapse-sentinel/lexi", project: "lexi" },
      { pid: 4, provider: "opencode", cwd: "~/Projects/jordanpartridge/omarchy-riceThor", project: "omarchy-riceThor" },
    ]);
    expect(board.lanes.map(lane => lane.id)).toEqual(["product", "wiring", "machine"]);
    expect(board.lanes.find(lane => lane.id === "product")?.groups.map(g => g.id)).toEqual(["kit"]);
    expect(board.lanes.find(lane => lane.id === "wiring")?.groups.map(g => [g.id, g.org]).sort()).toEqual([
      ["core", "conduit-ui"], ["lexi", "synapse-sentinel"],
    ].sort());
    expect(board.lanes.find(lane => lane.id === "machine")?.groups[0]).toMatchObject({
      id: "omarchy-ricethor", org: "jordanpartridge", label: "omarchy-riceThor",
    });
  });

  test("known basenames land even without a Projects path", () => {
    const board = thinkBoard([
      { pid: 1, provider: "grok", project: "prefrontal-cortex", cwd: "~/Work/prefrontal-cortex" },
      { pid: 2, provider: "claude", project: "lexi", cwd: "~/code/lexi" },
      { pid: 3, provider: "codex", project: "cloudflare", cwd: "~/tmp/cloudflare" },
      { pid: 4, provider: "grok", project: "agent-bus", cwd: "~/tmp/agent-bus" },
      { pid: 5, provider: "grok", project: "hive", cwd: "~/tmp/hive" },
      { pid: 6, provider: "claude", project: "music", cwd: "~/tmp/music" },
      { pid: 7, provider: "codex", project: "kit", cwd: "~/tmp/kit" },
    ]);
    const byId = Object.fromEntries(board.lanes.flatMap(lane => lane.groups.map(g => [g.id, { lane: lane.id, org: g.org }])));
    expect(byId["prefrontal-cortex"]).toEqual({ lane: "machine", org: "jordanpartridge" });
    expect(byId.lexi).toEqual({ lane: "wiring", org: "synapse-sentinel" });
    expect(byId.cloudflare).toEqual({ lane: "wiring", org: "" });
    expect(byId["agent-bus"]).toEqual({ lane: "wiring", org: "conduit-ui" });
    expect(byId.hive).toEqual({ lane: "wiring", org: "jordanpartridge" });
    expect(byId.music).toEqual({ lane: "product", org: "the-shit" });
    expect(byId.kit).toEqual({ lane: "product", org: "the-shit" });
    expect(board.lanes.map(lane => lane.id)).toEqual(["product", "wiring", "machine"]);
  });

  test("unknown projects sit in other, and crew wins over a Projects path", () => {
    const board = thinkBoard([
      { pid: 1, provider: "grok", project: "atlas", cwd: "~/Code/atlas" },
      { pid: 2, provider: "claude", project: "asgard-99-crew", cwd: "~/Projects/jordanpartridge/Asgard" },
    ]);
    expect(board.lanes.map(lane => lane.id)).toEqual(["inbox", "other"]);
    expect(board.lanes[0].groups[0]).toMatchObject({ id: "asgard-99", label: "Asgard #99" });
    expect(board.lanes[1].groups[0]).toMatchObject({ id: "atlas", label: "atlas", org: "" });
  });

  test("group tone is a stable hash of group id, not the provider", () => {
    const a = thinkBoard([{ pid: 1, provider: "claude", project: "lexi", cwd: "~/code/lexi" }]);
    const b = thinkBoard([{ pid: 2, provider: "grok", project: "lexi", cwd: "~/code/lexi" }]);
    expect(a.lanes[0].groups[0].tone).toBe(b.lanes[0].groups[0].tone);
    expect(a.lanes[0].groups[0].tone).toBe(groupTone("lexi"));
    expect(THINK_TONES).toContain(a.lanes[0].groups[0].tone);
    expect(groupTone("lexi")).toBe(groupTone("lexi"));
  });

  test("lanes stay in house order and a parent does not join two crews", () => {
    expect([...THINK_LANES]).toEqual(["inbox", "product", "wiring", "machine", "other"]);
    const board = thinkBoard([
      { pid: 1, provider: "grok", project: "asgard-10-crew", cwd: "~/Work/die/asgard-10-crew" },
      { pid: 2, provider: "grok", project: "asgard-20-crew", cwd: "~/Work/die/asgard-20-crew" },
      { pid: 3, provider: "claude", project: "Asgard", cwd: "~/Projects/jordanpartridge/Asgard" },
      { pid: 4, provider: "codex", project: "kit", cwd: "~/Projects/the-shit/kit" },
    ]);
    expect(board.lanes.map(lane => lane.id)).toEqual(["inbox", "product", "machine"]);
    expect(board.lanes[0].groups.map(g => g.id)).toEqual(["asgard-20", "asgard-10"]);
    expect(board.lanes.find(lane => lane.id === "machine")?.groups[0]).toMatchObject({ id: "asgard", count: 1, pids: [3] });
    expect(board.groupCount).toBe(4);
  });

  test("herdr workspace tokens classify a crew", () => {
    const board = thinkBoard([{
      pid: 8, provider: "grok", project: "die", cwd: "~/Work/die",
      hosts: [{ kind: "herdr", workspaceId: "arch-desk-260-crew", label: "Herdr arch-desk-260-crew" }],
    }]);
    expect(board.lanes[0].groups[0]).toMatchObject({ id: "asgard-260", label: "Asgard #260", pids: [8] });
  });
});
