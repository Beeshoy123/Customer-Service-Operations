// Extracted from App.tsx (Phase 1 move-only refactor) — behavior must stay identical.

// ─── Upload Status Toast ──────────────────────────────────────
export type UploadStatusPayload = {
  type?: 'error' | 'info' | 'success';
  message?: string;
  progress?: number;
  cancelAction?: (() => void) | null;
};

export const UploadStatus = ({ uploadStatus }: { uploadStatus: UploadStatusPayload | null | undefined }) => {
  if (!uploadStatus) return null;

  const progress = typeof uploadStatus.progress === 'number' ? Math.max(0, Math.min(uploadStatus.progress, 100)) : null;

  return (
    <div className="fixed top-24 left-1-2 -translate-x-1-2 z-1000 p-3 px-6 rounded-lg shadow-lg flex items-center gap-3 font-bold animate-slide-down" style={{ background: uploadStatus.type === 'error' ? '#fef2f2' : uploadStatus.type === 'info' ? '#eff6ff' : '#ecfdf5', color: uploadStatus.type === 'error' ? '#991b1b' : uploadStatus.type === 'info' ? '#1e40af' : '#065f46', border: `1px solid ${uploadStatus.type === 'error' ? '#fecaca' : uploadStatus.type === 'info' ? '#bfdbfe' : '#a7f3d0'}` }}>
      <div className="flex items-center gap-3">
        {uploadStatus.type === 'error' ? '❌' : uploadStatus.type === 'info' ? '🔄' : '✅'}
        <div className="flex flex-col gap-2">
          <span>{uploadStatus.message}</span>
          {progress !== null && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-300/60">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] opacity-80">{progress}%</span>
            </div>
          )}
        </div>
      </div>
      {uploadStatus.cancelAction && (
        <button
          type="button"
          onClick={uploadStatus.cancelAction}
          className="ml-2 rounded-full border border-slate-400 bg-white/60 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
      )}
    </div>
  );
};
