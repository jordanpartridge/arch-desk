// ARCH module — locked house graph, decorated by live session counts.
// Nodes come from this snapshot's sessions plus the house list. Edges are
// the locked connections (intake → face, bus, glass). No second catalog.

export type ArchAttention = "blocked" | "waiting" | "done" | "";

export type ArchNode = {
  id: string;
  label: string;
  role: string;
  house: boolean;
  x: number;
  y: number;
  sessions: number;
  attention: ArchAttention;
  thinkFilter: string;
};

export type ArchEdge = {
  from: string;
  to: string;
  label: string;
};

export type ArchMap = {
  nodes: ArchNode[];
  edges: ArchEdge[];
};

const MAX_EXTRA_NODES = 12;
const MAX_LABEL = 48;
const MAX_ROLE = 32;
const MAX_FILTER = 180;

type HouseSpec = {
  id: string;
  label: string;
  role: string;
  aliases: readonly string[];
  x: number;
  y: number;
};

// Locked. Do not fetch GitHub or invent a second org catalog.
export const HOUSE_NODES: readonly HouseSpec[] = [
  { id: "asgard", label: "Asgard", role: "intake / SQL", aliases: ["asgard"], x: 0.20, y: 0.42 },
  { id: "lexi", label: "Lexi", role: "face", aliases: ["lexi"], x: 0.48, y: 0.18 },
  { id: "prefrontal", label: "prefrontal-cortex", role: "morning chair", aliases: ["prefrontal-cortex", "prefrontal"], x: 0.48, y: 0.58 },
  { id: "conduit", label: "conduit", role: "wiring", aliases: ["conduit", "conduit-ui"], x: 0.72, y: 0.32 },
  { id: "hive", label: "hive", role: "mesh", aliases: ["hive"], x: 0.20, y: 0.78 },
  { id: "agent-bus", label: "agent-bus", role: "bus", aliases: ["agent-bus", "agentbus"], x: 0.72, y: 0.78 },
  { id: "glass", label: "arch-desk", role: "glass", aliases: ["arch-desk", "omarchy", "infomarchy"], x: 0.88, y: 0.52 },
];

// hive → seats: seats live on the glass; the locked target is glass.
export const HOUSE_EDGES: readonly ArchEdge[] = [
  { from: "asgard", to: "lexi", label: "prep packet" },
  { from: "asgard", to: "prefrontal", label: "intake" },
  { from: "conduit", to: "glass", label: "wiring" },
  { from: "hive", to: "glass", label: "seats" },
  { from: "agent-bus", to: "glass", label: "bus" },
];

function asText(value: unknown, limit: number): string {
  if (value === null || value === undefined || typeof value === "object" || typeof value === "function") return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit).trim();
}

export function projectKey(session: unknown): string {
  const row = session && typeof session === "object" ? session as Record<string, unknown> : {};
  return asText(row.repoRoot, MAX_FILTER) || asText(row.repo, MAX_FILTER) || asText(row.cwd, MAX_FILTER) || asText(row.project, MAX_FILTER);
}

function basenameToken(session: unknown): string {
  const row = session && typeof session === "object" ? session as Record<string, unknown> : {};
  const raw = asText(row.project, MAX_FILTER) || asText(row.cwd, MAX_FILTER) || asText(row.repoRoot, MAX_FILTER) || asText(row.repo, MAX_FILTER);
  const base = raw.replace(/\/+$/, "").split("/").pop() || "";
  return base.toLowerCase();
}

function matchesHouse(session: unknown, aliases: readonly string[]): boolean {
  const token = basenameToken(session);
  if (!token) return false;
  return aliases.some(alias => token === alias.toLowerCase());
}

function pidOf(session: unknown): number {
  const pid = Number((session && typeof session === "object" ? (session as any).pid : 0));
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
}

function attentionOf(session: unknown): ArchAttention {
  const value = asText((session && typeof session === "object" ? (session as any).attention : ""), 16).toLowerCase();
  return value === "blocked" || value === "waiting" || value === "done" ? value : "";
}

function nodeAttention(sessions: unknown[]): ArchAttention {
  const rank: Record<string, number> = { blocked: 0, waiting: 1, done: 2 };
  let best: ArchAttention = "";
  for (const session of sessions) {
    const next = attentionOf(session);
    if (!next) continue;
    if (!best || rank[next] < rank[best]) best = next;
  }
  return best;
}

// Seat 1 filters by project key, or by a pid list when one house node maps to
// more than one checkout.
export function thinkFilterId(sessions: unknown[], fallback: string): string {
  const safeFallback = asText(fallback, MAX_FILTER) || "node";
  if (!sessions.length) return safeFallback;
  const keys = [...new Set(sessions.map(projectKey).filter(Boolean))];
  if (keys.length === 1) return keys[0];
  const pids = [...new Set(sessions.map(pidOf).filter(Boolean))].sort((a, b) => a - b);
  if (pids.length) return pids.join(",");
  return keys[0] || safeFallback;
}

function extraSlug(key: string, used: Set<string>): string {
  const base = (key.replace(/\/+$/, "").split("/").pop() || "repo")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "repo";
  let id = base, n = 2;
  while (used.has(id)) { id = `${base}-${n}`; n++; }
  used.add(id);
  return id;
}

function extraLayout(index: number, total: number): { x: number; y: number } {
  const columns = Math.min(6, Math.max(1, total));
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 1 ? 0.50 : 0.10 + (col / (columns - 1)) * 0.80;
  return { x, y: 0.08 + row * 0.12 };
}

export function archMap(sessions: unknown): ArchMap {
  const list = Array.isArray(sessions) ? sessions.slice(0, 256) : [];
  const claimed = new Set<unknown>();
  const usedIds = new Set<string>(HOUSE_NODES.map(node => node.id));
  const nodes: ArchNode[] = HOUSE_NODES.map(spec => {
    const matched = list.filter(session => !claimed.has(session) && matchesHouse(session, spec.aliases));
    for (const session of matched) claimed.add(session);
    return {
      id: spec.id,
      label: spec.label.slice(0, MAX_LABEL),
      role: spec.role.slice(0, MAX_ROLE),
      house: true,
      x: spec.x,
      y: spec.y,
      sessions: matched.length,
      attention: nodeAttention(matched),
      thinkFilter: thinkFilterId(matched, spec.id),
    };
  });

  const extras = new Map<string, unknown[]>();
  for (const session of list) {
    if (claimed.has(session)) continue;
    const key = projectKey(session);
    if (!key) continue;
    const group = extras.get(key) || [];
    group.push(session);
    extras.set(key, group);
  }
  const extraRows = [...extras.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTRA_NODES);
  extraRows.forEach(([key, group], index) => {
    const pos = extraLayout(index, extraRows.length);
    const label = asText(key.replace(/\/+$/, "").split("/").pop() || key, MAX_LABEL) || "repo";
    nodes.push({
      id: extraSlug(key, usedIds),
      label,
      role: "session",
      house: false,
      x: pos.x,
      y: pos.y,
      sessions: group.length,
      attention: nodeAttention(group),
      thinkFilter: thinkFilterId(group, key),
    });
  });

  return {
    nodes,
    edges: HOUSE_EDGES.map(edge => ({ from: edge.from, to: edge.to, label: edge.label })),
  };
}
