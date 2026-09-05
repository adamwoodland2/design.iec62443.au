// Import/export: native XML (lossless), SVG, PNG, draw.io XML, Visio VSDX.
import { buildZip } from './zip.js';
import { NS, el, renderDiagram, diagramBounds, DEFAULTS, slSummary, luminance } from './render.js';

const esc = (s) => String(s == null ? '' : s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const fileStem = (doc) => (doc.title || 'zone-conduit-diagram').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';

// ------------------------------------------------------------------ native XML

const TEXT_FIELDS = ['org', 'lboundary', 'pboundary', 'accessLogical', 'accessPhysical', 'dataflows', 'notes'];
const TAGS = {
  org: 'accountableOrganisation', lboundary: 'logicalBoundary', pboundary: 'physicalBoundary',
  accessLogical: 'logicalAccessPoints', accessPhysical: 'physicalAccessPoints',
  dataflows: 'dataFlows', notes: 'notes', channels: 'channels',
};

function slXml(sl) {
  if (!sl || !sl.some((v) => v != null)) return '';
  return `<slTarget>${sl.map((v) => (v == null ? '' : v)).join(',')}</slTarget>`;
}
function commonXml(o, extra = []) {
  let out = '';
  for (const f of [...TEXT_FIELDS, ...extra]) if (o[f]) out += `<${TAGS[f]}>${esc(o[f])}</${TAGS[f]}>`;
  out += slXml(o.sl);
  return out;
}

export function toXML(doc) {
  const s = doc.settings;
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  out += `<zoneConduitDesign schema="1" app="design.iec62443.au" title="${esc(doc.title)}">\n`;
  if (doc.suc) out += ` <systemUnderConsideration>${esc(doc.suc)}</systemUnderConsideration>\n`;
  out += ` <settings zoneFill="${s.zoneFill}" subFill="${s.subFill}" conduitFill="${s.conduitFill}" canvasFill="${s.canvasFill}" bands="${!!s.bands}" band1="${s.band1}" band2="${s.band2}" band3="${s.band3}" snap="${!!s.snap}"/>\n`;
  out += ' <zones>\n';
  for (const n of doc.nodes) {
    out += `  <zone id="${esc(n.id)}" kind="${n.kind}" name="${esc(n.name)}"${n.parent ? ` parent="${esc(n.parent)}"` : ''} x="${n.x}" y="${n.y}" w="${n.w}" h="${n.h}"${n.fill ? ` fill="${n.fill}"` : ''} safety="${!!n.safety}">`;
    out += commonXml(n);
    if (n.assets && n.assets.length) {
      out += '<assets>';
      for (const a of n.assets) out += `<asset id="${esc(a.id)}" name="${esc(a.name)}" type="${esc(a.type)}"${a.fill ? ` fill="${esc(a.fill)}"` : ''}${a.ip ? ` ip="${esc(a.ip)}"` : ''}${a.note ? ` note="${esc(a.note)}"` : ''}/>`;
      out += '</assets>';
    }
    out += '</zone>\n';
  }
  out += ' </zones>\n <conduits>\n';
  for (const c of doc.conduits) {
    out += `  <conduit id="${esc(c.id)}" name="${esc(c.name)}" a="${esc(c.a)}" b="${esc(c.b)}" type="${c.type}" dir="${c.dir}"${c.fill ? ` fill="${c.fill}"` : ''} safety="${!!c.safety}">`;
    out += commonXml(c, ['channels']);
    out += '</conduit>\n';
  }
  out += ' </conduits>\n</zoneConduitDesign>\n';
  return out;
}

export function fromXML(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const root = xml.querySelector('zoneConduitDesign');
  if (!root) throw new Error('Not a zone and conduit design file (missing zoneConduitDesign root).');
  const doc = {
    schema: 1,
    title: root.getAttribute('title') || 'Untitled',
    suc: xml.querySelector('systemUnderConsideration')?.textContent || '',
    settings: { ...DEFAULTS },
    nodes: [],
    conduits: [],
  };
  const s = xml.querySelector('settings');
  if (s) {
    for (const k of ['zoneFill', 'subFill', 'conduitFill', 'canvasFill']) if (s.getAttribute(k)) doc.settings[k] = s.getAttribute(k);
    doc.settings.bands = s.getAttribute('bands') === 'true';
    doc.settings.snap = s.getAttribute('snap') !== 'false';
    doc.settings.band1 = +s.getAttribute('band1') || DEFAULTS.band1;
    doc.settings.band2 = +s.getAttribute('band2') || DEFAULTS.band2;
    doc.settings.band3 = +s.getAttribute('band3') || DEFAULTS.band3;
  }
  const readCommon = (e, o, extra = []) => {
    for (const f of [...TEXT_FIELDS, ...extra]) {
      const t = e.querySelector(`:scope > ${TAGS[f]}`);
      if (t) o[f] = t.textContent;
    }
    const sl = e.querySelector(':scope > slTarget');
    if (sl) o.sl = sl.textContent.split(',').map((v) => (v === '' ? null : Math.max(0, Math.min(4, +v)))).slice(0, 7);
  };
  for (const z of xml.querySelectorAll('zones > zone')) {
    const n = {
      id: z.getAttribute('id'), kind: z.getAttribute('kind') === 'subsystem' ? 'subsystem' : 'zone',
      name: z.getAttribute('name') || 'Zone', parent: z.getAttribute('parent') || null,
      x: +z.getAttribute('x') || 0, y: +z.getAttribute('y') || 0,
      w: Math.max(60, +z.getAttribute('w') || 200), h: Math.max(40, +z.getAttribute('h') || 120),
      fill: z.getAttribute('fill') || null, safety: z.getAttribute('safety') === 'true',
      sl: null, assets: [],
    };
    readCommon(z, n);
    for (const a of z.querySelectorAll('assets > asset')) {
      n.assets.push({ id: a.getAttribute('id') || crypto.randomUUID(), name: a.getAttribute('name') || '', type: a.getAttribute('type') || 'Other', fill: a.getAttribute('fill') || null, ip: a.getAttribute('ip') || '', note: a.getAttribute('note') || '' });
    }
    doc.nodes.push(n);
  }
  const ids = new Set(doc.nodes.map((n) => n.id));
  for (const n of doc.nodes) if (n.parent && !ids.has(n.parent)) n.parent = null;
  for (const c of xml.querySelectorAll('conduits > conduit')) {
    if (!ids.has(c.getAttribute('a')) || !ids.has(c.getAttribute('b'))) continue;
    const o = {
      id: c.getAttribute('id'), name: c.getAttribute('name') || 'Conduit',
      a: c.getAttribute('a'), b: c.getAttribute('b'),
      type: ['gateway', 'filtering', 'unidirectional'].includes(c.getAttribute('type')) ? c.getAttribute('type') : 'gateway',
      dir: ['ba', 'both'].includes(c.getAttribute('dir')) ? c.getAttribute('dir') : 'ab',
      fill: c.getAttribute('fill') || null, safety: c.getAttribute('safety') === 'true', sl: null,
    };
    readCommon(c, o, ['channels']);
    doc.conduits.push(o);
  }
  return doc;
}

// ------------------------------------------------------------------ SVG / PNG

export function exportSvgString(doc) {
  const b = diagramBounds(doc);
  const svg = el('svg', { xmlns: NS, viewBox: `${b.x} ${b.y} ${b.w} ${b.h}`, width: b.w, height: b.h, 'font-family': 'Segoe UI, Arial, sans-serif' });
  svg.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: doc.settings.canvasFill || '#ffffff' }));
  const g = el('g');
  svg.appendChild(g);
  renderDiagram(doc, g);
  return new XMLSerializer().serializeToString(svg);
}

export async function exportPngBlob(doc, scale = 2) {
  const b = diagramBounds(doc);
  const svgText = exportSvgString(doc);
  const img = new Image();
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG rasterise failed')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(b.w * scale);
  canvas.height = Math.round(b.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((bl) => (bl ? res(bl) : rej(new Error('PNG encode failed'))), 'image/png'));
}

// ------------------------------------------------------------------ draw.io

export function exportDrawio(doc) {
  const s = doc.settings;
  let cells = '<mxCell id="0"/><mxCell id="1" parent="0"/>';
  const order = [...doc.nodes].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
  for (const n of order) {
    const isZone = n.kind === 'zone';
    const fill = n.fill || (isZone ? s.zoneFill : s.subFill);
    const font = luminance(fill) < 0.55 ? '#ffffff' : '#1c2430';
    const style = `rounded=${isZone ? 1 : 0};whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacing=6;fillColor=${fill};fontColor=${font};strokeColor=${n.safety ? '#c62828' : '#666666'};strokeWidth=${n.safety ? 2 : 1};`;
    const label = [esc(n.name), slSummary(n.sl), n.safety ? 'SAFETY-RELATED' : ''].filter(Boolean).join('&#10;');
    cells += `<mxCell id="${esc(n.id)}" value="${label}" style="${style}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
    if (isZone && n.assets) {
      n.assets.forEach((a, i) => {
        const ax = n.x + 8 + (i % 3) * 106, ay = n.y + 40 + Math.floor(i / 3) * 30;
        const af = a.fill || '#ffffff';
        cells += `<mxCell id="${esc(n.id)}-a${i}" value="${esc(a.name || a.type)}" style="rounded=1;html=1;fillColor=${af};fontColor=${luminance(af) < 0.55 ? '#ffffff' : '#1c2430'};strokeColor=#9aa4af;fontSize=10;" vertex="1" parent="1"><mxGeometry x="${ax}" y="${ay}" width="100" height="24" as="geometry"/></mxCell>`;
      });
    }
  }
  for (const c of doc.conduits) {
    const stroke = c.fill || s.conduitFill;
    const arrow = c.type === 'unidirectional' ? (c.dir === 'ba' ? 'startArrow=block;endArrow=none;' : 'endArrow=block;startArrow=none;') : 'endArrow=none;startArrow=none;';
    const label = [esc(c.name), slSummary(c.sl)].filter(Boolean).join(' · ');
    cells += `<mxCell id="${esc(c.id)}" value="${label}" style="${arrow}strokeColor=${stroke};strokeWidth=6;fontSize=11;labelBackgroundColor=${stroke};fontColor=${luminance(stroke) < 0.55 ? '#ffffff' : '#1c2430'};" edge="1" parent="1" source="${esc(c.a)}" target="${esc(c.b)}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
  }
  return `<mxfile host="design.iec62443.au"><diagram id="zcd" name="${esc(doc.title || 'Page-1')}"><mxGraphModel grid="1" gridSize="10" page="1" pageWidth="1169" pageHeight="826"><root>${cells}</root></mxGraphModel></diagram></mxfile>`;
}

// ------------------------------------------------------------------ Visio VSDX

const PX_PER_IN = 96;

export function exportVsdx(doc) {
  const b = diagramBounds(doc);
  const pageW = Math.max(8.5, b.w / PX_PER_IN);
  const pageH = Math.max(5, b.h / PX_PER_IN);
  const X = (px) => ((px - b.x) / PX_PER_IN).toFixed(4);
  const Y = (px) => ((b.y + b.h - px) / PX_PER_IN).toFixed(4);   // Visio origin is bottom-left
  const IN = (px) => (px / PX_PER_IN).toFixed(4);

  let shapes = '';
  let id = 1;
  const s = doc.settings;
  const boxGeom = `<Section N="Geometry" IX="0"><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/>
<Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
<Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>
<Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>
<Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>
<Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row></Section>`;

  const rectShape = (x, y, w, h, fill, line, lineW, text, ink, opts = {}) => {
    const cx = x + w / 2, cy = y + h / 2;
    return `<Shape ID="${id++}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">
<Cell N="PinX" V="${X(cx)}"/><Cell N="PinY" V="${Y(cy)}"/>
<Cell N="Width" V="${IN(w)}"/><Cell N="Height" V="${IN(h)}"/>
<Cell N="LocPinX" V="${IN(w / 2)}"/><Cell N="LocPinY" V="${IN(h / 2)}"/>
<Cell N="FillForegnd" V="${fill}"/><Cell N="LineColor" V="${line}"/><Cell N="LineWeight" V="${lineW}"/>
${opts.rounded ? '<Cell N="Rounding" V="0.08"/>' : ''}
<Cell N="VerticalAlign" V="0"/><Cell N="Para.HorzAlign" V="0"/>
<Section N="Character"><Row IX="0"><Cell N="Color" V="${ink}"/><Cell N="Size" V="${opts.fontSize || 0.11}"/></Row></Section>
${boxGeom}
${text ? `<Text>${esc(text)}</Text>` : ''}
</Shape>\n`;
  };

  for (const n of doc.nodes) {
    const isZone = n.kind === 'zone';
    const fill = n.fill || (isZone ? s.zoneFill : s.subFill);
    const ink = luminance(fill) < 0.55 ? '#FFFFFF' : '#1C2430';
    const label = [n.name, slSummary(n.sl), n.safety ? 'SAFETY-RELATED' : ''].filter(Boolean).join('\n');
    shapes += rectShape(n.x, n.y, n.w, n.h, fill, n.safety ? '#C62828' : '#666666', n.safety ? '0.028' : '0.014', label, ink, { rounded: isZone });
  }
  for (const n of doc.nodes) {
    if (n.kind !== 'zone' || !n.assets) continue;
    n.assets.forEach((a, i) => {
      const ax = n.x + 8 + (i % 3) * 106, ay = n.y + 40 + Math.floor(i / 3) * 30;
      if (ay + 24 > n.y + n.h - 6) return;
      const af = a.fill || '#FFFFFF';
      shapes += rectShape(ax, ay, 100, 24, af, '#9AA4AF', '0.01', a.name || a.type, luminance(af) < 0.55 ? '#FFFFFF' : '#1C2430', { fontSize: 0.09 });
    });
  }
  for (const c of doc.conduits) {
    const a = doc.nodes.find((n) => n.id === c.a), z = doc.nodes.find((n) => n.id === c.b);
    if (!a || !z) continue;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2, x2 = z.x + z.w / 2, y2 = z.y + z.h / 2;
    const stroke = c.fill || s.conduitFill;
    const lx = Math.min(x1, x2), ly = Math.min(y1, y2);
    const w = Math.max(1, Math.abs(x2 - x1)), h = Math.max(1, Math.abs(y2 - y1));
    // Local coords: Visio Y grows upward inside the shape too.
    const relX = (px) => (w < 2 ? 0 : (px - lx) / w).toFixed(4);
    const relY = (px) => (h < 2 ? 0 : 1 - (px - ly) / h).toFixed(4);
    shapes += `<Shape ID="${id++}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">
<Cell N="PinX" V="${X(lx + w / 2)}"/><Cell N="PinY" V="${Y(ly + h / 2)}"/>
<Cell N="Width" V="${IN(w)}"/><Cell N="Height" V="${IN(h)}"/>
<Cell N="LocPinX" V="${IN(w / 2)}"/><Cell N="LocPinY" V="${IN(h / 2)}"/>
<Cell N="LineColor" V="${stroke}"/><Cell N="LineWeight" V="0.06"/><Cell N="LineCap" V="1"/>
<Section N="Character"><Row IX="0"><Cell N="Color" V="#1C2430"/><Cell N="Size" V="0.1"/></Row></Section>
<Section N="Geometry" IX="0"><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/>
<Row T="RelMoveTo" IX="1"><Cell N="X" V="${relX(x1)}"/><Cell N="Y" V="${relY(y1)}"/></Row>
<Row T="RelLineTo" IX="2"><Cell N="X" V="${relX(x2)}"/><Cell N="Y" V="${relY(y2)}"/></Row></Section>
<Text>${esc([c.name, slSummary(c.sl)].filter(Boolean).join(' - '))}</Text>
</Shape>\n`;
  }

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xml:space="preserve"/>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>
</Relationships>`;

  const pagesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">
<Page ID="0" NameU="Page-1" Name="Page-1">
<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">
<Cell N="PageWidth" V="${pageW.toFixed(4)}"/><Cell N="PageHeight" V="${pageH.toFixed(4)}"/>
<Cell N="PageScale" V="1" U="IN_F"/><Cell N="DrawingScale" V="1" U="IN_F"/>
</PageSheet>
<Rel r:id="rId1"/>
</Page>
</Pages>`;

  const pagesRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>
</Relationships>`;

  const page1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" xml:space="preserve">
<Shapes>
${shapes}</Shapes>
</PageContents>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(doc.title || 'Zone and conduit diagram')}</dc:title>
<dc:creator>design.iec62443.au</dc:creator>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>design.iec62443.au Zone and Conduit Designer</Application>
</Properties>`;

  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'visio/document.xml', data: documentXml },
    { name: 'visio/_rels/document.xml.rels', data: documentRels },
    { name: 'visio/pages/pages.xml', data: pagesXml },
    { name: 'visio/pages/_rels/pages.xml.rels', data: pagesRels },
    { name: 'visio/pages/page1.xml', data: page1 },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
  ]);
}
