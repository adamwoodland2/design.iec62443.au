// Zone & Conduit Designer - model, canvas interaction, properties panel, persistence.
import { FR, FR_NAMES, TERM_NAMES, NS, el, DEFAULTS, PRESETS, renderDiagram, diagramBounds, allAssets, sortedNodes, slSummary } from './render.js';
import { toXML, fromXML, exportSvgString, exportPngBlob, exportDrawio, exportVsdx, download, fileStem } from './exports.js';

const $ = (s) => document.querySelector(s);
const svg = $('#canvas');
const gDiagram = document.createElementNS(NS, 'g');
const gUI = document.createElementNS(NS, 'g');
svg.append(gDiagram, gUI);

// ------------------------------------------------------------------ state

function newDoc() {
  return { schema: 1, title: 'Untitled design', suc: '', settings: { ...DEFAULTS }, nodes: [], conduits: [], nextId: 1 };
}

// A small "one of everything" starter: subsystem, nested zones, a safety zone with an
// east-west data diode, all three conduit types, assets, SL-T vector/uniform/absent.
function exampleDoc() {
  const blank = { fill: null, safety: false, sl: null, org: '', lboundary: '', pboundary: '', accessLogical: '', accessPhysical: '', dataflows: '', notes: '' };
  return {
    schema: 1,
    title: 'Example - water treatment plant',
    suc: 'Example system under consideration: the OT estate of a small water treatment plant. Load your own scope over the top of it, or File > New for a blank canvas.',
    settings: { ...DEFAULTS, bands: true, band1: 250, band2: 560, band3: 830 },
    nextId: 20,
    nodes: [
      { ...blank, id: 'z1', kind: 'zone', name: 'Enterprise IT', parent: null, x: 140, y: 80, w: 320, h: 140, fill: '#2e6da4',
        org: 'IT department', lboundary: 'Corporate LAN', notes: 'Business systems - outside the OT scope, shown for context (ZCR 3.2).',
        assets: [{ id: 'ex-a1', name: 'ERP', type: 'Server', fill: null }] },
      { ...blank, id: 'z2', kind: 'zone', name: 'OT DMZ', parent: null, x: 140, y: 340, w: 320, h: 130, sl: [2, 2, 2, 2, 2, 2, 2],
        org: 'Operations', lboundary: 'DMZ VLAN', accessLogical: 'FW-1 (north), FW-2 (south)', dataflows: 'Historian replication northbound; patch distribution southbound.',
        assets: [{ id: 'ex-a2', name: 'Historian mirror', type: 'Historian', fill: null }, { id: 'ex-a3', name: 'Patch server', type: 'Server', fill: null }] },
      { ...blank, id: 'z3', kind: 'zone', name: 'Remote access', parent: null, x: 580, y: 340, w: 220, h: 130, fill: '#6b7280', sl: [2, 2, 2, 2, 2, 2, 2],
        org: 'Operations', notes: 'Devices reachable from external networks live in their own zone (ZCR 3.6).',
        assets: [{ id: 'ex-a4', name: 'Jump host', type: 'Server', fill: null }] },
      { ...blank, id: 's1', kind: 'subsystem', name: 'Plant A', parent: null, x: 80, y: 590, w: 780, h: 310 },
      { ...blank, id: 'z4', kind: 'zone', name: 'Control zone', parent: 's1', x: 120, y: 640, w: 330, h: 230, sl: [3, 3, 3, 2, 2, 3, 2],
        org: 'Operations', lboundary: 'Control VLAN', pboundary: 'Control room and plant floor', accessLogical: 'FW-2', accessPhysical: 'Control room door',
        dataflows: 'OPC UA to the DMZ historian; engineering access from the engineering zone.',
        assets: [{ id: 'ex-a5', name: 'SCADA', type: 'Server', fill: '#c07f2a' }, { id: 'ex-a6', name: 'HMI-01', type: 'HMI', fill: null }, { id: 'ex-a7', name: 'PLC-01', type: 'PLC', fill: null }, { id: 'ex-a8', name: 'PLC-02', type: 'PLC', fill: null }] },
      { ...blank, id: 'z5', kind: 'zone', name: 'Engineering', parent: 's1', x: 480, y: 630, w: 160, h: 100, sl: [3, 3, 3, 3, 3, 3, 3],
        org: 'Operations', notes: 'Engineering workstations, separated so temporary connections stay out of the control zone (ZCR 3.4).',
        assets: [{ id: 'ex-a9', name: 'EWS-01', type: 'Engineering WS', fill: null }] },
      { ...blank, id: 'z6', kind: 'zone', name: 'Safety', parent: 's1', x: 670, y: 640, w: 170, h: 230, safety: true, sl: [3, 3, 3, 3, 3, 3, 3],
        org: 'Operations', lboundary: 'Hardwired, no routable path in', notes: 'Safety-related assets in their own zone (ZCR 3.3).',
        assets: [{ id: 'ex-a10', name: 'SIS logic', type: 'Safety controller', fill: null }] },
    ],
    conduits: [
      { ...blank, id: 'c1', name: 'IT to DMZ', a: 'z1', b: 'z2', type: 'filtering', dir: 'ab', sl: [2, 2, 2, 2, 2, 2, 2], channels: 'HTTPS; historian replication' },
      { ...blank, id: 'c2', name: 'DMZ to Control', a: 'z2', b: 'z4', type: 'filtering', dir: 'both', sl: [3, 3, 3, 2, 2, 3, 2], channels: 'OPC UA northbound only' },
      { ...blank, id: 'c3', name: 'Remote maintenance', a: 'z3', b: 'z2', type: 'filtering', dir: 'ab', sl: [2, 2, 2, 2, 2, 2, 2], channels: 'TLS VPN, MFA' },
      { ...blank, id: 'c4', name: 'Engineering link', a: 'z5', b: 'z4', type: 'gateway', dir: 'ab', sl: [3, 3, 3, 3, 3, 3, 3], channels: 'Engineering protocol (equal SL-T, transparent)' },
      { ...blank, id: 'c5', name: 'SIS feed', a: 'z4', b: 'z6', type: 'unidirectional', dir: 'ba', safety: true, sl: [3, 3, 3, 3, 3, 3, 3], channels: 'Data diode: process data out of the safety zone only' },
    ],
  };
}
let doc = newDoc();
let sel = null;                       // {type:'node'|'conduit', id}
let tool = 'select';
let undoStack = [], redoStack = [];
let view = { x: -60, y: -60, w: 1400 };

const uid = (p) => `${p}${doc.nextId++}`;
const nodeById = (id) => doc.nodes.find((n) => n.id === id);
const conduitById = (id) => doc.conduits.find((c) => c.id === id);

function descendants(id) {
  const out = [];
  const walk = (pid) => { for (const n of doc.nodes) if (n.parent === pid) { out.push(n); walk(n.id); } };
  walk(id);
  return out;
}

// ------------------------------------------------------------------ persistence

const AUTOSAVE_KEY = 'zcd-current', SAVES_KEY = 'zcd-saves';
let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc)); } catch (e) { /* full/blocked: keep working */ }
  }, 400);
}
function loadAutosave() {
  try {
    const d = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
    if (d && d.schema === 1 && Array.isArray(d.nodes)) { doc = { ...newDoc(), ...d, settings: { ...DEFAULTS, ...d.settings } }; return; }
  } catch (e) { /* ignore */ }
  doc = exampleDoc();   // first visit: start from the example rather than a blank canvas
}
function getSaves() {
  try { return JSON.parse(localStorage.getItem(SAVES_KEY) || '{}'); } catch (e) { return {}; }
}
function putSaves(s) {
  try { localStorage.setItem(SAVES_KEY, JSON.stringify(s)); } catch (e) { alert('Could not save - browser storage is full or blocked.'); }
}

// ------------------------------------------------------------------ undo / commit

function pushUndo() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(doc));
  doc = JSON.parse(undoStack.pop());
  sel = validSel(sel);
  draw(); buildPanel(); autosave();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(doc));
  doc = JSON.parse(redoStack.pop());
  sel = validSel(sel);
  draw(); buildPanel(); autosave();
}
function validSel(s) {
  if (!s) return null;
  if (s.type === 'node' && !nodeById(s.id)) return null;
  if (s.type === 'conduit' && !conduitById(s.id)) return null;
  return s;
}

// ------------------------------------------------------------------ drawing

function applyView() {
  const r = svg.getBoundingClientRect();
  const h = view.w * (r.height / Math.max(1, r.width));
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
}
function draw() {
  svg.style.background = doc.settings.canvasFill || DEFAULTS.canvasFill;
  renderDiagram(doc, gDiagram);
  gUI.replaceChildren();
  for (const c of doc.conduits) {
    const a = nodeById(c.a), b = nodeById(c.b);
    if (!a || !b) continue;
    gUI.appendChild(el('line', {
      x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2,
      class: 'conduit-hit', 'data-cid': c.id,
    }));
  }
  if (sel && sel.type === 'node') {
    const n = nodeById(sel.id);
    if (n) {
      gUI.appendChild(el('rect', { x: n.x - 3, y: n.y - 3, width: n.w + 6, height: n.h + 6, class: 'selected-outline' }));
      for (const [cx, cy, corner] of [[n.x, n.y, 'nw'], [n.x + n.w, n.y, 'ne'], [n.x, n.y + n.h, 'sw'], [n.x + n.w, n.y + n.h, 'se']]) {
        gUI.appendChild(el('rect', { x: cx - 5, y: cy - 5, width: 10, height: 10, class: 'handle', 'data-handle': corner }));
      }
    }
  }
  if (sel && sel.type === 'conduit') {
    const c = conduitById(sel.id);
    const a = c && nodeById(c.a), b = c && nodeById(c.b);
    if (a && b) {
      gUI.appendChild(el('line', {
        x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2,
        stroke: '#1e5aa8', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
      }));
    }
  }
  if (typeof buildTables === 'function') buildTables();
}

// ------------------------------------------------------------------ coordinates & picking

function toWorld(e) {
  const r = svg.getBoundingClientRect();
  const h = view.w * (r.height / Math.max(1, r.width));
  return { x: view.x + (e.clientX - r.left) / r.width * view.w, y: view.y + (e.clientY - r.top) / r.height * h };
}
const snap = (v) => (doc.settings.snap ? Math.round(v / 10) * 10 : Math.round(v));

function nodeAt(x, y, exclude = new Set()) {
  // Deepest (drawn last) node containing the point.
  const list = sortedNodes(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    if (exclude.has(n.id)) continue;
    if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
  }
  return null;
}
function containerFor(rect, exclude) {
  const list = sortedNodes(doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    if (exclude.has(n.id)) continue;
    if (rect.x >= n.x && rect.y >= n.y && rect.x + rect.w <= n.x + n.w && rect.y + rect.h <= n.y + n.h) return n;
  }
  return null;
}

// ------------------------------------------------------------------ tools & hint

const hint = $('#hint');
const HINTS = {
  zone: 'Drag on the canvas to draw the zone (or click for a default size). Drop inside another shape to nest.',
  subsystem: 'Drag on the canvas to draw the subsystem grouping.',
  conduit: 'Click the first zone, then the second. Esc cancels.',
};
function setTool(t) {
  tool = t;
  conduitFrom = null;
  for (const [id, name] of [['toolSelect', 'select'], ['toolZone', 'zone'], ['toolSubsystem', 'subsystem'], ['toolConduit', 'conduit']]) {
    $('#' + id).classList.toggle('active', name === t);
  }
  hint.hidden = !HINTS[t];
  if (HINTS[t]) hint.textContent = HINTS[t];
  draw();
}
$('#toolSelect').addEventListener('click', () => setTool('select'));
$('#toolZone').addEventListener('click', () => setTool('zone'));
$('#toolSubsystem').addEventListener('click', () => setTool('subsystem'));
$('#toolConduit').addEventListener('click', () => setTool('conduit'));

// ------------------------------------------------------------------ pointer interaction

let drag = null;        // {mode, ...}
let conduitFrom = null;

svg.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  const p = toWorld(e);
  svg.setPointerCapture(e.pointerId);

  const handleEl = e.target.closest('.handle');
  const bandEl = e.target.closest('.band-line');
  const hitConduit = e.target.closest('[data-cid]');
  const hitNodeEl = e.target.closest('[data-id]');
  const hitNode = hitNodeEl ? nodeById(hitNodeEl.dataset.id) : null;

  if (tool === 'zone' || tool === 'subsystem') {
    drag = { mode: 'create', kind: tool, x0: p.x, y0: p.y, rect: null };
    return;
  }
  if (tool === 'conduit') {
    if (hitNode) {
      if (!conduitFrom) {
        conduitFrom = hitNode.id;
        hitNodeEl.classList.add('conduit-pick');
        hint.textContent = `From "${hitNode.name}" - now click the second zone.`;
      } else if (conduitFrom !== hitNode.id) {
        pushUndo();
        const c = {
          id: uid('c'), name: 'Conduit', a: conduitFrom, b: hitNode.id,
          type: 'gateway', dir: 'ab', fill: null, safety: false, sl: null,
          org: '', lboundary: '', pboundary: '', accessLogical: '', accessPhysical: '', dataflows: '', channels: '', notes: '',
        };
        doc.conduits.push(c);
        sel = { type: 'conduit', id: c.id };
        setTool('select');
        draw(); buildPanel(); autosave();
      }
    } else { conduitFrom = null; setTool('conduit'); }
    return;
  }

  // select tool
  if (handleEl && sel && sel.type === 'node') {
    drag = { mode: 'resize', corner: handleEl.dataset.handle, id: sel.id, done: false };
    return;
  }
  if (bandEl) {
    drag = { mode: 'band', key: bandEl.dataset.band, done: false };
    return;
  }
  if (hitConduit) {
    sel = { type: 'conduit', id: hitConduit.dataset.cid };
    draw(); buildPanel();
    return;
  }
  if (hitNode) {
    sel = { type: 'node', id: hitNode.id };
    const ids = new Set([hitNode.id, ...descendants(hitNode.id).map((n) => n.id)]);
    drag = { mode: 'move', ids, x0: p.x, y0: p.y, orig: new Map([...ids].map((id) => { const n = nodeById(id); return [id, { x: n.x, y: n.y }]; })), moved: false };
    draw(); buildPanel();
    return;
  }
  sel = null;
  drag = { mode: 'pan', x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y };
  draw(); buildPanel();
});

svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toWorld(e);
  if (drag.mode === 'pan') {
    const r = svg.getBoundingClientRect();
    view.x = drag.vx - (e.clientX - drag.x0) / r.width * view.w;
    view.y = drag.vy - (e.clientY - drag.y0) / r.width * view.w;
    applyView();
  } else if (drag.mode === 'create') {
    drag.rect = { x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
    let pv = gUI.querySelector('.create-preview');
    if (!pv) { pv = el('rect', { class: 'create-preview', fill: 'none', stroke: '#1e5aa8', 'stroke-dasharray': '5 3' }); gUI.appendChild(pv); }
    pv.setAttribute('x', drag.rect.x); pv.setAttribute('y', drag.rect.y);
    pv.setAttribute('width', drag.rect.w); pv.setAttribute('height', drag.rect.h);
  } else if (drag.mode === 'move') {
    if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 3) { pushUndo(); drag.moved = true; }
    if (!drag.moved) return;
    const dx = p.x - drag.x0, dy = p.y - drag.y0;
    for (const id of drag.ids) {
      const n = nodeById(id), o = drag.orig.get(id);
      n.x = snap(o.x + dx); n.y = snap(o.y + dy);
    }
    draw();
  } else if (drag.mode === 'resize') {
    if (!drag.done) { pushUndo(); drag.done = true; }
    const n = nodeById(drag.id);
    const x2 = n.x + n.w, y2 = n.y + n.h;
    if (drag.corner.includes('w')) { n.w = Math.max(80, x2 - snap(p.x)); n.x = x2 - n.w; }
    if (drag.corner.includes('e')) { n.w = Math.max(80, snap(p.x) - n.x); }
    if (drag.corner.includes('n')) { n.h = Math.max(50, y2 - snap(p.y)); n.y = y2 - n.h; }
    if (drag.corner.includes('s')) { n.h = Math.max(50, snap(p.y) - n.y); }
    draw();
  } else if (drag.mode === 'band') {
    if (!drag.done) { pushUndo(); drag.done = true; }
    doc.settings[drag.key] = snap(p.y);
    draw();
  }
});

svg.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === 'create') {
    pushUndo();
    const p = toWorld(e);
    const r = d.rect && d.rect.w > 30 && d.rect.h > 30 ? d.rect : { x: p.x - 110, y: p.y - 70, w: 220, h: 140 };
    const rect = { x: snap(r.x), y: snap(r.y), w: Math.max(80, snap(r.w)), h: Math.max(50, snap(r.h)) };
    const isZone = d.kind === 'zone';
    const n = {
      id: uid(isZone ? 'z' : 's'), kind: d.kind,
      name: isZone ? `Zone ${doc.nodes.filter((x) => x.kind === 'zone').length + 1}` : `Subsystem ${doc.nodes.filter((x) => x.kind === 'subsystem').length + 1}`,
      parent: null, ...rect, fill: null, safety: false, sl: null, assets: [],
      org: '', lboundary: '', pboundary: '', accessLogical: '', accessPhysical: '', dataflows: '', notes: '',
    };
    const parent = containerFor(rect, new Set());
    if (parent) n.parent = parent.id;
    doc.nodes.push(n);
    sel = { type: 'node', id: n.id };
    setTool('select');
    draw(); buildPanel(); autosave();
  } else if (d.mode === 'move' && d.moved) {
    const n = nodeById(sel.id);
    const parent = containerFor(n, new Set([n.id, ...descendants(n.id).map((x) => x.id)]));
    n.parent = parent ? parent.id : null;
    draw(); buildPanel(); autosave();
  } else if ((d.mode === 'resize' || d.mode === 'band') && d.done) {
    autosave(); if (d.mode === 'resize') buildPanel();
  }
});

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = toWorld(e);
  const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
  view.w = Math.min(8000, Math.max(300, view.w * k));
  const r = svg.getBoundingClientRect();
  const h = view.w * (r.height / Math.max(1, r.width));
  view.x = p.x - (e.clientX - r.left) / r.width * view.w;
  view.y = p.y - (e.clientY - r.top) / r.height * h;
  applyView();
}, { passive: false });

svg.addEventListener('dblclick', (e) => {
  const hit = e.target.closest('[data-id],[data-cid]');
  if (!hit) return;
  sel = hit.dataset.cid ? { type: 'conduit', id: hit.dataset.cid } : { type: 'node', id: hit.dataset.id };
  draw(); buildPanel();
  const name = $('#propForm input[name="name"]');
  if (name) { name.focus(); name.select(); }
});

// ------------------------------------------------------------------ keyboard

document.addEventListener('keydown', (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); redo(); return; }
  if (inField) return;
  if (e.key === 'Escape') { setTool('select'); sel = null; draw(); buildPanel(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
  const tools = { v: 'select', z: 'zone', s: 'subsystem', c: 'conduit' };
  if (tools[e.key.toLowerCase()]) { setTool(tools[e.key.toLowerCase()]); return; }
  if (sel && sel.type === 'node' && e.key.startsWith('Arrow')) {
    e.preventDefault();
    pushUndo();
    const d = e.shiftKey ? 10 : 2;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    for (const n of [nodeById(sel.id), ...descendants(sel.id)]) { n.x += dx; n.y += dy; }
    draw(); autosave();
  }
});

function deleteSelection() {
  if (!sel) return;
  pushUndo();
  if (sel.type === 'node') {
    const dead = new Set([sel.id, ...descendants(sel.id).map((n) => n.id)]);
    doc.nodes = doc.nodes.filter((n) => !dead.has(n.id));
    doc.conduits = doc.conduits.filter((c) => !dead.has(c.a) && !dead.has(c.b));
  } else {
    doc.conduits = doc.conduits.filter((c) => c.id !== sel.id);
  }
  sel = null;
  draw(); buildPanel(); autosave();
}

// ------------------------------------------------------------------ properties panel

const form = $('#propForm');
const empty = $('#propNone');

function field(labelText, input, optional) {
  const l = document.createElement('label');
  l.textContent = labelText;
  if (optional) {
    const o = document.createElement('span');
    o.className = 'opt';
    o.textContent = ' (if applicable)';
    l.appendChild(o);
  }
  form.append(l, input);
  return input;
}
function textInput(name, value) {
  const i = document.createElement('input');
  i.type = 'text'; i.name = name; i.value = value || '';
  return i;
}
function textArea(name, value, rows = 2) {
  const t = document.createElement('textarea');
  t.name = name; t.value = value || ''; t.rows = rows;
  return t;
}

function bindText(inp, obj, key) {
  inp.addEventListener('input', () => { obj[key] = inp.value; draw(); autosave(); });
  inp.addEventListener('change', () => pushUndo());
}

// A label with hover tooltips on every acronym: "Target security level SL-T (IAC, UC, ...)".
function slLabel() {
  const l = document.createElement('label');
  const abbr = (txt, full) => { const a = document.createElement('abbr'); a.textContent = txt; a.title = full; return a; };
  l.append('Target security level ', abbr('SL-T', TERM_NAMES['SL-T']), ' (');
  FR.forEach((fr, i) => { if (i) l.append(', '); l.append(abbr(fr, FR_NAMES[fr])); });
  l.append(')');
  return l;
}

function slEditor(obj) {
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'sl-grid';
  for (const fr of FR) { const d = document.createElement('div'); d.className = 'fr'; d.textContent = fr; d.title = FR_NAMES[fr]; grid.appendChild(d); }
  const sels = FR.map((fr, i) => {
    const s = document.createElement('select');
    s.append(new Option('-', ''));
    for (let v = 0; v <= 4; v++) s.append(new Option(String(v), String(v)));
    s.value = obj.sl && obj.sl[i] != null ? String(obj.sl[i]) : '';
    s.title = `${fr} - ${FR_NAMES[fr]}`;
    s.addEventListener('change', () => {
      pushUndo();
      if (!obj.sl) obj.sl = [null, null, null, null, null, null, null];
      obj.sl[i] = s.value === '' ? null : +s.value;
      if (!obj.sl.some((v) => v != null)) obj.sl = null;
      draw(); autosave();
    });
    grid.appendChild(s);
    return s;
  });
  const row = document.createElement('div');
  row.className = 'sl-row';
  const all = document.createElement('select');
  all.append(new Option('Set all to…', ''));
  for (let v = 0; v <= 4; v++) all.append(new Option(`SL ${v}`, String(v)));
  all.addEventListener('change', () => {
    if (all.value === '') return;
    pushUndo();
    obj.sl = Array(7).fill(+all.value);
    sels.forEach((s) => { s.value = all.value; });
    all.value = '';
    draw(); autosave();
  });
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'small'; clear.textContent = 'Clear';
  clear.title = 'No SL-T (for example covered by a code of practice)';
  clear.addEventListener('click', () => { pushUndo(); obj.sl = null; sels.forEach((s) => { s.value = ''; }); draw(); autosave(); });
  row.append(all, clear);
  wrap.append(grid, row);
  return wrap;
}

function colourEditor(obj, defaultFill) {
  const row = document.createElement('div');
  row.className = 'colour-row';
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = obj.fill || defaultFill;
  inp.addEventListener('change', () => { pushUndo(); obj.fill = inp.value; draw(); autosave(); });
  row.appendChild(inp);
  for (const [hex, name] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.title = name;
    b.style.background = hex;
    b.addEventListener('click', () => { pushUndo(); obj.fill = hex; inp.value = hex; draw(); autosave(); });
    row.appendChild(b);
  }
  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'small'; reset.textContent = 'Default';
  reset.addEventListener('click', () => { pushUndo(); obj.fill = null; inp.value = defaultFill; draw(); autosave(); });
  row.appendChild(reset);
  return row;
}

const ASSET_TYPES = ['PLC', 'RTU', 'IED', 'HMI', 'Engineering WS', 'Historian', 'Server', 'Database', 'Switch', 'Router', 'Firewall', 'Data diode', 'Wireless AP', 'Gateway', 'Sensor/Actuator', 'Drive', 'Safety controller', 'Printer', 'Camera', 'Other'];

function assetsEditor(n) {
  const wrap = document.createElement('div');
  const ul = document.createElement('ul');
  ul.className = 'assets-list';
  const rebuild = () => {
    ul.replaceChildren();
    for (const a of n.assets) {
      const li = document.createElement('li');
      const name = document.createElement('input');
      name.type = 'text'; name.value = a.name; name.placeholder = 'Name';
      name.addEventListener('input', () => { a.name = name.value; draw(); autosave(); });
      name.addEventListener('change', () => pushUndo());
      const type = document.createElement('select');
      for (const t of ASSET_TYPES) type.append(new Option(t, t));
      type.value = ASSET_TYPES.includes(a.type) ? a.type : 'Other';
      type.addEventListener('change', () => { pushUndo(); a.type = type.value; draw(); autosave(); });
      const col = document.createElement('input');
      col.type = 'color'; col.className = 'asset-colour'; col.value = a.fill || '#ffffff';
      col.title = 'Asset colour';
      col.addEventListener('change', () => { pushUndo(); a.fill = col.value === '#ffffff' ? null : col.value; draw(); autosave(); });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.title = 'Remove asset';
      del.addEventListener('click', () => { pushUndo(); n.assets = n.assets.filter((x) => x !== a); rebuild(); draw(); autosave(); });
      li.append(name, type, col, del);
      ul.appendChild(li);
    }
  };
  rebuild();
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'small'; add.textContent = '+ Add asset';
  add.addEventListener('click', () => {
    pushUndo();
    n.assets.push({ id: crypto.randomUUID(), name: '', type: 'PLC', ip: '', note: '' });
    rebuild(); draw(); autosave();
    const inp = ul.querySelector('li:last-child input');
    if (inp) inp.focus();
  });
  wrap.append(ul, add);
  return wrap;
}

function commonFields(obj) {
  bindText(field('Accountable organisation(s)', textInput('org', obj.org)), obj, 'org');
  bindText(field('Logical boundary', textArea('lboundary', obj.lboundary)), obj, 'lboundary');
  bindText(field('Physical boundary', textArea('pboundary', obj.pboundary), true), obj, 'pboundary');
  bindText(field('Logical access points', textArea('accessLogical', obj.accessLogical)), obj, 'accessLogical');
  bindText(field('Physical access points', textArea('accessPhysical', obj.accessPhysical), true), obj, 'accessPhysical');
  bindText(field('Data flows at the access points', textArea('dataflows', obj.dataflows)), obj, 'dataflows');
  bindText(field('Notes', textArea('notes', obj.notes)), obj, 'notes');
}

function buildPanel() {
  if (!sel) {
    form.hidden = true;
    empty.hidden = false;
    buildDocPanel();
    return;
  }
  empty.hidden = true;
  form.hidden = false;
  form.replaceChildren();

  if (sel.type === 'node') {
    const n = nodeById(sel.id);
    if (!n) { sel = null; buildPanel(); return; }
    const isZone = n.kind === 'zone';
    const tag = document.createElement('div');
    tag.className = 'kind-tag';
    tag.textContent = isZone ? 'Zone' : 'Subsystem (grouping)';
    form.appendChild(tag);
    const name = field('Name', textInput('name', n.name));
    bindText(name, n, 'name');

    if (isZone) {
      const chk = document.createElement('label');
      chk.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!n.safety;
      cb.addEventListener('change', () => { pushUndo(); n.safety = cb.checked; draw(); autosave(); });
      chk.append(cb, document.createTextNode('Safety-related zone'));
      form.appendChild(chk);
      form.append(slLabel(), slEditor(n));
    }

    const cl = document.createElement('label');
    cl.textContent = 'Colour';
    form.append(cl, colourEditor(n, isZone ? doc.settings.zoneFill : doc.settings.subFill));

    commonFields(n);

    if (isZone) {
      const al = document.createElement('label');
      al.textContent = 'Assets in this zone';
      form.append(al, assetsEditor(n));
      const conns = doc.conduits.filter((c) => c.a === n.id || c.b === n.id);
      if (conns.length) {
        const cLbl = document.createElement('label');
        cLbl.textContent = 'Connected by';
        const p = document.createElement('p');
        p.className = 'fine';
        p.textContent = conns.map((c) => {
          const other = nodeById(c.a === n.id ? c.b : c.a);
          return `${c.name} → ${other ? other.name : '?'}`;
        }).join('; ');
        form.append(cLbl, p);
      }
    }
  } else {
    const c = conduitById(sel.id);
    if (!c) { sel = null; buildPanel(); return; }
    const a = nodeById(c.a), b = nodeById(c.b);
    const tag = document.createElement('div');
    tag.className = 'kind-tag';
    tag.textContent = `Conduit: ${a ? a.name : '?'} ↔ ${b ? b.name : '?'}`;
    form.appendChild(tag);
    bindText(field('Name', textInput('name', c.name)), c, 'name');

    const type = document.createElement('select');
    type.append(new Option('Gateway (equal SLs, transparent)', 'gateway'));
    type.append(new Option('Filtering (firewall towards the higher SL)', 'filtering'));
    type.append(new Option('Unidirectional (data diode)', 'unidirectional'));
    type.value = c.type;
    type.addEventListener('change', () => {
      pushUndo();
      c.type = type.value;
      if (c.type !== 'filtering' && c.dir === 'both') c.dir = 'ab';
      draw(); autosave(); buildPanel();
    });
    field('Conduit type', type);

    if (c.type !== 'gateway' && a && b) {
      const dir = document.createElement('select');
      const toB = c.type === 'unidirectional' ? `Flow ${a.name} → ${b.name}` : `Security device at ${b.name}`;
      const toA = c.type === 'unidirectional' ? `Flow ${b.name} → ${a.name}` : `Security device at ${a.name}`;
      dir.append(new Option(toB, 'ab'), new Option(toA, 'ba'));
      if (c.type === 'filtering') dir.append(new Option('Security device at both ends', 'both'));
      dir.value = c.dir;
      dir.addEventListener('change', () => { pushUndo(); c.dir = dir.value; draw(); autosave(); });
      field(c.type === 'unidirectional' ? 'Direction' : 'Device placement', dir);
    }

    const chk = document.createElement('label');
    chk.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!c.safety;
    cb.addEventListener('change', () => { pushUndo(); c.safety = cb.checked; draw(); autosave(); });
    chk.append(cb, document.createTextNode('Safety-related conduit'));
    form.appendChild(chk);

    form.append(slLabel(), slEditor(c));

    const cl = document.createElement('label');
    cl.textContent = 'Colour';
    form.append(cl, colourEditor(c, doc.settings.conduitFill));

    bindText(field('Communication channels (protocols, links)', textArea('channels', c.channels)), c, 'channels');
    commonFields(c);
  }

  const actions = document.createElement('div');
  actions.className = 'prop-actions';
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'small danger';
  del.textContent = sel.type === 'node' ? 'Delete (incl. contents)' : 'Delete conduit';
  del.addEventListener('click', deleteSelection);
  actions.appendChild(del);
  form.appendChild(actions);
}

function buildDocPanel() {
  let extra = empty.querySelector('.doc-fields');
  if (!extra) {
    extra = document.createElement('div');
    extra.className = 'doc-fields';
    const t = document.createElement('label');
    t.textContent = 'Diagram title';
    const ti = document.createElement('input');
    ti.type = 'text'; ti.id = 'docTitle';
    const s = document.createElement('label');
    s.textContent = 'System under consideration (SuC)';
    const si = document.createElement('textarea');
    si.id = 'docSuc'; si.rows = 3; si.placeholder = 'Scope, perimeter, essential functions…';
    extra.append(t, ti, s, si);
    empty.prepend(extra);
    ti.addEventListener('input', () => { doc.title = ti.value; autosave(); });
    si.addEventListener('input', () => { doc.suc = si.value; autosave(); });
  }
  extra.querySelector('#docTitle').value = doc.title;
  extra.querySelector('#docSuc').value = doc.suc;
}

// ------------------------------------------------------------------ dialogs

for (const dlg of document.querySelectorAll('dialog')) {
  dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close());
}
$('#fileBtn').addEventListener('click', () => { refreshSaves(); $('#fileDlg').showModal(); });
$('#exportBtn').addEventListener('click', () => $('#exportDlg').showModal());
$('#helpBtn').addEventListener('click', () => $('#helpDlg').showModal());
$('#settingsBtn').addEventListener('click', () => {
  const s = doc.settings;
  $('#setZoneFill').value = s.zoneFill;
  $('#setSubFill').value = s.subFill;
  $('#setConduitFill').value = s.conduitFill;
  $('#setCanvasFill').value = s.canvasFill;
  $('#setBands').checked = !!s.bands;
  $('#setSnap').checked = !!s.snap;
  $('#settingsDlg').showModal();
});
for (const [id, key] of [['setZoneFill', 'zoneFill'], ['setSubFill', 'subFill'], ['setConduitFill', 'conduitFill'], ['setCanvasFill', 'canvasFill']]) {
  $('#' + id).addEventListener('change', (e) => { pushUndo(); doc.settings[key] = e.target.value; draw(); autosave(); });
}
$('#setBands').addEventListener('change', (e) => { pushUndo(); doc.settings.bands = e.target.checked; draw(); autosave(); });
$('#setSnap').addEventListener('change', (e) => { doc.settings.snap = e.target.checked; autosave(); });
$('#setReset').addEventListener('click', () => {
  pushUndo();
  for (const k of ['zoneFill', 'subFill', 'conduitFill', 'canvasFill']) doc.settings[k] = DEFAULTS[k];
  $('#setZoneFill').value = DEFAULTS.zoneFill;
  $('#setSubFill').value = DEFAULTS.subFill;
  $('#setConduitFill').value = DEFAULTS.conduitFill;
  $('#setCanvasFill').value = DEFAULTS.canvasFill;
  draw(); autosave();
});

function refreshSaves() {
  const list = $('#savedList');
  list.replaceChildren();
  for (const name of Object.keys(getSaves()).sort()) list.append(new Option(name, name));
}
$('#exampleBtn').addEventListener('click', () => {
  if (doc.nodes.length && !confirm('Replace the current diagram with the example? (Save a named copy first if you want to keep it.)')) return;
  pushUndo();
  doc = exampleDoc();
  sel = null;
  draw(); buildPanel(); autosave();
  $('#fileDlg').close();
});
$('#newBtn').addEventListener('click', () => {
  if (doc.nodes.length && !confirm('Start a new blank diagram? The current one stays autosaved only if you saved a named copy.')) return;
  pushUndo();
  doc = newDoc();
  sel = null;
  draw(); buildPanel(); autosave();
  $('#fileDlg').close();
});
$('#saveAsBtn').addEventListener('click', () => {
  const name = prompt('Save as (name in this browser):', doc.title);
  if (!name) return;
  const saves = getSaves();
  saves[name] = doc;
  putSaves(saves);
  doc.title = doc.title === 'Untitled design' ? name : doc.title;
  refreshSaves();
});
$('#loadBtn').addEventListener('click', () => {
  const name = $('#savedList').value;
  if (!name) return;
  const saves = getSaves();
  if (!saves[name]) return;
  pushUndo();
  doc = { ...newDoc(), ...saves[name], settings: { ...DEFAULTS, ...saves[name].settings } };
  sel = null;
  draw(); buildPanel(); autosave();
  $('#fileDlg').close();
});
$('#deleteBtn').addEventListener('click', () => {
  const name = $('#savedList').value;
  if (!name || !confirm(`Delete the saved diagram "${name}" from this browser?`)) return;
  const saves = getSaves();
  delete saves[name];
  putSaves(saves);
  refreshSaves();
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async () => {
  const f = $('#importFile').files[0];
  $('#importFile').value = '';
  if (!f) return;
  try {
    const d = fromXML(await f.text());
    let maxId = 0;
    for (const o of [...d.nodes, ...d.conduits]) { const m = /\d+$/.exec(o.id); if (m) maxId = Math.max(maxId, +m[0]); }
    d.nextId = maxId + 1;
    pushUndo();
    doc = d;
    sel = null;
    draw(); buildPanel(); autosave();
    $('#fileDlg').close();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
});

$('#expXml').addEventListener('click', () => download(`${fileStem(doc)}.xml`, toXML(doc), 'application/xml'));
$('#expSvg').addEventListener('click', () => download(`${fileStem(doc)}.svg`, exportSvgString(doc), 'image/svg+xml'));
$('#expDrawio').addEventListener('click', () => download(`${fileStem(doc)}.drawio`, exportDrawio(doc), 'application/xml'));
$('#expVsdx').addEventListener('click', () => download(`${fileStem(doc)}.vsdx`, new Blob([exportVsdx(doc)], { type: 'application/vnd.ms-visio.drawing' })));
$('#expPng').addEventListener('click', async () => {
  try { download(`${fileStem(doc)}.png`, await exportPngBlob(doc)); }
  catch (e) { alert(`PNG export failed: ${e.message}`); }
});

$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);

// ------------------------------------------------------------------ tables drawer

const drawer = $('#drawer'), drawerBody = $('#drawerBody');
let drawerTab = 'assets';

function slText(sl) { return slSummary(sl).replace(/^SL-T ?/, '') || ''; }
function conduitConnects(c) {
  const a = nodeById(c.a), b = nodeById(c.b);
  const arrow = c.type === 'unidirectional' ? (c.dir === 'ba' ? ' ← ' : ' → ') : ' ↔ ';
  return `${a ? a.name : '?'}${arrow}${b ? b.name : '?'}`;
}
const CONDUIT_TYPE_LABEL = { gateway: 'Conduit (gateway)', filtering: 'Conduit (filtering)', unidirectional: 'Conduit (unidirectional)' };

function tableData() {
  if (drawerTab === 'assets') {
    return {
      head: ['', 'Asset', 'Type', 'Zone', 'Zone SL-T', 'Safety zone'],
      rows: allAssets(doc).map((r) => ({
        sel: { type: 'node', id: r.zone.id },
        cells: [{ swatch: r.asset.fill }, r.asset.name || '(unnamed)', r.asset.type, r.zone.name, slText(r.zone.sl), r.zone.safety ? 'YES' : ''],
      })),
      csvHead: ['Asset', 'Type', 'Zone', 'Zone SL-T', 'Safety zone'],
      csvRows: allAssets(doc).map((r) => [r.asset.name, r.asset.type, r.zone.name, slText(r.zone.sl), r.zone.safety ? 'yes' : 'no']),
      empty: 'No assets yet - add them to a zone via its properties.',
      file: 'assets',
    };
  }
  const items = [
    ...sortedNodes(doc).map((n) => ({ sel: { type: 'node', id: n.id }, o: n, kind: n.kind === 'zone' ? 'Zone' : 'Subsystem', connects: '', channels: '' })),
    ...doc.conduits.map((c) => ({ sel: { type: 'conduit', id: c.id }, o: c, kind: CONDUIT_TYPE_LABEL[c.type] || 'Conduit', connects: conduitConnects(c), channels: c.channels || '' })),
  ];
  const head = ['Name', 'Kind', 'Connects', 'SL-T', 'Safety', 'Accountable org', 'Logical boundary', 'Physical boundary', 'Logical access points', 'Physical access points', 'Data flows', 'Channels', 'Notes'];
  const row = (it) => [it.o.name, it.kind, it.connects, slText(it.o.sl), it.o.safety ? 'YES' : '', it.o.org || '', it.o.lboundary || '', it.o.pboundary || '', it.o.accessLogical || '', it.o.accessPhysical || '', it.o.dataflows || '', it.channels, it.o.notes || ''];
  return {
    head,
    rows: items.map((it) => ({ sel: it.sel, cells: row(it) })),
    csvHead: head,
    csvRows: items.map((it) => row(it).map((v, i) => (i === 4 ? (it.o.safety ? 'yes' : 'no') : v))),
    empty: 'Nothing drawn yet.',
    file: 'zones-conduits',
  };
}

function buildTables() {
  if (drawer.hidden) return;
  $('#tabAssets').classList.toggle('active', drawerTab === 'assets');
  $('#tabZC').classList.toggle('active', drawerTab !== 'assets');
  const d = tableData();
  drawerBody.replaceChildren();
  if (!d.rows.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = d.empty;
    drawerBody.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  const thead = table.createTHead().insertRow();
  for (const h of d.head) {
    const th = document.createElement('th');
    th.textContent = h;
    if (/SL-T/.test(h)) th.title = `${TERM_NAMES['SL-T']} - vector order: ${FR.map((f) => `${f} = ${FR_NAMES[f]}`).join(', ')}`;
    thead.appendChild(th);
  }
  const tbody = table.createTBody();
  for (const r of d.rows) {
    const tr = tbody.insertRow();
    for (const cell of r.cells) {
      const td = tr.insertCell();
      if (cell && typeof cell === 'object') {
        if (cell.swatch) { const s = document.createElement('span'); s.className = 'swatch-cell'; s.style.background = cell.swatch; td.appendChild(s); }
      } else {
        td.textContent = cell;
        td.title = cell;
        if (cell === 'YES') td.className = 'safety-cell';
      }
    }
    tr.addEventListener('click', () => { sel = r.sel; draw(); buildPanel(); });
  }
  drawerBody.appendChild(table);
}

$('#tablesBtn').addEventListener('click', () => { drawer.hidden = !drawer.hidden; buildTables(); });
$('#drawerClose').addEventListener('click', () => { drawer.hidden = true; });
$('#tabAssets').addEventListener('click', () => { drawerTab = 'assets'; buildTables(); });
$('#tabZC').addEventListener('click', () => { drawerTab = 'zc'; buildTables(); });
$('#tableCsv').addEventListener('click', () => {
  const d = tableData();
  const csvEsc = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; };
  const csv = [d.csvHead, ...d.csvRows].map((r) => r.map(csvEsc).join(',')).join('\r\n');
  download(`${fileStem(doc)}-${d.file}.csv`, '﻿' + csv, 'text/csv');
});

// ------------------------------------------------------------------ boot

loadAutosave();
window.addEventListener('resize', applyView);
applyView();
draw();
buildPanel();

// Test hook
window.__ZCD = {
  get doc() { return doc; },
  set doc(d) { doc = d; sel = null; draw(); buildPanel(); autosave(); },
  draw, setTool, select: (type, id) => { sel = { type, id }; draw(); buildPanel(); },
  exportSvgString: () => exportSvgString(doc), exportDrawio: () => exportDrawio(doc),
  exportVsdx: () => exportVsdx(doc), toXML: () => toXML(doc), fromXML,
};
