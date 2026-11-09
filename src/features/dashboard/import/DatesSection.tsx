// DatesSection.tsx — the "Dates" section of the import preview, one sheet at a time.
// Presentational only: what to show is decided by describeSheetDates (datePreview.ts).
import React from 'react';
import type { DateOrder } from './dateText';
import { formatIsoDate, type DatesPreview } from './datePreview';

export interface DatesSectionProps {
  preview: DatesPreview;
  /** Years offered for a month-named sheet: this year and the two before. */
  currentYear: number;
  yearChoice?: number | 'skip';
  onOrderChange: (order: DateOrder) => void;
  onYearChange: (year: number | 'skip') => void;
}

const ORDER_LABEL: Record<DateOrder, string> = { dayFirst: 'DD/MM', monthFirst: 'MM/DD' };

const Status: React.FC<{ tone: 'ok' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`ipm-dates-status ipm-dates-status-${tone}`} role={tone === 'warn' ? 'alert' : 'status'}>
    {children}
  </div>
);

export const DatesSection: React.FC<DatesSectionProps> = ({ preview, currentYear, yearChoice, onOrderChange, onYearChange }) => {
  if (preview.kind === 'none') return null;

  if (preview.kind === 'order') {
    const { proof, detected, effective, overridesProof, numericCount, proofExample, examples } = preview;
    const usingChoice = effective !== detected;
    return (
      <div className="ipm-section ipm-dates" data-testid="dates-section">
        <div className="ipm-section-header">
          <div>
            <h3 className="ipm-section-title"><span>📅</span> Dates</h3>
            <p className="ipm-section-desc">
              How dates like 05/09/2026 are read. A sheet is read one way, with {numericCount} such date{numericCount === 1 ? '' : 's'} here.
            </p>
          </div>
        </div>

        {proof === 'proven' && !overridesProof && (
          <Status tone="ok">
            Read as {ORDER_LABEL[detected]}. {proofExample} proves it: the number above 12 can only be the day.
          </Status>
        )}
        {proof === 'proven' && overridesProof && (
          <Status tone="warn">
            You chose {ORDER_LABEL[effective]}, which overrides what the file proves ({proofExample}). Dates that only fit
            one order are still corrected one by one.
          </Status>
        )}
        {proof === 'unproven' && (
          <Status tone="warn">
            Can't tell the order: every date has both numbers at 12 or less. Check that the examples below match your
            file. {usingChoice ? `Using ${ORDER_LABEL[effective]}, your choice.` : `Using ${ORDER_LABEL[effective]}, the default.`}
          </Status>
        )}
        {proof === 'mixed' && (
          <Status tone="warn">
            This sheet mixes both orders. Dates that only fit one order are read that way; the rest follow {ORDER_LABEL[effective]}.
          </Status>
        )}

        <div className="ipm-dates-choices" role="group" aria-label="Day and month order">
          {(['dayFirst', 'monthFirst'] as const).map((order) => (
            <button
              key={order}
              type="button"
              className={`ipm-dates-choice${effective === order ? ' ipm-dates-choice-on' : ''}`}
              aria-pressed={effective === order}
              onClick={() => onOrderChange(order)}
            >
              {ORDER_LABEL[order]}
            </button>
          ))}
        </div>

        <ul className="ipm-dates-examples">
          {examples.map((example) => (
            <li key={example.raw}>
              <code>{example.raw}</code>
              <span>{example.read ? formatIsoDate(example.read) : "can't read"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { date, yearFrom } = preview;
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];
  const needsYear = date === null;
  const source = yearFrom === 'fileName' ? 'year from the file name' : yearFrom === 'choice' ? 'year you picked' : 'year from the sheet name';
  return (
    <div className="ipm-section ipm-dates" data-testid="dates-section">
      <div className="ipm-section-header">
        <div>
          <h3 className="ipm-section-title"><span>📅</span> Dates</h3>
          <p className="ipm-section-desc">This sheet has no date column, so its month comes from the sheet name.</p>
        </div>
      </div>

      {date !== null && <Status tone="ok">Every row is dated {formatIsoDate(date)}: month from the sheet name, {source}.</Status>}
      {needsYear && yearChoice !== 'skip' && (
        <Status tone="warn">No year found in the sheet or file name. Pick the year, or these rows are skipped because they have no date.</Status>
      )}
      {needsYear && yearChoice === 'skip' && <Status tone="warn">Rows skipped: they have no date.</Status>}

      {(needsYear || yearFrom === 'choice') && (
        <div className="ipm-dates-choices" role="group" aria-label="Year for this sheet">
          {yearOptions.map((year) => (
            <button
              key={year}
              type="button"
              className={`ipm-dates-choice${yearChoice === year ? ' ipm-dates-choice-on' : ''}`}
              aria-pressed={yearChoice === year}
              onClick={() => onYearChange(year)}
            >
              {year}
            </button>
          ))}
          <button
            type="button"
            className={`ipm-dates-choice${yearChoice === 'skip' ? ' ipm-dates-choice-on' : ''}`}
            aria-pressed={yearChoice === 'skip'}
            onClick={() => onYearChange('skip')}
          >
            Skip rows
          </button>
        </div>
      )}
    </div>
  );
};
