import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the installed compiler: no runtime dependency or app-data access.
const source = await readFile(new URL('../src/reading-metadata.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ReadingMetadata } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const INPUT_SAMPLES = 20;
const SIZES = [1, 5, 16];
const inputBudgetMs = 16;

function oldReadingMetadata(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return words ? `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 220))} min` : 'Empty';
}

function measure(work, snapshots) {
  const samples = snapshots.map(source => {
    const start = performance.now();
    work(source);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { p50Ms: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * 0.95)] };
}

const cases = SIZES.map(mebibytes => {
  const bytes = mebibytes * 1024 * 1024;
  const book = 'reading knowledge '.repeat(Math.ceil(bytes / 18)).slice(0, bytes);
  const snapshots = Array.from({ length: INPUT_SAMPLES }, (_, n) => `${book.slice(0, -1)}${n % 10}`);
  const metadata = new ReadingMetadata();
  const opened = performance.now();
  metadata.describe({ id: 'generated-book', source: book }, 'saved');
  const openedMs = performance.now() - opened;
  const before = measure(oldReadingMetadata, snapshots);
  const after = measure(source => metadata.describe({ id: 'generated-book', source }, 'pending'), snapshots);
  return { mebibytes, samples: INPUT_SAMPLES, openedMs, before, after, inputBudgetMs, passed: after.p95Ms < inputBudgetMs };
});

const result = {
  type: 'performance_evidence',
  context: 'e01s02 metadata-only synthetic input benchmark; not full reader latency',
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cases,
  limits: ['No browser typing or startup measurement.', 'No version-storage, renderer, or end-to-end latency measurement.'],
};
const destination = new URL('../specs/verifications/e01s02-reading-performance.json', import.meta.url);
await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (cases.some(test => !test.passed)) process.exitCode = 1;
