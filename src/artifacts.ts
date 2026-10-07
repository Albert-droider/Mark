import DOMPurify from "dompurify";
import { escapeHtml } from "./util";

export type ArtifactKind = "mermaid" | "chart" | "progress";
export type ChartKind = "bar" | "line" | "pie";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartModel {
  kind: ChartKind;
  title: string;
  points: ChartPoint[];
}

export interface PlanModel {
  title: string;
  items: ChartPoint[];
}

const MERMAID_START = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|xychart(?:-beta)?|sankey-beta|block-beta|C4Context|requirementDiagram)\b/;

/** Which fence should become a figure instead of a code block. */
export function artifactKind(lang: string, source: string): ArtifactKind | null {
  switch (lang.toLowerCase()) {
    case "mermaid":
      return "mermaid";
    case "chart":
    case "grafiek":
      return parseChart(source) ? "chart" : null;
    case "progress":
    case "plan":
    case "progressie":
      return parsePlan(source) ? "progress" : null;
    case "artifact":
      if (MERMAID_START.test(source)) return "mermaid";
      if (parsePlan(source)) return "progress";
      if (parseChart(source)) return "chart";
      return null;
    default:
      return null;
  }
}

export function parseChart(source: string): ChartModel | null {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  let kind: ChartKind = "bar";
  let i = 0;
  const head = lines[0].toLowerCase();
  if (head === "bar" || head === "staaf") { kind = "bar"; i = 1; }
  else if (head === "line" || head === "lijn") { kind = "line"; i = 1; }
  else if (head === "pie" || head === "taart") { kind = "pie"; i = 1; }
  let title = "";
  if (lines[i] && /^title\s+/i.test(lines[i])) {
    title = lines[i].replace(/^title\s+/i, "").trim();
    i += 1;
  }
  const points: ChartPoint[] = [];
  for (; i < lines.length; i++) {
    const point = splitPoint(lines[i]);
    if (point) points.push(point);
  }
  if (points.length === 0) return null;
  return { kind, title, points };
}

export function parsePlan(source: string): PlanModel | null {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  let i = 0;
  let title = "";
  if (/^title\s+/i.test(lines[0])) {
    title = lines[0].replace(/^title\s+/i, "").trim();
    i = 1;
  }
  const items: ChartPoint[] = [];
  for (; i < lines.length; i++) {
    const point = splitPoint(lines[i]);
    if (point) items.push({ label: point.label, value: Math.max(0, Math.min(100, point.value)) });
  }
  if (items.length === 0) return null;
  return { title, items };
}

/** Figure HTML for a fence. Mermaid is filled in later; charts and plans are drawn here. */
export function artifactHtml(lang: string, source: string): string | null {
  const kind = artifactKind(lang, source);
  if (!kind) return null;
  const slot = slotHtml(kind, source);
  const caption = captionFor(kind, source);
  return (
    `<figure class="artifact artifact-${kind}" data-artifact="${kind}">` +
    `<figcaption class="artifact-label">${escapeHtml(caption)}</figcaption>` +
    `<pre class="artifact-src">${escapeHtml(source)}</pre>` +
    `<div class="artifact-slot">${slot}</div>` +
    `</figure>\n`
  );
}

/** Draw mermaid fences already in the document. Safe to call again after a theme change. */
export async function drawMermaid(nodes: HTMLElement[], current: () => boolean = () => true): Promise<void> {
  if (nodes.length === 0 || !current()) return;
  const { default: mermaid } = await import("mermaid");
  const dark = document.documentElement.getAttribute("data-mode") === "dark";
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: '"Segoe UI", sans-serif',
    // Root flag: the flowchart one is ignored, and HTML labels become empty
    // boxes once the SVG sanitizer drops the embedded markup.
    htmlLabels: false,
    themeVariables: {
      darkMode: dark,
      background: "transparent",
      fontFamily: "Segoe UI, sans-serif",
      primaryColor: dark ? "#2a2723" : "#efe8da",
      primaryTextColor: dark ? "#f7f3ea" : "#14110e",
      primaryBorderColor: dark ? "#8a847a" : "#6f675c",
      lineColor: dark ? "#b7b1a6" : "#3f3830",
      secondaryColor: dark ? "#3a342c" : "#e4dccb",
      tertiaryColor: dark ? "#1c1a17" : "#f7f3ea",
      textColor: dark ? "#f7f3ea" : "#14110e",
      mainBkg: dark ? "#2a2723" : "#efe8da",
      nodeBorder: dark ? "#8a847a" : "#6f675c",
    },
  });
  let n = 0;
  for (const node of nodes) {
    if (!current()) return;
    const source = node.querySelector(".artifact-src")?.textContent || "";
    const slot = node.querySelector(".artifact-slot");
    if (!slot) continue;
    const id = `md${Date.now().toString(36)}${n++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      slot.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      slot.innerHTML = `<p class="artifact-error">${escapeHtml(message.slice(0, 180))}</p>`;
    }
  }
}

function captionFor(kind: ArtifactKind, source: string): string {
  if (kind === "mermaid") return "Diagram";
  if (kind === "chart") return parseChart(source)?.title || "Chart";
  return parsePlan(source)?.title || "Plan";
}

function slotHtml(kind: ArtifactKind, source: string): string {
  switch (kind) {
    case "mermaid":
      return "";
    case "chart": {
      const model = parseChart(source);
      return model ? renderChart(model) : "";
    }
    case "progress": {
      const model = parsePlan(source);
      return model ? renderPlan(model) : "";
    }
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function renderChart(model: ChartModel): string {
  switch (model.kind) {
    case "bar":
      return renderBars(model.points, false);
    case "line":
      return renderLine(model.points);
    case "pie":
      return renderPie(model.points);
    default: {
      const _never: never = model.kind;
      return _never;
    }
  }
}

function renderPlan(model: PlanModel): string {
  return renderBars(model.items, true);
}

function renderBars(points: ChartPoint[], asPercent: boolean): string {
  const max = Math.max(...points.map((p) => p.value), asPercent ? 100 : 1);
  const rows = points.map((p) => {
    const width = Math.max(0, Math.min(100, (p.value / max) * 100));
    const value = asPercent ? `${Math.round(p.value)}%` : formatNum(p.value);
    return (
      `<div class="chart-row">` +
      `<span class="chart-name">${escapeHtml(p.label)}</span>` +
      `<span class="chart-track"><span class="chart-fill" style="width:${width}%"></span></span>` +
      `<span class="chart-value">${escapeHtml(value)}</span>` +
      `</div>`
    );
  });
  return `<div class="chart chart-bars">${rows.join("")}</div>`;
}

function renderLine(points: ChartPoint[]): string {
  const w = 320;
  const h = 140;
  const pad = 16;
  const min = Math.min(...points.map((p) => p.value), 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const span = max - min || 1;
  const step = points.length === 1 ? 0 : (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
    return { x, y };
  });
  const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const dots = coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" class="chart-dot"></circle>`).join("");
  const labels = points.map((p, i) => {
    const x = pad + i * step;
    return `<text x="${x.toFixed(1)}" y="${h - 2}" text-anchor="middle" class="chart-axis">${escapeHtml(p.label)}</text>`;
  }).join("");
  return (
    `<svg class="chart chart-line" viewBox="0 0 ${w} ${h}" role="img">` +
    `<polyline points="${poly}" class="chart-line-stroke"></polyline>` +
    dots + labels +
    `</svg>`
  );
}

function renderPie(points: ChartPoint[]): string {
  const total = points.reduce((sum, p) => sum + Math.max(0, p.value), 0) || 1;
  const tones = [88, 68, 50, 34, 22];
  let cursor = 0;
  const stops = points.map((p, i) => {
    const start = cursor;
    cursor += (Math.max(0, p.value) / total) * 100;
    const tone = tones[i % tones.length];
    return `color-mix(in srgb, var(--ink) ${tone}%, var(--paper)) ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const legend = points.map((p, i) => {
    const tone = tones[i % tones.length];
    const pct = Math.round((Math.max(0, p.value) / total) * 100);
    return (
      `<li><i style="background:color-mix(in srgb, var(--ink) ${tone}%, var(--paper))"></i>` +
      `<span>${escapeHtml(p.label)}</span><b>${pct}%</b></li>`
    );
  }).join("");
  return (
    `<div class="chart chart-pie">` +
    `<div class="pie" style="background:conic-gradient(${stops.join(",")})"></div>` +
    `<ul class="pie-legend">${legend}</ul>` +
    `</div>`
  );
}

function splitPoint(line: string): ChartPoint | null {
  const match = /^(.*?)(?:\s*\|\s*|\s*:\s*|\s+)(-?\d+(?:[.,]\d+)?)\s*%?$/.exec(line);
  if (!match) return null;
  const label = match[1].trim();
  const value = Number(match[2].replace(",", "."));
  if (!label || !Number.isFinite(value)) return null;
  return { label, value };
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
