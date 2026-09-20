import React, { useEffect, useRef, useState } from 'react';
import './ImportLanding.css';
import type { MappingDiagnostic } from '../import/types';

type UploadStatus = {
  type?: 'info' | 'success' | 'error';
  message?: string;
  progress?: number;
};

type ImportLandingProps = {
  accountName: string;
  accountOptions?: string[];
  onAccountNameChange?: (accountName: string) => void;
  uploadStatus?: UploadStatus | null;
  onFiles: (files: File[]) => void;
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

export const ImportLanding: React.FC<ImportLandingProps> = ({ accountName, accountOptions = ['Verizon Consumer'], onAccountNameChange, uploadStatus, onFiles, mappingReview = [], onContinueImport, rateMergeStyle = 'arithmetic-average', onRateMergeStyleChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mappingAnswers, setMappingAnswers] = useState<Record<string, string | null>>({});
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [accountChoice, setAccountChoice] = useState('');
  const [awaitingAccountSelection, setAwaitingAccountSelection] = useState(false);
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
    if (!accountName || !awaitingAccountSelection || queuedFiles.length === 0) return;
    setAwaitingAccountSelection(false);
    setIsProcessing(true);
    onFiles(queuedFiles);
  }, [accountName, awaitingAccountSelection, onFiles, queuedFiles]);

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
    setQueuedFiles(supported);
    const next = supported.map((file) => ({ file, state: 'scanning' as const }));
    setSelectedFiles((current) => [...current, ...next]);

    window.setTimeout(() => {
      setSelectedFiles((current) => current.map((item) =>
        supported.some((file) => file === item.file)
          ? { ...item, state: 'ready', detectedAs: 'Ready to import' }
          : item
      ));
      if (!accountName) {
        setIsWaiting(false);
        setAwaitingAccountSelection(true);
        return;
      }
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
    : Boolean(currentAnswer);

  const advanceReview = () => {
    if (!currentReviewItem || !currentQuestionReady) return;
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
              <h1>{accountName || 'Choose account after upload'}</h1>
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

          {selectedFiles.length > 0 && !accountName && awaitingAccountSelection && (
            <div className="import-account-choice">
              <label htmlFor="import-account-name">Account</label>
              <select
                id="import-account-name"
                value={accountChoice}
                onChange={(event) => setAccountChoice(event.target.value)}
              >
                <option value="">Choose an account</option>
                {Array.from(new Set(['Verizon Consumer', ...accountOptions])).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="__custom__">Other account...</option>
              </select>
              {accountChoice === '__custom__' && (
                <input
                  type="text"
                  placeholder="Type account name"
                  onChange={(event) => setAccountChoice(event.target.value)}
                />
              )}
              <button
                type="button"
                disabled={!accountChoice || accountChoice === '__custom__'}
                onClick={() => onAccountNameChange?.(accountChoice)}
              >
                Continue with account
              </button>
            </div>
          )}

          <label className="import-calculation-style">
            Rate calculation
            <select value={rateMergeStyle} onChange={(event) => onRateMergeStyleChange?.(event.target.value as 'arithmetic-average' | 'weighted-by-counts')}>
              <option value="arithmetic-average">Arithmetic average (existing default)</option>
              <option value="weighted-by-counts">Weighted by counts</option>
            </select>
          </label>

          {needsReview && (
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
            : 'One quick question about your data')}</h1>
          <p>
            {currentReviewItem?.unrecognizedPlausible
              ? `Found a column called ${currentReviewItem.header} that is not one of the metrics this app already tracks. Want to add it as a custom metric?`
              : currentReviewItem?.resolveWindow
                ? 'Which role should this column have in your account? Choose the tracked window or ignore it.'
                : `What should we do with ${currentReviewItem?.header || 'this column'}?`}
          </p>

          <div className="import-question-card">
            <strong>{currentReviewItem?.header || 'Review this column'}</strong>

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
