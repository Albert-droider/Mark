import MarkdownIt from "markdown-it";
import { full as emoji } from "markdown-it-emoji";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import deflist from "markdown-it-deflist";
import abbr from "markdown-it-abbr";
import mark from "markdown-it-mark";
import container from "markdown-it-container";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

import type { DocRenderer } from "./base";
import type { FileKind } from "../types";
import type { Settings } from "../types";
import { artifactHtml } from "../artifacts";
import { escapeHtml, inlineText, slugify } from "../util";
import { getSettings } from "../store";

const CALLOUTS = ["tip", "info", "note", "warning", "danger", "success"];
const MATH_DELIMITERS = ["dollars", "brackets"];

const ALERTS: Record<string, { kind: string; label: string }> = {
  NOTE: { kind: "note", label: "Note" },
  TIP: { kind: "tip", label: "Tip" },
  IMPORTANT: { kind: "warning", label: "Important" },
  WARNING: { kind: "warning", label: "Warning" },
  CAUTION: { kind: "danger", label: "Caution" },
};

let purifyHooked = false;
function ensurePurifyHook(): void {
  if (purifyHooked) return;
  purifyHooked = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style" || !data.attrValue) return;
    data.attrValue = data.attrValue
      .replace(/position\s*:\s*(fixed|sticky)/gi, "position:relative")
      .replace(/z-index\s*:\s*[^;]+;?/gi, "");
  });
}

/** Drop a leading YAML block so it doesn't become a horizontal rule plus a heading. */
export function stripFrontmatter(source: string): string {
  const src = source.replace(/^\uFEFF/, "");
  const lines = src.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return src;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) return src;
  return lines.slice(close + 1).join("\n");
}

const PURIFY_CONFIG = {
  ADD_ATTR: [
    "target", "rel", "open", "align", "colspan", "rowspan", "start",
    "reversed", "value", "lang", "dir", "id", "name",
  ],
  ADD_TAGS: [
    "details", "summary", "kbd", "mark", "math", "semantics", "mrow", "mi",
    "mo", "mn", "ms", "mtext", "mspace", "mfrac", "msup", "msub", "msubsup",
    "mroot", "msqrt", "mtable", "mtr", "mtd", "menclose", "merror", "mfenced",
    "mover", "munder", "munderover", "mstyle", "annotation-xml", "annotation",
  ],
};

export class MarkdownRenderer implements DocRenderer {
  readonly id = "markdown";
  readonly kind: FileKind = "markdown";
  private md!: MarkdownIt;

  constructor() {
    this.rebuild();
  }

  rebuild(): void {
    this.md = this.build(getSettings());
  }

  private build(settings: Settings): MarkdownIt {
    const s = settings.render;
    const md = new MarkdownIt({
      html: true,
      xhtmlOut: false,
      breaks: false,
      linkify: s.linkify,
      typographer: s.typographer,
      langPrefix: "language-",
    });

    if (s.emoji) md.use(emoji);
    if (s.taskLists) md.use(taskLists, { enabled: false, label: true });
    md.use(footnote);
    md.use(sub);
    md.use(sup);
    md.use(deflist);
    md.use(abbr);
    md.use(mark);
    for (const name of CALLOUTS) {
      md.use(container, name, { render: calloutRenderer(name) });
    }
    md.use(container, "details", { render: detailsRenderer });

    if (s.math) {
      md.use(texmath, {
        engine: katex,
        delimiters: MATH_DELIMITERS,
        katexOptions: { throwOnError: false, output: "html", strict: false },
      });
    }

    this.installRules(md, settings);
    installAlerts(md);
    return md;
  }

  /** Override a handful of render rules for nicer output (anchors, code blocks, links). */
  private installRules(md: MarkdownIt, settings: Settings): void {
    const self = this;

    // Heading anchors. Prefixed so names like "body" can't be stripped as DOM clobbering.
    md.renderer.rules.heading_open = function (tokens, idx, options, env, renderer) {
      const tok = tokens[idx];
      const next = tokens[idx + 1];
      const text = next && next.type === "inline" ? inlineText(next.children) : "";
      const base = `h-${slugify(text) || "section"}`;
      const counts = (env.slugCount ??= Object.create(null) as Record<string, number>);
      const n = counts[base] ?? 0;
      counts[base] = n + 1;
      tok.attrSet("id", n === 0 ? base : `${base}-${n + 1}`);
      return renderer.renderToken(tokens, idx, options);
    };

    // Fenced code: copy button + language label + highlight.js.
    md.renderer.rules.fence = function (tokens, idx) {
      const token = tokens[idx];
      const info = (token.info || "").trim();
      const lang = info.split(/\s+/)[0] || "";
      const figure = artifactHtml(lang, token.content);
      if (figure) return figure;
      return self.codeBlock(token.content, lang);
    };

    // Indented code blocks: highlight as plaintext with copy.
    md.renderer.rules.code_block = function (tokens, idx) {
      return self.codeBlock(tokens[idx].content, "");
    };

    // External links open in a new window.
    const defaultLinkOpen =
      md.renderer.rules.link_open ||
      function (tokens, idx, options, _env, renderer) {
        return renderer.renderToken(tokens, idx, options);
      };
    // External links always leave the reader. "Open here" would navigate the webview away.
    md.renderer.rules.link_open = function (tokens, idx, options, env, renderer) {
      const href = tokens[idx].attrGet("href") || "";
      if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
        tokens[idx].attrSet("target", "_blank");
        tokens[idx].attrSet("rel", "noopener noreferrer");
      }
      return defaultLinkOpen(tokens, idx, options, env, renderer);
    };
  }

  private codeBlock(code: string, lang: string): string {
    const highlighted = highlightCode(code, lang);
    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : `<span class="code-lang">text</span>`;
    return (
      `<div class="code-block">` +
      `<div class="code-bar">${label}<button class="code-copy" type="button" aria-label="Copy code">copy</button></div>` +
      `<pre class="code-pre"><code class="hljs${lang ? " language-" + escapeHtml(lang) : ""}">${highlighted}</code></pre>` +
      `</div>\n`
    );
  }

  render(source: string): string {
    ensurePurifyHook();
    const html = this.md.render(stripFrontmatter(source), { slugCount: Object.create(null) });
    return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  }
}

function installAlerts(md: MarkdownIt): void {
  md.core.ruler.after("inline", "gfm-alerts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      let inline = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "blockquote_close") break;
        if (tokens[j].type === "inline") {
          inline = j;
          break;
        }
      }
      if (inline < 0) continue;
      const children = tokens[inline].children;
      if (!children) continue;
      const first = children.find((c) => c.type === "text" && c.content.trim());
      if (!first) continue;
      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*/.exec(first.content.trimStart());
      if (!match) continue;
      const alert = ALERTS[match[1]];
      if (!alert) continue;
      tokens[i].attrJoin("class", `callout callout-${alert.kind}`);
      tokens[i].attrSet("data-alert", alert.label);
      const rest = first.content.trimStart().slice(match[0].length);
      if (rest.trim()) {
        first.content = rest;
        continue;
      }
      const at = children.indexOf(first);
      children.splice(at, 1);
      if (children[at] && (children[at].type === "softbreak" || children[at].type === "hardbreak")) {
        children.splice(at, 1);
      }
    }
  });
}

function calloutRenderer(name: string) {
  return function (tokens: any[], idx: number) {
    if (tokens[idx].nesting === 1) {
      const title = (tokens[idx].info || "").trim().slice(name.length).trim();
      const tag = title ? escapeHtml(title) : name.charAt(0).toUpperCase() + name.slice(1);
      return `<div class="callout callout-${name}"><div class="callout-head">${tag}</div>\n`;
    }
    return `</div>\n`;
  };
}

function detailsRenderer(tokens: any[], idx: number) {
  if (tokens[idx].nesting === 1) {
    const info = (tokens[idx].info || "").trim();
    const summary = info.replace(/^details\b\s*/i, "").trim() || "Details";
    return `<details class="md-details"><summary>${escapeHtml(summary)}</summary>\n`;
  }
  return `</details>\n`;
}

function highlightCode(code: string, lang: string): string {
  if (code.length > 50000) return escapeHtml(code); // skip heavy auto-detect on huge blocks
  const language = lang && hljs.getLanguage(lang) ? lang : "";
  try {
    if (language) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}
