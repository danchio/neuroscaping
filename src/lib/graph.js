// Synergy graph for one deck: who links to whom, how strongly, and where to draw them. Pure logic, no DOM.
import { byId } from './cards.js';
import { reasons, score } from './synergy.js';
import { worksWith } from './roles.js';

/** Link strength filters. A link's weight is the sum of both directions (name 3, tag 1.5, faction 1, subtype 1). */
export const STRENGTHS = [
  { id: 'named', min: 3, label: 'Named only', hint: 'One card names the other, or the two share several reasons.' },
  { id: 'strong', min: 2, label: 'Strong', hint: 'Cards that name each other, or that both mention what the other is.' },
  { id: 'all', min: 1, label: 'All links', hint: 'Includes faction-only links: one card mentions the other’s faction. Dense.' },
];
export const strengthMin = (id) => (STRENGTHS.find((s) => s.id === id) || STRENGTHS[1]).min;

/** Every linked pair among the unique cards of a zone. Edges carry weight and the reasons in both directions. */
export function deckGraph(deck, zone = 'main') {
  const nodes = Object.entries(deck[zone] || {})
    .map(([id, n]) => ({ id: Number(id), card: byId.get(Number(id)), n }))
    .filter((x) => x.card)
    .sort((a, b) => a.id - b.id);
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].card, b = nodes[j].card;
      const fwd = reasons(a, b), back = reasons(b, a);
      const weight = score(fwd) + score(back);
      if (weight > 0) edges.push({ a: a.id, b: b.id, weight });
    }
  }
  return { nodes, edges };
}

/** The graph at one strength: edges kept, per-card degree, ranking and loose cards (no partner at this strength). */
export function viewGraph(graph, min) {
  const edges = graph.edges.filter((e) => e.weight >= min);
  const deg = new Map(graph.nodes.map((n) => [n.id, { count: 0, weight: 0 }]));
  for (const e of edges) for (const id of [e.a, e.b]) { const d = deg.get(id); d.count++; d.weight += e.weight; }
  const rank = [...graph.nodes].sort((x, y) => deg.get(y.id).weight - deg.get(x.id).weight || y.n - x.n || x.card.name.localeCompare(y.card.name));
  const orphans = graph.nodes.filter((n) => deg.get(n.id).count === 0);
  return { edges, deg, rank, orphans };
}

/** Partners of one card at a strength, strongest first, each with plain-language reasons. */
export function partnersOf(graph, id, min) {
  const me = byId.get(id);
  const out = [];
  for (const e of graph.edges) {
    if (e.weight < min || (e.a !== id && e.b !== id)) continue;
    const other = byId.get(e.a === id ? e.b : e.a);
    out.push({ card: other, n: graph.nodes.find((x) => x.id === other.id).n, weight: e.weight, why: worksWith(me, other) });
  }
  return out.sort((a, b) => b.weight - a.weight || a.card.name.localeCompare(b.card.name));
}

/** Reasons the mainframe cares about a card (empty when it does not). */
export function mainframeLinks(deck, id) {
  const mf = deck.mainframe && byId.get(deck.mainframe);
  return mf ? worksWith(mf, byId.get(id)) : [];
}

// ---- layout ----
const GOLD = Math.PI * (3 - Math.sqrt(5));
export const nodeRadius = (n) => 6 + Math.min(4, n) * 2.2;

/**
 * Cluster by primary faction. Inside a cluster the best-connected cards sit at the centre (sunflower spiral);
 * clusters sit on a ring. Deterministic, no iteration. Returns node positions, cluster discs and a viewBox.
 */
export function layoutGraph(graph, deg, spacing = 34) {
  const groups = new Map();
  for (const n of graph.nodes) {
    const key = n.card.factions[0] || 'None';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const clusters = [...groups.entries()]
    .map(([faction, list]) => {
      list.sort((a, b) => deg.get(b.id).weight - deg.get(a.id).weight || b.n - a.n || a.card.name.localeCompare(b.card.name));
      return { faction, list, r: spacing * Math.sqrt(list.length) * 0.8 + 28 };
    })
    .sort((a, b) => b.list.length - a.list.length || a.faction.localeCompare(b.faction));

  const GAP = 40;
  // A cluster much bigger than the rest sits in the middle with the others around it; otherwise all sit on a ring.
  const hub = clusters.length > 2 && clusters[0].r > clusters[1].r * 1.5 ? clusters[0] : null;
  const ring = hub ? clusters.slice(1) : clusters;
  if (hub) { hub.cx = 0; hub.cy = 0; }
  if (clusters.length === 1) { clusters[0].cx = 0; clusters[0].cy = 0; }
  else if (clusters.length === 2) {
    const d = clusters[0].r + clusters[1].r + GAP;
    clusters[0].cx = -d / 2; clusters[1].cx = d / 2; clusters[0].cy = clusters[1].cy = 0;
  } else {
    const total = ring.reduce((s, c) => s + 2 * c.r + GAP, 0);
    let rho = Math.max(total / (2 * Math.PI), hub ? hub.r + ring[0].r + GAP : 0);
    const place = () => {
      let acc = 0;
      ring.forEach((c) => { const mid = acc + c.r; c.theta = (mid / total) * 2 * Math.PI - Math.PI / 2; acc += 2 * c.r + GAP; c.cx = rho * Math.cos(c.theta); c.cy = rho * Math.sin(c.theta); });
    };
    const clear = () => ring.every((c, i) => {
      const o = ring[(i + 1) % ring.length];
      const hubOk = !hub || Math.hypot(c.cx, c.cy) >= hub.r + c.r + GAP * 0.5;
      return hubOk && (ring.length < 2 || Math.hypot(c.cx - o.cx, c.cy - o.cy) >= c.r + o.r + GAP * 0.5);
    });
    place();
    for (let k = 0; k < 400 && !clear(); k++) { rho *= 1.04; place(); }
    for (const c of ring) c.cx *= 1.45; // stretch sideways: the stage is wider than tall, and this never brings clusters closer
  }

  const pos = new Map();
  for (const c of clusters) {
    c.list.forEach((n, i) => {
      const rr = i === 0 ? 0 : spacing * Math.sqrt(i) * 0.8 + 4;
      const a = i * GOLD;
      pos.set(n.id, { x: c.cx + rr * Math.cos(a), y: c.cy + rr * Math.sin(a), r: nodeRadius(n.n) });
    });
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of clusters) { x0 = Math.min(x0, c.cx - c.r); x1 = Math.max(x1, c.cx + c.r); y0 = Math.min(y0, c.cy - c.r - 24); y1 = Math.max(y1, c.cy + c.r); }
  const pad = 16;
  return { pos, clusters, viewBox: [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2].map(Math.round) };
}
