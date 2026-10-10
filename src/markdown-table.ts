export interface MarkdownTable {
  headers: string[];
  rows: string[][];
  separators: string[];
  prefix: string;
  eol: string;
  trailing: boolean;
}

/** Keep cell Markdown (including escapes), rather than flattening rendered HTML. */
function cells(line: string): string[] {
  const values: string[] = [];
  let from = 0, slash = 0;
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && slash % 2 === 0) { values.push(line.slice(from, i).trim()); from = i + 1; pipes.push(i); }
    slash = line[i] === "\\" ? slash + 1 : 0;
  }
  values.push(line.slice(from).trim());
  if (pipes[0] === line.search(/\S/)) values.shift();
  if (pipes.at(-1) === line.trimEnd().length - 1) values.pop();
  return values;
}

export function readMarkdownTable(markdown: string): MarkdownTable | null {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const trailing = lines.at(-1) === "";
  if (trailing) lines.pop();
  if (lines.length < 2 || lines.length > 202) return null;
  const prefix = /^[ \t]*/.exec(lines[0])![0];
  if (lines.some(line => !line.startsWith(prefix) || /^\s*>/.test(line))) return null;
  const parsed = lines.map(line => cells(line.slice(prefix.length)));
  const [headers, separators, ...rows] = parsed;
  if (!headers.length || headers.length > 24 || separators.length !== headers.length || !separators.every(cell => /^:?-+:?$/.test(cell))
    || rows.some(row => row.length > headers.length)) return null;
  return { headers, separators, rows: rows.map(row => [...row, ...Array(headers.length - row.length).fill("")]), prefix, eol, trailing };
}

function escapeCell(value: string): string {
  let result = "", slash = 0;
  for (const ch of value.replace(/\r?\n/g, "<br>")) {
    if (ch === "|" && slash % 2 === 0) result += "\\";
    result += ch; slash = ch === "\\" ? slash + 1 : 0;
  }
  return result.trim();
}

export function writeMarkdownTable(table: MarkdownTable): string {
  const rows = [table.headers, table.separators, ...table.rows];
  return rows.map(row => `${table.prefix}| ${row.map(escapeCell).join(" | ")} |`).join(table.eol) + (table.trailing ? table.eol : "");
}
