// S4 extraction (move-only): ManageMemoryModal moved VERBATIM from
// ImportPreviewModal.tsx:395-572. See recommendations.md S4.
import React, { useState, useEffect } from 'react';
import { getCanonicalFieldLabel } from './previewState';
import {
  forgetMapping,
  clearMemory,
  getAllLearnedMappings,
  type MappingMemoryEntry,
} from './mappingMemory';

export interface ManageMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoryChange?: () => void;
}

export const ManageMemoryModal: React.FC<ManageMemoryModalProps> = ({
  isOpen,
  onClose,
  onMemoryChange,
}) => {
  const [entries, setEntries] = useState<MappingMemoryEntry[]>(() => getAllLearnedMappings());
  const [filterText, setFilterText] = useState('');

  const refreshEntries = React.useCallback(() => {
    setEntries(getAllLearnedMappings());
    onMemoryChange?.();
  }, [onMemoryChange]);

  useEffect(() => {
    if (isOpen) {
      refreshEntries();
    }
  }, [isOpen, refreshEntries]);

  if (!isOpen) return null;

  const filteredEntries = entries.filter((e) => {
    const search = filterText.toLowerCase();
    return (
      e.normalizedHeader.toLowerCase().includes(search) ||
      e.mappedField.toLowerCase().includes(search) ||
      getCanonicalFieldLabel(e.mappedField).toLowerCase().includes(search)
    );
  });

  const handleDelete = (header: string, scope?: string) => {
    forgetMapping(header, scope);
    refreshEntries();
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all learned column mappings?')) {
      clearMemory();
      refreshEntries();
    }
  };

  return (
    <div className="ipm-memory-backdrop">
      <div
        className="ipm-memory-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ipm-memory-header">
          <div>
            <h3 className="ipm-section-title">
              <span>🧠</span> Learned Column Mappings
            </h3>
            <p className="ipm-section-desc">
              These mappings are saved in your browser from previous manual corrections.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ipm-close-btn"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="ipm-memory-toolbar">
          <input
            type="text"
            placeholder="Search learned mappings..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="ipm-memory-input"
          />
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="ipm-clear-btn"
            >
              Clear All Memory
            </button>
          )}
        </div>

        {/* Table Body */}
        <div className="ipm-memory-body">
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
              <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '8px' }}>💡</span>
              No learned mappings yet. Whenever you manually map a column in the preview modal, it will be remembered here!
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
              No mappings match &quot;{filterText}&quot;.
            </div>
          ) : (
            <table className="ipm-table">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Mapped Field</th>
                  <th style={{ textAlign: 'center' }}>Uses</th>
                  <th>Last Seen</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((item) => (
                  <tr key={`${item.normalizedHeader}-${item.scope || 'global'}`}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                        {item.normalizedHeader}
                      </span>
                      {item.scope && (
                        <span className="ipm-pattern-badge" style={{ marginLeft: '6px' }}>
                          {item.scope}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{getCanonicalFieldLabel(item.mappedField)}</span>{' '}
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.7rem' }}>({item.mappedField})</span>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                      {item.count}
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.75rem' }}>
                      {item.lastSeen || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(item.normalizedHeader, item.scope)}
                        style={{
                          fontSize: '0.75rem',
                          color: '#e11d48',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '4px'
                        }}
                        title="Forget this mapping"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {entries.length} total mapping{entries.length === 1 ? '' : 's'} stored
          </span>
          <button
            onClick={onClose}
            className="ipm-btn-cancel"
            style={{ padding: '6px 14px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
