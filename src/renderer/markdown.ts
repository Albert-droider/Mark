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
import { escapeHtml, inlineText, slugify } from "../util";
import { getSettings } from "../store";

const CALLOUTS = ["tip", "info", "note", "warning", "danger", "success"];
const MATH_DELIMITERS = ["dollars", "brackets"];

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
    md.use(container, "details", { render: detailsRenderer, validate: () => true });

    if (s.math) {
      md.use(texmath, {
        engine: katex,
        delimiters: MATH_DELIMITERS,
        katexOptions: { throwOnError: false, output: "html", strict: false },
      });
    }

    this.installRules(md, settings);
    return md;
  }

  /** Override a handful of render rules for nicer output (anchors, code blocks, links). */
  private installRules(md: MarkdownIt, settings: Settings): void {
    const self = this;

    // Heading anchors: <h2 id="..."> based on heading text.
    md.renderer.rules.heading_open = function (tokens, idx, options, _env, renderer) {
      const tok = tokens[idx];
      const next = tokens[idx + 1];
      const text = next && next.type === "inline" ? inlineText(next.children) : "";
      const id = slugify(text);
      if (id) tok.attrSet("id", id);
      return renderer.renderToken(tokens, idx, options);
    };

    // Fenced code: copy button + language label + highlight.js.
    md.renderer.rules.fence = function (tokens, idx) {
      const token = tokens[idx];
      const info = (token.info || "").trim();
      const lang = info.split(/\s+/)[0] || "";
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
    md.renderer.rules.link_open = function (tokens, idx, options, env, renderer) {
      if (settings.render.linkTarget === "blank") {
        const href = tokens[idx].attrGet("href") || "";
        if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
          tokens[idx].attrSet("target", "_blank");
          tokens[idx].attrSet("rel", "noopener noreferrer");
        }
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
    const html = this.md.render(source);
    return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  }
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
    const summary = (tokens[idx].info || "").trim() || "Details";
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
