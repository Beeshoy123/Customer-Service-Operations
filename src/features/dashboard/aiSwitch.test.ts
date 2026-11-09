import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_ENABLED, AI_UNDER_CONSTRUCTION_TEXT } from './aiSwitch';
import { executeGeminiAction } from './hooks';

const SRC = fileURLToPath(new URL('../..', import.meta.url));

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

// code lines only (comments and blank lines are skipped)
const codeLines = (file: string) =>
  fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

describe('AI is frozen: nothing is sent to any AI model (under construction)', () => {
  it('the master switch is off', () => {
    assert.equal(AI_ENABLED, false);
  });

  it('an AI report call makes zero network requests and shows the "under construction" text', async () => {
    const calls: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: unknown[]) => {
      calls.push(args);
      throw new Error('network blocked in test');
    }) as typeof fetch;
    const statuses: string[] = [];
    const loadings: boolean[] = [];
    try {
      await executeGeminiAction(
        '{"agents":["Fake Agent One"],"supervisors":["Fake Sup A"]}',
        'system prompt',
        (t: string) => statuses.push(t),
        (v: boolean) => loadings.push(v),
        'error message'
      );
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(calls.length, 0, 'no request may be made');
    assert.deepEqual(statuses, [AI_UNDER_CONSTRUCTION_TEXT]);
    assert.equal(loadings.includes(true), false, 'no loading spinner either');
  });

  it('the only network call in the whole app is the one inside fetchWithRetry, and it is behind the switch', () => {
    const NETWORK = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b\s*[(]|new\s+(XMLHttpRequest|WebSocket|EventSource)\b/;
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      codeLines(file).forEach((line) => {
        if (NETWORK.test(line)) offenders.push(path.relative(SRC, file));
      });
    }
    assert.deepEqual([...new Set(offenders)], ['features/dashboard/hooks.ts']);
    assert.equal(offenders.length, 1, 'exactly one network call');

    const hooks = fs.readFileSync(path.join(SRC, 'features/dashboard/hooks.ts'), 'utf8');
    const start = hooks.indexOf('const fetchWithRetry');
    const body = hooks.slice(start, hooks.indexOf('\n};', start));
    assert.ok(body.includes('AI_ENABLED'), 'fetchWithRetry must check the switch');
    assert.ok(body.indexOf('AI_ENABLED') < body.indexOf('fetch('), 'the check must come before fetch(');
  });

  it('no AI provider address appears anywhere except hooks.ts', () => {
    const PROVIDERS = /api\.anthropic\.com|googleapis\.com|generativelanguage|api\.openai\.com/;
    const files = sourceFiles(SRC).filter((f) => codeLines(f).some((l) => PROVIDERS.test(l)));
    assert.deepEqual(files.map((f) => path.relative(SRC, f)), ['features/dashboard/hooks.ts']);
  });
});
