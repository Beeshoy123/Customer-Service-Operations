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
  uploadStatus?: UploadStatus | null;
  onFiles: (files: File[]) => void;
  mappingReview?: MappingDiagnostic[];
  onContinueImport?: (mappingOverrides: Record<string, string | null>) => void;
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

export const ImportLanding: React.FC<ImportLandingProps> = ({ accountName, uploadStatus, onFiles, mappingReview = [], onContinueImport, rateMergeStyle = 'arithmetic-average', onRateMergeStyleChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mappingAnswers, setMappingAnswers] = useState<Record<string, string | null>>({});

  const mappingOptions = [
    ['agentName', 'Agent name'], ['employeeId', 'Employee ID'], ['date', 'Date'],
    ['supervisor', 'Supervisor'], ['calls', 'Calls'], ['aht', 'AHT'],
    ['resolveTotalContacts', 'Resolve total contacts'], ['resolveTotalContacts2hr', 'Resolve 2-hour contacts'],
    ['resolveTotalContacts3d', 'Resolve 3-day contacts'], ['resolve2hr', 'Resolve 2-hour rate'],
    ['resolve3d', 'Resolve 3-day rate'], ['handoffs', 'Handoff rate'], ['surveys', 'Surveys'],
    ['promoters', 'Promoters'], ['none', 'Ignore this column'],
  ] as const;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

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

  return (
    <section className="import-landing" aria-label="Import dashboard data">
      {!isImporting || needsReview ? (
        <div className="import-landing-panel">
          <header className="import-landing-header">
            <div>
              <p className="import-landing-eyebrow">Now importing for</p>
              <h1>{accountName}</h1>
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

          {needsReview && (
            <div className="import-mapping-review" role="alert">
              <strong>Some columns need your attention</strong>
              <p>Import paused before dashboard calculations. These mappings may affect the big picture:</p>
              <ul>
                {mappingReview.slice(0, 12).map((item, index) => (
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
                ))}
              </ul>
              {mappingReview.length > 12 && <small>+ {mappingReview.length - 12} more fields</small>}
              <button type="button" onClick={() => onContinueImport?.(mappingAnswers)}>Continue with answers</button>
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
      ) : (
        <div className="import-progress-panel">
          <div className="import-orb"><span>{Math.round(progress)}%</span></div>
          <h1>Turning your data into insights</h1>
          <p>{uploadStatus?.message || 'Opening your files'}</p>
          <div className="import-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <small>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} queued for verification</small>
        </div>
      )}
    </section>
  );
};

export default ImportLanding;
