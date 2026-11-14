// Step 9 item 4: the roster trend text, the toast and the AI loader use line icons, not emoji.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateTrend } from './helpers';

// Components without an explicit React import need the classic JSX runtime under tsx.
(globalThis as unknown as { React: typeof React }).React = React;

const EMOJI = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF]|[\u{1F000}-\u{1FAFF}]/u;

test('calculateTrend labels are plain words (the roster adds the arrow icon)', () => {
  const base = { isOff: false, vxs: 90 };
  assert.equal(calculateTrend({ isOff: false, vxs: 92 }, base).label, 'UP');
  assert.equal(calculateTrend({ isOff: false, vxs: 88 }, base).label, 'DOWN');
  assert.equal(calculateTrend({ isOff: false, vxs: 90.4 }, base).label, 'STABLE');
  assert.equal(calculateTrend({ isOff: true, vxs: 90 }, base).label, 'OFF');
  for (const v of [92, 88, 90.4]) assert.ok(!EMOJI.test(calculateTrend({ isOff: false, vxs: v }, base).label));
});

test('toast shows a line icon per state and no emoji; the info icon turns', async () => {
  const { UploadStatus } = await import('../../app/uploadStatus');
  for (const type of ['success', 'error', 'info'] as const) {
    const html = renderToStaticMarkup(React.createElement(UploadStatus, { uploadStatus: { type, message: 'Preparing sept.csv…' } }));
    assert.ok(html.includes('<svg'), `${type}: has an svg icon`);
    assert.ok(!EMOJI.test(html), `${type}: no emoji`);
    assert.equal(html.includes('icon-spin'), type === 'info', `${type}: spins only for info`);
  }
});

test('AI loader draws its icon as a line icon, with a default', async () => {
  const { AiLoader } = await import('../../components/shared');
  for (const icon of [undefined, 'pulse', 'dow'] as const) {
    const html = renderToStaticMarkup(React.createElement(AiLoader, icon ? { message: 'Working', icon } : { message: 'Working' }));
    assert.ok(html.includes('<svg') && !EMOJI.test(html), `icon ${String(icon)}`);
  }
});

test('roster trend chip text: arrow icon for UP / DOWN / STABLE, none for OFF, words only', async () => {
  const { TrendChipText } = await import('../../components/shared');
  const base = { isOff: false, vxs: 90 };
  for (const [vxs, word] of [[92, 'UP'], [88, 'DOWN'], [90.4, 'STABLE']] as const) {
    const html = renderToStaticMarkup(React.createElement(TrendChipText, { trend: calculateTrend({ isOff: false, vxs }, base) }));
    assert.ok(html.includes('<svg') && html.includes(word) && !EMOJI.test(html), word);
  }
  const off = renderToStaticMarkup(React.createElement(TrendChipText, { trend: calculateTrend({ isOff: true, vxs: 90 }, base) }));
  assert.ok(!off.includes('<svg') && off.includes('OFF'), 'OFF has no arrow');
});
