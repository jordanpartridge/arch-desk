import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { HOUSE_EDGES, HOUSE_NODES, archMap, projectKey, thinkFilterId } from "./arch-map";

const session = (overrides: Record<string, unknown>) => ({
  provider: "grok", pid: 100, cwd: "~/Work/Asgard", project: "Asgard", repoRoot: "~/Work/Asgard", attention: "", ...overrides,
});

describe("locked house graph", () => {
  test("always emits the house nodes and locked edges with no sessions", () => {
    const map = archMap([]);
    expect(map.nodes.filter(node => node.house).map(node => node.id)).toEqual(HOUSE_NODES.map(node => node.id));
    expect(map.edges).toEqual(HOUSE_EDGES.map(edge => ({ from: edge.from, to: edge.to, label: edge.label })));
    expect(map.edges).toEqual([
      { from: "asgard", to: "lexi", label: "prep packet" },
      { from: "asgard", to: "prefrontal", label: "intake" },
      { from: "conduit", to: "glass", label: "wiring" },
      { from: "hive", to: "glass", label: "seats" },
      { from: "agent-bus", to: "glass", label: "bus" },
    ]);
    expect(map.nodes.find(node => node.id === "asgard")).toMatchObject({ label: "Asgard", role: "intake / SQL", sessions: 0, thinkFilter: "asgard" });
    expect(map.nodes.find(node => node.id === "glass")).toMatchObject({ label: "arch-desk", role: "glass" });
    expect(map.nodes.every(node => node.house)).toBe(true);
  });

  test("does not invent edges for extra session projects", () => {
    const map = archMap([session({ cwd: "~/Work/atlas", project: "atlas", repoRoot: "~/Work/atlas", pid: 7 })]);
    expect(map.edges).toHaveLength(HOUSE_EDGES.length);
    expect(map.nodes.some(node => node.id === "atlas" && node.house === false)).toBe(true);
  });
});

describe("live session decoration", () => {
  test("counts matching house sessions and surfaces the strongest attention", () => {
    const map = archMap([
      session({ pid: 11, attention: "waiting" }),
      session({ pid: 12, attention: "blocked", cwd: "~/Work/Asgard", repoRoot: "~/Work/Asgard" }),
      session({ pid: 13, project: "lexi", cwd: "~/Work/lexi", repoRoot: "~/Work/lexi", attention: "done" }),
    ]);
    expect(map.nodes.find(node => node.id === "asgard")).toMatchObject({ sessions: 2, attention: "blocked", thinkFilter: "~/Work/Asgard" });
    expect(map.nodes.find(node => node.id === "lexi")).toMatchObject({ sessions: 1, attention: "done", thinkFilter: "~/Work/lexi" });
  });

  test("matches house aliases on the project basename only", () => {
    const map = archMap([
      session({ project: "prefrontal-cortex", cwd: "~/Work/prefrontal-cortex", repoRoot: "~/Work/prefrontal-cortex", pid: 21 }),
      session({ project: "conduit-ui", cwd: "~/Work/conduit-ui", repoRoot: "~/Work/conduit-ui", pid: 22 }),
      session({ project: "infomarchy", cwd: "~/.config/omarchy/plugins/nixfred.infomarchy", repoRoot: "~/.config/omarchy/plugins/nixfred.infomarchy", pid: 23 }),
      session({ project: "asgard-10-crew", cwd: "~/Work/die/asgard-10-crew", repoRoot: "~/Work/die/asgard-10-crew", pid: 24 }),
    ]);
    expect(map.nodes.find(node => node.id === "prefrontal")?.sessions).toBe(1);
    expect(map.nodes.find(node => node.id === "conduit")?.sessions).toBe(1);
    expect(map.nodes.find(node => node.id === "glass")?.sessions).toBe(1);
    expect(map.nodes.find(node => node.id === "asgard")?.sessions).toBe(0);
    expect(map.nodes.some(node => node.label === "asgard-10-crew" && node.house === false)).toBe(true);
  });

  test("emits a pid list when one house node maps to more than one project key", () => {
    const map = archMap([
      session({ pid: 31, repoRoot: "~/Work/Asgard", cwd: "~/Work/Asgard", project: "Asgard" }),
      session({ pid: 8, repoRoot: "~/Projects/Asgard", cwd: "~/Projects/Asgard", project: "Asgard" }),
    ]);
    expect(map.nodes.find(node => node.id === "asgard")?.thinkFilter).toBe("8,31");
  });

  test("projectKey prefers repoRoot and thinkFilter falls back to the house id", () => {
    expect(projectKey({ repoRoot: "~/Work/Asgard", cwd: "~/Work/Asgard/app", project: "Asgard" })).toBe("~/Work/Asgard");
    expect(thinkFilterId([], "asgard")).toBe("asgard");
    expect(thinkFilterId([session({ pid: 4 })], "asgard")).toBe("~/Work/Asgard");
  });

  test("ignores coercion traps and caps extra nodes", () => {
    const hostile = { toString: 0, pid: 1, project: "ok", cwd: "~/ok", repoRoot: "~/ok" };
    expect(() => archMap([hostile, { pid: { toString: 0 }, project: { valueOf: 0 } }])).not.toThrow();
    const extras = Array.from({ length: 20 }, (_, i) => session({
      pid: 200 + i, project: "repo-" + i, cwd: "~/Work/repo-" + i, repoRoot: "~/Work/repo-" + i,
    }));
    expect(archMap(extras).nodes.filter(node => !node.house)).toHaveLength(12);
    expect(archMap(null).nodes).toHaveLength(HOUSE_NODES.length);
  });
});

describe("desk wiring", () => {
  const root = import.meta.dir;
  const settings = readFileSync(join(root, "InfoSettings.qml"), "utf8");
  const view = readFileSync(join(root, "InfoView.qml"), "utf8");
  const collector = readFileSync(join(root, "collector.ts"), "utf8");
  const qml = readFileSync(join(root, "ArchMap.qml"), "utf8");

  test("collector ships ai.arch from this snapshot only", () => {
    expect(collector).toContain('import { archMap } from "./arch-map"');
    expect(collector.match(/arch:\s*archMap\(sessions\)/g)).toHaveLength(2);
    expect(collector).not.toContain("github.com/jordanpartridge");
  });

  test("InfoSettings registers arch and InfoView loads ArchMap behind that id", () => {
    expect(settings).toContain('{ id: "arch", label: "ARCH" }');
    expect(view).toContain("ARCH map (Asgard#260). Do not rewrite LIVE AI SESSIONS.");
    expect(view).toContain('visible: view.sectionEnabled("arch")');
    expect(view).toContain('source: Qt.resolvedUrl("ArchMap.qml")');
    expect(view).toContain("item.nodeClicked.connect");
    expect(view).toContain("view.projectFilter");
    const mark = view.indexOf("ARCH map (Asgard#260). Do not rewrite LIVE AI SESSIONS.");
    const sessions = view.indexOf("// ---- live sessions ----");
    expect(mark).toBeGreaterThan(0);
    expect(sessions).toBeGreaterThan(mark);
    const block = view.slice(mark, sessions);
    expect(block).toContain('source: Qt.resolvedUrl("ArchMap.qml")');
    expect(block.split("\n").filter(function(line) { return line.trim(); }).length).toBeLessThanOrEqual(15);
  });

  test("ArchMap is plain text, local, and themed", () => {
    expect(qml).toContain("component PlainText: Text { textFormat: Text.PlainText }");
    expect(qml).not.toMatch(/\bStdioCollector\b/);
    expect(qml).not.toMatch(/https?:\/\//);
    expect(qml).not.toContain("XMLHttpRequest");
    expect(qml).not.toContain("fetch(");
    expect(qml).toContain("desk.themeForeground");
    expect(qml).toContain("desk.themeBackground");
    expect(qml).toContain("nodeClicked");
    expect(qml).toContain("thinkFilter");
  });
});
