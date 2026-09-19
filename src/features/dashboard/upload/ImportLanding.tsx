import React, { useEffect, useRef, useState } from 'react';
import './ImportLanding.css';

type UploadStatus = {
  type?: 'info' | 'success' | 'error';
  message?: string;
  progress?: number;
};

type ImportLandingProps = {
  accountName: string;
  uploadStatus?: UploadStatus | null;
  onFiles: (files: File[]) => void;
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

export const ImportLanding: React.FC<ImportLandingProps> = ({ accountName, uploadStatus, onFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
          ? { ...item, state: 'ready', detectedAs: 'Ready for preview' }
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
    : isProcessing ? 8 : 0;
  const isImporting = isProcessing || uploadStatus?.type === 'info';

  return (
    <section className="import-landing" aria-label="Import dashboard data">
      {!isImporting ? (
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
            <p className="import-notice success">Files will be classified from their real headers in the import preview.</p>
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
