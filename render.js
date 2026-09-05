// Pure diagram rendering: model -> SVG elements. Shared by the live canvas and the exporters.

export const FR = ['IAC', 'UC', 'SI', 'DC', 'RDF', 'TRE', 'RA'];
// The seven foundational requirements (IEC 62443-3-3), plus other acronyms used in the UI.
export const FR_NAMES = {
  IAC: 'Identification and authentication control',
  UC: 'Use control',
  SI: 'System integrity',
  DC: 'Data confidentiality',
  RDF: 'Restricted data flow',
  TRE: 'Timely response to events',
  RA: 'Resource availability',
};
export const TERM_NAMES = {
  'SL-T': 'Target security level',
  SuC: 'System under consideration',
  DMZ: 'Demilitarised zone',
  ZCR: 'Zone and conduit requirement (IEC 62443-3-2)',
  SIS: 'Safety instrumented system',
};

// Long-form description of an SL-T vector, used as a hover tooltip.
export function slTitle(sl) {
  if (!sl) return '';
  const set = sl.filter((v) => v != null);
  const uniq = new Set(set);
  if (uniq.size === 1 && set.length === 7) return `Target security level ${set[0]} across all seven foundational requirements (${FR.map((f) => `${f} = ${FR_NAMES[f]}`).join(', ')})`;
  return 'Target security level per foundational requirement: ' + FR.map((f, i) => `${f} (${FR_NAMES[f]}) ${sl[i] == null ? '-' : sl[i]}`).join(', ');
}
export const NS = 'http://www.w3.org/2000/svg';

export const DEFAULTS = {
  zoneFill: '#1e3a5f',     // dark blue rounded rectangles, per the TS 50701 figures
  subFill: '#dde1e6',      // light grey square-cornered subsystem groupings
  conduitFill: '#8fbf7f',  // pale green conduit pills
  canvasFill: '#f9fafb',
  bands: false,
  band1: 260,
  band2: 560,
  band3: 800,
  snap: true,
};

// Function-class colour scheme from the TS 50701 figures, offered as zone presets.
export const PRESETS = [
  ['#1e3a5f', 'Zone default'],
  ['#b0413e', 'Signalling / safety'],
  ['#c07f2a', 'Command and control'],
  ['#3e7d4e', 'Auxiliary'],
  ['#7a8c3a', 'Comfort'],
  ['#2e6da4', 'Public'],
  ['#6b7280', 'External / third party'],
];

export function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
}
const inkFor = (fill) => (luminance(fill) < 0.55 ? '#ffffff' : '#1c2430');

export function slSummary(sl) {
  if (!sl) return '';
  const set = sl.filter((v) => v !== null && v !== undefined);
  if (!set.length) return '';
  const uniq = new Set(set);
  return uniq.size === 1 && set.length === 7 ? `SL-T ${set[0]}` : `SL-T (${sl.map((v) => (v == null ? '-' : v)).join(',')})`;
}

export function nodeDepth(doc, n) {
  let d = 0;
  let cur = n;
  while (cur.parent) { d++; cur = doc.nodes.find((x) => x.id === cur.parent) || {}; }
  return d;
}

export function sortedNodes(doc) {
  return [...doc.nodes].sort((a, b) => nodeDepth(doc, a) - nodeDepth(doc, b));
}

// Point where the segment from rect centre towards (tx,ty) crosses the rect border.
export function borderPoint(r, tx, ty) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function conduitEnds(doc, c) {
  const a = doc.nodes.find((n) => n.id === c.a);
  const b = doc.nodes.find((n) => n.id === c.b);
  if (!a || !b) return null;
  const p1 = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
  const p2 = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function nodesBounds(doc, margin = 40) {
  if (!doc.nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of doc.nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin };
}

export function allAssets(doc) {
  const rows = [];
  for (const n of doc.nodes) {
    if (n.kind !== 'zone') continue;
    for (const a of n.assets || []) rows.push({ zone: n, asset: a });
  }
  rows.sort((p, q) => (p.zone.name + p.asset.name).localeCompare(q.zone.name + q.asset.name));
  return rows;
}

export function diagramBounds(doc, margin = 40) {
  return nodesBounds(doc, margin);
}

const ASSET_W = 100, ASSET_H = 24, ASSET_GAP = 6, HEADER_H = 40;

export function assetLayout(n) {
  const cols = Math.max(1, Math.floor((n.w - 16 + ASSET_GAP) / (ASSET_W + ASSET_GAP)));
  const out = [];
  for (let i = 0; i < (n.assets || []).length; i++) {
    const cx = n.x + 8 + (i % cols) * (ASSET_W + ASSET_GAP);
    const cy = n.y + HEADER_H + Math.floor(i / cols) * (ASSET_H + ASSET_GAP);
    if (cy + ASSET_H > n.y + n.h - 6) return { boxes: out, clipped: n.assets.length - out.length };
    out.push({ x: cx, y: cy, w: ASSET_W, h: ASSET_H, asset: n.assets[i] });
  }
  return { boxes: out, clipped: 0 };
}

function conduitStroke(doc, c) {
  return c.fill || doc.settings.conduitFill || DEFAULTS.conduitFill;
}

// Renders the full diagram into `group` (an emptied <g>). Returns element maps for hit-testing.
export function renderDiagram(doc, group, opts = {}) {
  group.replaceChildren();
  const s = doc.settings;
  const nodeEls = new Map(), conduitEls = new Map();

  if (s.bands && !opts.noBands) {
    const b = diagramBounds(doc, 60);
    // Band regions are defined by the three dividers themselves; the outer bands extend at
    // least a little beyond them even when the content sits elsewhere.
    const [yA, yB, yC] = [s.band1, s.band2, s.band3].sort((p, q) => p - q);
    const top = Math.min(b.y, yA - 140), bot = Math.max(b.y + b.h, yC + 140);
    const labels = [
      ['Purdue Level 4 and 5', (top + yA) / 2],
      ['Purdue Level 3 and DMZ', (yA + yB) / 2],
      ['Purdue Level 2', (yB + yC) / 2],
      ['Purdue Level 0 and 1', (yC + bot) / 2],
    ];
    for (const [txt, y] of labels) {
      const t = el('text', { x: b.x + 6, y, class: 'band-label', transform: `rotate(-90 ${b.x + 6} ${y})`, 'text-anchor': 'middle', fill: '#8a94a0', 'font-size': 13 }, txt);
      group.appendChild(t);
    }
    for (const [key, y] of [['band1', s.band1], ['band2', s.band2], ['band3', s.band3]]) {
      // Wide transparent line first (the grab target), dashed visible twin on top.
      group.appendChild(el('line', { x1: b.x, y1: y, x2: b.x + b.w, y2: y, class: 'band-line', 'data-band': key, stroke: 'transparent', 'stroke-width': 16 }));
      group.appendChild(el('line', { x1: b.x, y1: y, x2: b.x + b.w, y2: y, class: 'band-line-vis', 'pointer-events': 'none', stroke: '#9aa4af', 'stroke-dasharray': '7 5' }));
    }
  }

  for (const n of sortedNodes(doc)) {
    const g = el('g', { 'data-id': n.id });
    const isZone = n.kind === 'zone';
    const fill = n.fill || (isZone ? s.zoneFill : s.subFill);
    const ink = inkFor(fill);
    const rect = el('rect', {
      x: n.x, y: n.y, width: n.w, height: n.h, rx: isZone ? 10 : 0,
      fill, 'fill-opacity': isZone ? 1 : 0.9,
      stroke: n.safety ? '#c62828' : (isZone ? '#00000055' : '#9aa4af'),
      'stroke-width': n.safety ? 2.5 : 1.2,
      class: 'node-shape',
    });
    g.appendChild(rect);
    g.appendChild(el('text', { x: n.x + 10, y: n.y + 20, fill: ink, 'font-size': 14, 'font-weight': 600, class: 'node-label' }, n.name));
    const sub = [];
    if (isZone) {
      const sl = slSummary(n.sl);
      if (sl) sub.push(sl);
    }
    if (sub.length) {
      const t = el('text', { x: n.x + 10, y: n.y + 34, fill: ink, 'font-size': 11, opacity: 0.85, class: 'node-label' }, sub.join(' · '));
      if (n.sl) t.appendChild(el('title', {}, slTitle(n.sl)));
      g.appendChild(t);
    }
    if (n.safety) {
      const tw = 62;
      g.appendChild(el('rect', { x: n.x + n.w - tw - 6, y: n.y + 6, width: tw, height: 16, rx: 3, fill: '#c62828', class: 'node-label' }));
      g.appendChild(el('text', { x: n.x + n.w - tw / 2 - 6, y: n.y + 18, fill: '#fff', 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', class: 'node-label' }, 'SAFETY'));
    }
    if (isZone && n.assets && n.assets.length) {
      const { boxes, clipped } = assetLayout(n);
      for (const b of boxes) {
        const af = b.asset.fill || '#ffffff';
        g.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3, fill: af, stroke: '#9aa4af', class: 'asset-box' }));
        const label = b.asset.name || b.asset.type || 'asset';
        g.appendChild(el('text', { x: b.x + b.w / 2, y: b.y + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: inkFor(af), class: 'asset-box' },
          label.length > 16 ? label.slice(0, 15) + '…' : label));
      }
      if (clipped > 0) g.appendChild(el('text', { x: n.x + 10, y: n.y + n.h - 8, 'font-size': 10.5, fill: ink, opacity: 0.8, class: 'node-label' }, `+${clipped} more asset${clipped === 1 ? '' : 's'} (enlarge the zone)`));
    }
    group.appendChild(g);
    nodeEls.set(n.id, g);
  }

  for (const c of doc.conduits) {
    const ends = conduitEnds(doc, c);
    if (!ends) continue;
    const stroke = conduitStroke(doc, c);
    const g = el('g', { 'data-cid': c.id });
    g.appendChild(el('line', { x1: ends.x1, y1: ends.y1, x2: ends.x2, y2: ends.y2, stroke, 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.92 }));
    // Type adornments
    const mx = (ends.x1 + ends.x2) / 2, my = (ends.y1 + ends.y2) / 2;
    const ang = Math.atan2(ends.y2 - ends.y1, ends.x2 - ends.x1);
    if (c.type === 'unidirectional') {
      const tip = c.dir === 'ba' ? { x: ends.x1, y: ends.y1, a: ang + Math.PI } : { x: ends.x2, y: ends.y2, a: ang };
      const a1 = tip.a + 2.6, a2 = tip.a - 2.6, L = 14;
      g.appendChild(el('path', {
        d: `M${tip.x} ${tip.y} L${tip.x + L * Math.cos(a1)} ${tip.y + L * Math.sin(a1)} L${tip.x + L * Math.cos(a2)} ${tip.y + L * Math.sin(a2)} Z`,
        fill: '#2e5324',
      }));
    } else if (c.type === 'filtering') {
      const spots = [];
      if (c.dir !== 'ba') spots.push({ x: ends.x2 - 14 * Math.cos(ang), y: ends.y2 - 14 * Math.sin(ang) });   // at B
      if (c.dir === 'ba' || c.dir === 'both') spots.push({ x: ends.x1 + 14 * Math.cos(ang), y: ends.y1 + 14 * Math.sin(ang) }); // at A
      for (const t of spots) g.appendChild(el('g', { transform: `translate(${t.x} ${t.y}) rotate(${ang * 180 / Math.PI + 90})` })).append(
        el('rect', { x: -9, y: -7, width: 18, height: 14, fill: '#b3542e', stroke: '#5d2c17' }),
        el('line', { x1: -9, y1: -2.3, x2: 9, y2: -2.3, stroke: '#5d2c17' }),
        el('line', { x1: -9, y1: 2.3, x2: 9, y2: 2.3, stroke: '#5d2c17' }),
        el('line', { x1: 0, y1: -7, x2: 0, y2: -2.3, stroke: '#5d2c17' }),
        el('line', { x1: -4.5, y1: -2.3, x2: -4.5, y2: 2.3, stroke: '#5d2c17' }),
        el('line', { x1: 4.5, y1: -2.3, x2: 4.5, y2: 2.3, stroke: '#5d2c17' }),
        el('line', { x1: 0, y1: 2.3, x2: 0, y2: 7, stroke: '#5d2c17' }),
      );
    } else {
      for (const p of [{ x: ends.x1, y: ends.y1 }, { x: ends.x2, y: ends.y2 }]) {
        g.appendChild(el('rect', { x: p.x - 5, y: p.y - 5, width: 10, height: 10, fill: '#ffffff', stroke: '#2e5324', 'stroke-width': 1.5 }));
      }
    }
    // Label chip
    const labelBits = [c.name || 'Conduit'];
    const sl = slSummary(c.sl);
    if (sl) labelBits.push(sl);
    const label = labelBits.join(' · ');
    const lw = Math.max(56, label.length * 6.4 + 16);
    const chipInk = inkFor(stroke);
    g.appendChild(el('rect', { x: mx - lw / 2, y: my - 11, width: lw, height: 22, rx: 11, fill: stroke, stroke: c.safety ? '#c62828' : '#00000033', 'stroke-width': c.safety ? 2 : 1 }));
    const chipText = el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 11, fill: chipInk }, label);
    if (c.sl) chipText.appendChild(el('title', {}, slTitle(c.sl)));
    g.appendChild(chipText);
    group.appendChild(g);
    conduitEls.set(c.id, g);
  }

  return { nodeEls, conduitEls };
}
