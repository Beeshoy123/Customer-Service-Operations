import React, { useEffect, useRef, useState } from 'react';
import './ImportLanding.css';
import { listAccountNames } from '../../accountSetup/account-profile-storage';
import type { MappingDiagnostic } from '../import/types';

type UploadStatus = {
  type?: 'info' | 'success' | 'error';
  message?: string;
  progress?: number;
};

type ImportLandingProps = {
  accountName: string;
  uploadStatus?: UploadStatus | null;
  onFiles: (files: File[]) => void;
  /** Fired when the wizard's account question is answered while no account is
   * set yet (detection fallback). The parent sets the account and resumes the
   * paused import with the already-scanned files. */
  onAccountSelected?: (accountName: string) => void;
  /** Opens the account setup wizard for a brand-new account (used by the
   * detection-fallback card when no saved account matches). */
  onOpenSetup?: () => void;
  mappingReview?: MappingDiagnostic[];
  onContinueImport?: (
    mappingOverrides: Record<string, string | null>,
    customMetricAnswers?: Record<string, {
      decision?: 'accept' | 'ignore';
      label?: string;
      calcStyle?: 'per-call-average' | 'total-amount' | 'frequency';
      target?: number;
      higherIsBetter?: boolean;
    }>
  ) => void;
  rateMergeStyle?: 'arithmetic-average' | 'weighted-by-counts';
  onRateMergeStyleChange?: (style: 'arithmetic-average' | 'weighted-by-counts') => void;
};

type SelectedFile = {
  file: File;
  state: 'scanning' | 'ready';
  detectedAs?: string;
};

const fileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ImportLanding: React.FC<ImportLandingProps> = ({ accountName, onAccountSelected, onOpenSetup, uploadStatus, onFiles, mappingReview = [], onContinueImport, rateMergeStyle = 'arithmetic-average', onRateMergeStyleChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mappingAnswers, setMappingAnswers] = useState<Record<string, string | null>>({});
  const [accountChoice, setAccountChoice] = useState('');
  const accountChoiceItem = mappingReview.find((item) => item.accountChoice);
  // Saved accounts offered in the detection-fallback card. Read imperatively
  // at render time (never memoized): accounts can be created while the import
  // is paused, and a stale snapshot used to leave the picker empty with no way
  // to pick — which made "Import for this account" look dead.
  const getSavedAccountNames = (): string[] => {
    try {
      return listAccountNames();
    } catch {
      return [];
    }
  };
  const savedAccountNames = getSavedAccountNames();
  // Refresh the list whenever the fallback card appears or the account name
  // changes (e.g. right after "Set up a new account" completes).
  useEffect(() => {
    if (!accountChoiceItem) return;
    setAccountChoice((current) => {
      const names = getSavedAccountNames();
      if (current && !names.includes(current)) {
        setOtherAccountMode(true);
      } else if (current && names.includes(current)) {
        setSelectedAccount(current);
      }
      return current;
    });
  }, [accountChoiceItem]);
  // Visible <select> state. `otherAccountMode` reveals a free-text input for
  // brand-new account names (the old input+datalist hid the saved accounts and
  // its native popup frequently failed to register, leaving users staring at
  // a disabled-looking button).
  const [selectedAccount, setSelectedAccount] = useState('');
  const [otherAccountMode, setOtherAccountMode] = useState(false);
  // When true, the button is always clickable; clicking without a selection
  // shows helper text instead of silently doing nothing.
  const hasAccountOptions = otherAccountMode || savedAccountNames.length > 0;
  const effectiveAccountChoice = otherAccountMode ? accountChoice.trim() : selectedAccount.trim();
  const [customMetricAnswers, setCustomMetricAnswers] = useState<Record<string, {
    decision?: 'accept' | 'ignore';
    label?: string;
    calcStyle?: 'per-call-average' | 'total-amount' | 'frequency';
    target?: number;
    higherIsBetter?: boolean;
  }>>({});
  const [reviewStep, setReviewStep] = useState(0);

  const mappingOptions = [
    ['agentName', 'Agent name'], ['employeeId', 'Employee ID'], ['date', 'Date'],
    ['supervisor', 'Supervisor'], ['calls', 'Calls'], ['aht', 'AHT'],
    ['resolveTotalContacts', 'Resolve total contacts'], ['resolveTotalContacts2hr', 'Resolve 2-hour contacts'],
    ['resolveTotalContacts3d', 'Resolve 3-day contacts'], ['resolve2hr', 'Resolve 2-hour rate'],
    ['resolve3d', 'Resolve 3-day rate'], ['handoffs', 'Handoff rate'], ['surveys', 'Surveys'],
    ['resolveSameDay', 'Same-day resolve/repeat'], ['resolve5d', 'Resolve 5-day rate'],
    ['resolve7d', 'Resolve 7-day rate'], ['promoters', 'Promoters'], ['none', 'Ignore this column'],
  ] as const;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (mappingReview.length === 0) return;
    setMappingAnswers((current) => {
      const next = { ...current };
      for (const item of mappingReview) {
        if (item.choiceGroup === 'customer-experience-agent-survey') {
          next[item.header] = null;
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(next, item.header)) {
          next[item.header] = item.mappedField;
        }
      }
      return next;
    });
  }, [mappingReview]);

  useEffect(() => {
    setReviewStep(0);
  }, [mappingReview.length]);

  const resetStart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsWaiting(false);
    setIsProcessing(false);
  };

  const queueFiles = (incoming: File[]) => {
    const supported = incoming.filter((file) => /\.(csv|tsv|txt|xls|xlsx|xlsm)$/i.test(file.name));
    if (!supported.length) return;

    resetStart();
    const next = supported.map((file) => ({ file, state: 'scanning' as const }));
    setSelectedFiles((current) => [...current, ...next]);

    window.setTimeout(() => {
      setSelectedFiles((current) => current.map((item) =>
        supported.some((file) => file === item.file)
          ? { ...item, state: 'ready', detectedAs: 'Ready to import' }
          : item
      ));
      // No up-front account question: hand the files straight to the import
      // flow, which auto-detects the account from the data and only asks in
      // the wizard when detection fails.
      setIsWaiting(true);
      timerRef.current = setTimeout(() => {
        setIsWaiting(false);
        setIsProcessing(true);
        onFiles(supported);
      }, 3000);
    }, 450);
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    queueFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    queueFiles(Array.from(event.dataTransfer.files || []));
  };

  const progress = typeof uploadStatus?.progress === 'number'
    ? Math.max(0, Math.min(100, uploadStatus.progress))
    : 0;
  const isImporting = isProcessing || uploadStatus?.type === 'info';
  const needsReview = mappingReview.length > 0;
  // Detection-fallback card: the import is paused ONLY because the data did
  // not match a saved account. Answering here resumes with the same files —
  // no fake __account__ column ever reaches the mapping wizard.
  const [accountHint, setAccountHint] = useState('');
  const resumeWithAccount = (name: string) => {
    if (!onAccountSelected) return;
    if (!name) {
      // The button is deliberately never disabled — a dead-looking button was
      // half of this bug report. Clicking without a choice explains itself.
      setAccountHint(hasAccountOptions
        ? 'Pick an account above first (or choose "Other / new account…").'
        : 'No saved accounts yet — type a name for the first one.');
      return;
    }
    setAccountHint('');
    onAccountSelected(name);
  };
  // One picker rendered in BOTH places the fallback question can appear
  // (landing card + wizard step): a visible <select> of saved accounts so the
  // choices are always on screen — the old datalist hid them behind a text
  // input that looked like an empty box.
  const renderAccountPicker = (compact: boolean) => {
    const names = getSavedAccountNames();
    const listId = compact ? 'import-account-select-landing' : 'import-account-select-step';
    return (
      <>
        {!otherAccountMode && (
          <select
            id={listId}
            aria-label="Choose a saved account"
            value={selectedAccount}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '__other__') {
                setOtherAccountMode(true);
                setSelectedAccount('');
                return;
              }
              setSelectedAccount(value);
              setAccountHint('');
            }}
          >
            <option value="">Select an account…</option>
            {names.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value="__other__">Other / new account…</option>
          </select>
        )}
        {otherAccountMode && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              autoFocus
              placeholder="New account name…"
              value={accountChoice}
              onChange={(event) => setAccountChoice(event.target.value)}
              style={compact
                ? { flex: '1 1 220px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa' }
                : undefined}
            />
            <button
              type="button"
              onClick={() => { setOtherAccountMode(false); setAccountChoice(''); }}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #3f3f46', background: 'transparent', color: '#d4d4d8', cursor: 'pointer' }}
            >
              Back to saved accounts
            </button>
          </div>
        )}
      </>
    );
  };
  const customerExperienceChoices = mappingReview.filter(
    (item) => item.choiceGroup === 'customer-experience-agent-survey'
  );
  const customMetricQuestions = mappingReview.filter((item) => item.unrecognizedPlausible);
  const customMetricQuestionsReady = customMetricQuestions.every((item) => {
    const answer = customMetricAnswers[item.header];
    return answer?.decision === 'ignore' || (
      answer?.decision === 'accept' && Boolean(answer.label?.trim()) && Boolean(answer.calcStyle)
    );
  });
  const reviewQuestions = mappingReview.filter((item, index, items) =>
    item.choiceGroup !== 'customer-experience-agent-survey' ||
    items.findIndex((candidate) => candidate.choiceGroup === item.choiceGroup) === index
  );
  const currentReviewItem = reviewQuestions[reviewStep];
  const currentCustomAnswer = currentReviewItem
    ? customMetricAnswers[currentReviewItem.header]
    : undefined;
  const currentAnswer = currentReviewItem ? mappingAnswers[currentReviewItem.header] : undefined;
  const currentQuestionReady = currentReviewItem?.unrecognizedPlausible
    ? currentCustomAnswer?.decision === 'ignore' || (
      currentCustomAnswer?.decision === 'accept' &&
      Boolean(currentCustomAnswer.label?.trim()) &&
      Boolean(currentCustomAnswer.calcStyle)
    )
    : currentReviewItem?.accountChoice
      // The account question is answered through its own buttons; the generic
      // "Continue" step never applies to it.
      ? false
      : Boolean(currentAnswer);

  const advanceReview = () => {
    if (!currentReviewItem || !currentQuestionReady || currentReviewItem.accountChoice) return;
    if (reviewStep < reviewQuestions.length - 1) {
      setReviewStep((step) => step + 1);
      return;
    }
    onContinueImport?.(mappingAnswers, customMetricAnswers);
  };

  return (
    <section className="import-landing" aria-label="Import dashboard data">
      {!isImporting ? (
        <div className="import-landing-panel">
          <header className="import-landing-header">
            <div>
              <p className="import-landing-eyebrow">{accountName ? 'Now importing for' : 'Start a new account import'}</p>
              <h1>{accountName || 'Drop files — I will recognize the account'}</h1>
            </div>
            <span className="import-landing-mark" aria-hidden="true">CSO</span>
          </header>

          <div
            className={`import-dropzone${isDragOver ? ' is-dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
          >
            <span className="import-upload-icon" aria-hidden="true">^</span>
            <strong>Drop workbooks here</strong>
            <span>.xlsx, .csv, .tsv - I will sort it out</span>
          </div>
          <input ref={inputRef} type="file" multiple accept=".csv,.txt,.tsv,.xls,.xlsx,.xlsm" onChange={handleInput} />

          {selectedFiles.length > 0 && (
            <div className="import-file-list">
              {selectedFiles.map((item) => (
                <div className="import-file-row" key={`${item.file.name}-${item.file.lastModified}`}>
                  <span className={`import-file-status ${item.state}`}>{item.state === 'scanning' ? '...' : 'OK'}</span>
                  <span className="import-file-name">{item.file.name}</span>
                  <span className="import-file-size">{fileSize(item.file.size)}</span>
                  <span className="import-file-type">{item.state === 'scanning' ? 'Scanning columns...' : item.detectedAs}</span>
                </div>
              ))}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <p className="import-notice success">Files will be mapped automatically from their real headers.</p>
          )}

          <label className="import-calculation-style">
            Rate calculation
            <select value={rateMergeStyle} onChange={(event) => onRateMergeStyleChange?.(event.target.value as 'arithmetic-average' | 'weighted-by-counts')}>
              <option value="arithmetic-average">Arithmetic average (existing default)</option>
              <option value="weighted-by-counts">Weighted by counts</option>
            </select>
          </label>

          {accountChoiceItem && (
            <div className="import-mapping-review" role="alert">
              <strong>{accountChoiceItem.choiceQuestion}</strong>
              <p>Your files are already scanned and safe — pick the account below or set up a new one, and the import resumes right where it paused. No need to re-upload.</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
                {renderAccountPicker(true)}
                <button
                  type="button"
                  onClick={() => resumeWithAccount(effectiveAccountChoice)}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  Import for this account
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSetup?.()}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #3f3f46', background: 'transparent', color: '#d4d4d8', cursor: 'pointer' }}
                >
                  Set up a new account
                </button>
              </div>
              {accountHint && <p style={{ marginTop: 8, color: '#fbbf24', fontSize: 13 }}>{accountHint}</p>}
            </div>
          )}

          {needsReview && !accountChoiceItem && (
            <div className="import-mapping-review" role="alert">
              <strong>{customMetricQuestions.length > 0
                ? 'Unrecognized but plausible metric columns found'
                : customerExperienceChoices.length > 0
                ? customerExperienceChoices[0].choiceQuestion
                : mappingReview.some((item) => item.resolveWindow)
                  ? 'Choose the tracked resolve windows'
                  : 'A few columns need your attention'}</strong>
              <p>{mappingReview.some((item) => item.resolveWindow)
                ? 'Assign exactly one candidate to the short-term window and one to the long-term window. Leave the other windows ignored.'
                : customMetricQuestions.length > 0
                  ? 'Choose whether to add each column as a custom dashboard metric. Accepted metrics are remembered for this account.'
                  : customerExperienceChoices.length > 0
                  ? 'This answer is saved for the account and will not be asked again for these columns.'
                : 'Import paused briefly for the few mappings that are genuinely ambiguous.'}</p>
              {mappingReview.some((item) => item.duplicateFileNames?.length) && (
                <small className="import-review-deduped">
                  A header that appears in multiple files is asked once — the answer applies to every uploaded file.
                </small>
              )}
              <ul>
                {mappingReview.slice(0, 12).map((item, index) => (
                  item.unrecognizedPlausible
                    ? (
                      <li key={`${item.fileName}-${item.sheetName}-custom-${item.header}`}>
                        <span>Found a column called {item.header} that isn&apos;t one of the metrics this app already tracks — want to add it as a custom metric on your dashboard?</span>
                        <select
                          value={customMetricAnswers[item.header]?.decision ?? ''}
                          onChange={(event) => setCustomMetricAnswers((current) => ({
                            ...current,
                            [item.header]: {
                              ...current[item.header],
                              decision: event.target.value as 'accept' | 'ignore',
                            },
                          }))}
                        >
                          <option value="">Choose an answer</option>
                          <option value="accept">Yes, add it</option>
                          <option value="ignore">No, ignore it</option>
                        </select>
                        {customMetricAnswers[item.header]?.decision === 'accept' && (
                          <div className="import-custom-metric-fields">
                            <input
                              type="text"
                              placeholder="Metric label"
                              value={customMetricAnswers[item.header]?.label ?? ''}
                              onChange={(event) => setCustomMetricAnswers((current) => ({
                                ...current,
                                [item.header]: { ...current[item.header], decision: 'accept', label: event.target.value },
                              }))}
                            />
                            <select
                              value={customMetricAnswers[item.header]?.calcStyle ?? ''}
                              onChange={(event) => setCustomMetricAnswers((current) => ({
                                ...current,
                                [item.header]: { ...current[item.header], decision: 'accept', calcStyle: event.target.value as 'per-call-average' | 'total-amount' | 'frequency' },
                              }))}
                            >
                              <option value="">Calculation style</option>
                              <option value="per-call-average">Per-call average</option>
                              <option value="total-amount">Total sum</option>
                              <option value="frequency">Frequency %</option>
                            </select>
                            <input
                              type="number"
                              placeholder="Target"
                              value={customMetricAnswers[item.header]?.target ?? ''}
                              onChange={(event) => setCustomMetricAnswers((current) => ({
                                ...current,
                                [item.header]: { ...current[item.header], decision: 'accept', target: Number(event.target.value || 0) },
                              }))}
                            />
                            <label>
                              <input
                                type="checkbox"
                                checked={customMetricAnswers[item.header]?.higherIsBetter ?? true}
                                onChange={(event) => setCustomMetricAnswers((current) => ({
                                  ...current,
                                  [item.header]: { ...current[item.header], decision: 'accept', higherIsBetter: event.target.checked },
                                }))}
                              />
                              Higher is better
                            </label>
                          </div>
                        )}
                      </li>
                    )
                    : item.choiceGroup === 'customer-experience-agent-survey'
                    ? item !== customerExperienceChoices[0]
                      ? null
                      : (
                        <li key={`${item.fileName}-${item.sheetName}-customer-experience-choice`}>
                          <span>Survey candidates</span>
                          <select
                            value={customerExperienceChoices.find((candidate) => mappingAnswers[candidate.header] === 'vxs')?.header ?? ''}
                            onChange={(event) => setMappingAnswers((current) => ({
                              ...current,
                              ...Object.fromEntries(customerExperienceChoices.map((candidate) => [
                                candidate.header,
                                candidate.header === event.target.value ? 'vxs' : null,
                              ])),
                            }))}
                          >
                            <option value="">Choose the agent-specific survey</option>
                            {(item.choiceOptions || customerExperienceChoices.map((candidate) => candidate.header)).map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </li>
                      )
                    : (
                  <li
                    key={`${item.fileName}-${item.sheetName}-${item.header}`}
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <span>{item.header}</span>
                    <small>
                      {item.collisionWith?.length
                        ? `collision with ${item.collisionWith.join(', ')}`
                        : item.mappedField
                          ? `${item.mappedField} (${item.confidence})`
                          : 'unmapped'}
                    </small>
                    <select
                      value={mappingAnswers[item.header] ?? item.mappedField ?? 'none'}
                      onChange={(event) => setMappingAnswers((current) => ({ ...current, [item.header]: event.target.value === 'none' ? null : event.target.value }))}
                    >
                      {mappingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </li>
                      )
                ))}
              </ul>
              {mappingReview.length > 12 && <small>+ {mappingReview.length - 12} more fields</small>}
              <button
                type="button"
                disabled={!customMetricQuestionsReady}
                onClick={() => onContinueImport?.(mappingAnswers, customMetricAnswers)}
              >
                Continue with answers
              </button>
            </div>
          )}

          {isWaiting && (
            <div className="import-countdown">
              <div className="import-countdown-track"><span /></div>
              <span>Starting in 3s</span>
              <button type="button" onClick={(event) => { event.stopPropagation(); resetStart(); }}>wait</button>
            </div>
          )}
        </div>
      ) : needsReview ? (
        <div className="import-progress-panel import-question-panel">
          <div className="import-question-progress">
            Question {reviewStep + 1} of {reviewQuestions.length}
          </div>
          <div className="import-orb import-question-orb" aria-hidden="true"><span>?</span></div>
          <h1>{currentReviewItem?.choiceQuestion || (currentReviewItem?.unrecognizedPlausible
            ? 'Custom metric question'
            : currentReviewItem?.accountChoice
              ? 'Which account is this data for?'
              : 'One quick question about your data')}</h1>
          <p>
            {currentReviewItem?.unrecognizedPlausible
              ? `Found a column called ${currentReviewItem.header} that is not one of the metrics this app already tracks. Want to add it as a custom metric?`
              : currentReviewItem?.resolveWindow
                ? 'Which role should this column have in your account? Choose the tracked window or ignore it.'
                : currentReviewItem?.accountChoice
                  ? 'Your files are scanned and safe. Pick a saved account below (or set up a new one) and the import resumes right where it paused — no re-upload needed.'
                  : `What should we do with ${currentReviewItem?.header || 'this column'}?`}
          </p>

          <div className="import-question-card">
            {currentReviewItem?.accountChoice ? (
              <>
                <strong>{savedAccountNames.length ? 'Pick a saved account' : 'Name this account'}</strong>
                {renderAccountPicker(false)}
                <button
                  type="button"
                  onClick={() => resumeWithAccount(effectiveAccountChoice)}
                >
                  Import for this account
                </button>
                {accountHint && (
                  <p style={{ color: '#fbbf24', fontSize: 13, margin: '6px 0 0' }}>{accountHint}</p>
                )}
                <button type="button" onClick={() => onOpenSetup?.()}>
                  Set up a new account
                </button>
              </>
            ) : (
              <strong>{currentReviewItem?.header || 'Review this column'}</strong>
            )}

            {currentReviewItem?.unrecognizedPlausible ? (
              <>
                <select
                  value={currentCustomAnswer?.decision ?? ''}
                  onChange={(event) => setCustomMetricAnswers((current) => ({
                    ...current,
                    [currentReviewItem.header]: {
                      ...current[currentReviewItem.header],
                      decision: event.target.value as 'accept' | 'ignore',
                    },
                  }))}
                >
                  <option value="">Choose an answer</option>
                  <option value="accept">Yes, add it</option>
                  <option value="ignore">No, ignore it</option>
                </select>
                {currentCustomAnswer?.decision === 'accept' && (
                  <div className="import-custom-metric-fields">
                    <input
                      type="text"
                      placeholder="Metric label"
                      value={currentCustomAnswer.label ?? ''}
                      onChange={(event) => setCustomMetricAnswers((current) => ({
                        ...current,
                        [currentReviewItem.header]: { ...current[currentReviewItem.header], decision: 'accept', label: event.target.value },
                      }))}
                    />
                    <select
                      value={currentCustomAnswer.calcStyle ?? ''}
                      onChange={(event) => setCustomMetricAnswers((current) => ({
                        ...current,
                        [currentReviewItem.header]: { ...current[currentReviewItem.header], decision: 'accept', calcStyle: event.target.value as 'per-call-average' | 'total-amount' | 'frequency' },
                      }))}
                    >
                      <option value="">Calculation style</option>
                      <option value="per-call-average">Per-call average</option>
                      <option value="total-amount">Total sum</option>
                      <option value="frequency">Frequency %</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Target"
                      value={currentCustomAnswer.target ?? ''}
                      onChange={(event) => setCustomMetricAnswers((current) => ({
                        ...current,
                        [currentReviewItem.header]: { ...current[currentReviewItem.header], decision: 'accept', target: Number(event.target.value || 0) },
                      }))}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={currentCustomAnswer.higherIsBetter ?? true}
                        onChange={(event) => setCustomMetricAnswers((current) => ({
                          ...current,
                          [currentReviewItem.header]: { ...current[currentReviewItem.header], decision: 'accept', higherIsBetter: event.target.checked },
                        }))}
                      />
                      Higher is better
                    </label>
                  </div>
                )}
              </>
            ) : currentReviewItem?.choiceGroup === 'customer-experience-agent-survey' ? (
              <select
                value={customerExperienceChoices.find((candidate) => mappingAnswers[candidate.header] === 'vxs')?.header ?? ''}
                onChange={(event) => setMappingAnswers((current) => ({
                  ...current,
                  ...Object.fromEntries(customerExperienceChoices.map((candidate) => [
                    candidate.header,
                    candidate.header === event.target.value ? 'vxs' : null,
                  ])),
                }))}
              >
                <option value="">Choose the agent-specific survey</option>
                {(currentReviewItem.choiceOptions || customerExperienceChoices.map((candidate) => candidate.header)).map((header) => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
            ) : (
              <select
                value={currentAnswer ?? ''}
                onChange={(event) => setMappingAnswers((current) => ({
                  ...current,
                  [currentReviewItem.header]: event.target.value || null,
                }))}
              >
                <option value="">Choose what to do</option>
                {mappingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}

            <button type="button" disabled={!currentQuestionReady} onClick={advanceReview}>
              {reviewStep === reviewQuestions.length - 1 ? 'Finish and continue' : 'Next question'}
            </button>
          </div>
          <small>{currentReviewItem?.confidence ? `${currentReviewItem.confidence} match` : 'Needs your answer'}</small>
        </div>
      ) : (
        <div className="import-progress-panel">
          <div className="import-orb"><span>{Math.round(progress)}%</span></div>
          <h1>Turning your data into insights</h1>
          <p>{uploadStatus?.message || 'Opening your files'}</p>
          <div
            className="import-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            style={{ '--import-progress': `${progress}%` } as React.CSSProperties}
          />
          <small>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} queued for verification</small>
        </div>
      )}
    </section>
  );
};

export default ImportLanding;
