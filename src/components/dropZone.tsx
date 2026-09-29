import { useDashboard } from '../features/dashboard/hooks';
import { ImportLanding } from '../features/dashboard/upload/ImportLanding';

// Extracted from App.tsx (Phase 1 move-only refactor) — behavior must stay identical.

// ─── Empty State Import Landing ──────────────────────────────────────
export const DropZone = () => {
  const { dashData, accountName } = useDashboard();
  return (
    <ImportLanding
      accountName={accountName || 'your account'}
      uploadStatus={dashData.uploadStatus}
      onFiles={(files) => dashData.handleFileDrop(files.length === 1 ? files[0] : files)}
    />
  );
};
