// The Dates section of the import preview: what the user reads on screen.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatesSection, type DatesSectionProps } from './DatesSection.tsx';
import { formatIsoDate, type DatesPreview } from './datePreview.ts';

const noop = () => undefined;
const render = (preview: DatesPreview, extra: Partial<DatesSectionProps> = {}): string =>
  renderToStaticMarkup(
    createElement(DatesSection, { preview, currentYear: 2026, onOrderChange: noop, onYearChange: noop, ...extra }),
  );

const order = (patch: Partial<Extract<DatesPreview, { kind: 'order' }>>): DatesPreview => ({
  kind: 'order',
  proof: 'unproven',
  detected: 'dayFirst',
  effective: 'dayFirst',
  overridesProof: false,
  numericCount: 38,
  proofExample: null,
  examples: [
    { raw: '5/9/26', read: '2026-09-05' },
    { raw: '6/9/26', read: '2026-09-06' },
  ],
  ...patch,
});

describe('formatIsoDate', () => {
  it('writes the day, short month and year', () => {
    assert.equal(formatIsoDate('2026-09-05'), '5 Sep 2026');
    assert.equal(formatIsoDate('2026-01-09'), '9 Jan 2026');
    assert.equal(formatIsoDate('2025-12-31'), '31 Dec 2025');
  });

  it('returns anything else unchanged', () => {
    assert.equal(formatIsoDate('hello'), 'hello');
    assert.equal(formatIsoDate('2026-13-01'), '2026-13-01');
  });
});

describe('DatesSection', () => {
  it('renders nothing when there is nothing to decide', () => {
    assert.equal(render({ kind: 'none' }), '');
  });

  it('proven: says which order the file proves and why', () => {
    const html = render(order({ proof: 'proven', detected: 'monthFirst', effective: 'monthFirst', proofExample: '9/13/26' }));
    assert.match(html, /Read as MM\/DD\. 9\/13\/26 proves it/);
    assert.match(html, /ipm-dates-status-ok/);
    assert.doesNotMatch(html, /Can&#x27;t tell/);
  });

  it('unproven: warns, names the default, and shows the examples as readable dates', () => {
    const html = render(order({}));
    assert.match(html, /ipm-dates-status-warn/);
    assert.match(html, /Can&#x27;t tell the order/);
    assert.match(html, /Using DD\/MM, the default\./);
    assert.match(html, /5 Sep 2026/);
    assert.match(html, /6 Sep 2026/);
    assert.match(html, /38 such dates/);
  });

  it('unproven with a choice: says it is the user choice', () => {
    const html = render(order({ effective: 'monthFirst', examples: [{ raw: '5/9/26', read: '2026-05-09' }] }));
    assert.match(html, /Using MM\/DD, your choice\./);
    assert.match(html, /9 May 2026/);
  });

  it('overriding a proof is called out', () => {
    const html = render(order({ proof: 'proven', detected: 'monthFirst', effective: 'dayFirst', overridesProof: true, proofExample: '9/13/26' }));
    assert.match(html, /overrides what the file proves \(9\/13\/26\)/);
  });

  it('mixed: says the sheet mixes both orders', () => {
    assert.match(render(order({ proof: 'mixed' })), /mixes both orders/);
  });

  it('marks the active order button as pressed', () => {
    const html = render(order({ effective: 'monthFirst' }));
    assert.match(html, /aria-pressed="true"[^>]*>MM\/DD</);
    assert.match(html, /aria-pressed="false"[^>]*>DD\/MM</);
  });

  it('a value that cannot be read is shown as such, not hidden', () => {
    const html = render(order({ examples: [{ raw: '13/14/26', read: null }] }));
    assert.match(html, /can&#x27;t read/);
  });

  it('month sheet, year known: says what every row is dated and where the year came from', () => {
    const html = render({ kind: 'monthSheet', month: 9, date: '2026-09-01', yearFrom: 'fileName' });
    assert.match(html, /Every row is dated 1 Sep 2026: month from the sheet name, year from the file name\./);
    assert.doesNotMatch(html, /Skip rows/); // nothing to pick
  });

  it('month sheet, year missing: asks for it and offers this year, the two before, and skip', () => {
    const html = render({ kind: 'monthSheet', month: 9, date: null, yearFrom: null });
    assert.match(html, /No year found/);
    for (const label of ['2026', '2025', '2024', 'Skip rows']) assert.match(html, new RegExp(`>${label}<`));
  });

  it('month sheet, skip chosen: says the rows are skipped', () => {
    const html = render({ kind: 'monthSheet', month: 9, date: null, yearFrom: null }, { yearChoice: 'skip' });
    assert.match(html, /Rows skipped: they have no date\./);
    assert.doesNotMatch(html, /No year found/);
  });

  it('month sheet, year picked: shows the date and keeps the buttons so it can be changed', () => {
    const html = render({ kind: 'monthSheet', month: 9, date: '2026-09-01', yearFrom: 'choice' }, { yearChoice: 2026 });
    assert.match(html, /year you picked/);
    assert.match(html, /aria-pressed="true"[^>]*>2026</);
  });
});
