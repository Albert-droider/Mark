// Small DOM & string helpers.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, JSON.parse(v));
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Heading slug. Keeps letters from any language; accents fold to ASCII. */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const DOC_EXT = new Set(["md", "markdown", "mdown", "mkd", "mkdn", "mdx", "txt", "text"]);
const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]);

function extensionOf(p: string): string {
  const base = p.split(/[\\/]/).pop() || "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function isDocumentPath(p: string): boolean {
  return DOC_EXT.has(extensionOf(p));
}

export function isImagePath(p: string): boolean {
  return IMG_EXT.has(extensionOf(p));
}

function windowsPath(p: string): boolean {
  return p.includes("\\") || /^[a-zA-Z]:[\\/]/.test(p);
}

/** Stable key for recent files and reading position. Linux paths stay as-is. */
export function canonicalPath(p: string): string {
  if (!p || !windowsPath(p)) return p;
  return p.replace(/\//g, "\\").toLowerCase();
}

export function dirname(p: string): string {
  const sep = windowsPath(p) ? "\\" : "/";
  const norm = p.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  const dir = i >= 0 ? norm.slice(0, i) : "";
  return sep === "\\" ? dir.replace(/\//g, "\\") : dir;
}

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

/** Resolve a markdown link against the open file. Schemes and fragments return null. */
export function resolveAgainst(baseFile: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || !baseFile) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith("//")) return null;
  const noHash = raw.split("#")[0].split("?")[0];
  if (!noHash) return null;
  let decoded = noHash;
  try {
    decoded = decodeURIComponent(noHash);
  } catch {
    return null;
  }
  const sep = windowsPath(baseFile) || windowsPath(decoded) ? "\\" : "/";
  const combined = isAbsolutePath(decoded)
    ? decoded
    : `${dirname(baseFile).replace(/[\\/]$/, "")}${sep}${decoded.replace(/^[\\/]/, "")}`;
  return normalizePath(combined, sep);
}

function normalizePath(p: string, sep: "\\" | "/"): string {
  const norm = p.replace(/\\/g, "/");
  const drive = norm.match(/^([a-zA-Z]:)(\/|$)/);
  const rooted = norm.startsWith("/");
  const bits = norm.split("/").filter((part) => part && part !== ".");
  const stack: string[] = [];
  for (const bit of bits) {
    if (bit.endsWith(":") && stack.length === 0) {
      stack.push(bit);
      continue;
    }
    if (bit === "..") {
      if (stack.length > 1 || (stack.length === 1 && !stack[0].endsWith(":"))) stack.pop();
      continue;
    }
    stack.push(bit);
  }
  if (drive) return stack.join(sep);
  if (rooted) return `${sep}${stack.join(sep)}`;
  return stack.join(sep);
}

/** Extract plain text from a markdown-it inline token's children. */
export function inlineText(children: any[] | null | undefined): string {
  if (!children) return "";
  let out = "";
  for (const c of children) {
    if (c.type === "text") out += c.content;
    else if (c.children) out += inlineText(c.children);
    else if (c.type === "code_inline") out += c.content;
  }
  return out;
}

export function debounce<F extends (...a: any[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...a: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as F;
}

export function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] || p || "Untitled";
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i >= 0 ? b.slice(i + 1).toLowerCase() : "";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
