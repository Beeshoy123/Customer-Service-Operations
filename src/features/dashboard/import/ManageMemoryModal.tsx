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
            <div className="ipm-memory-empty">
              <span className="ipm-memory-empty-icon">💡</span>
              No learned mappings yet. Whenever you manually map a column in the preview modal, it will be remembered here!
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="ipm-memory-empty-filtered">
              No mappings match &quot;{filterText}&quot;.
            </div>
          ) : (
            <table className="ipm-table">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Mapped Field</th>
                  <th className="ipm-th-center">Uses</th>
                  <th>Last Seen</th>
                  <th className="ipm-th-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((item) => (
                  <tr key={`${item.normalizedHeader}-${item.scope || 'global'}`}>
                    <td>
                      <span className="ipm-memory-header-cell">
                        {item.normalizedHeader}
                      </span>
                      {item.scope && (
                        <span className="ipm-pattern-badge ipm-memory-badge-offset">
                          {item.scope}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="ipm-memory-field-name">{getCanonicalFieldLabel(item.mappedField)}</span>{' '}
                      <span className="ipm-memory-field-key">({item.mappedField})</span>
                    </td>
                    <td className="ipm-memory-uses">
                      {item.count}
                    </td>
                    <td className="ipm-memory-lastseen">
                      {item.lastSeen || '—'}
                    </td>
                    <td className="ipm-memory-action-cell">
                      <button
                        onClick={() => handleDelete(item.normalizedHeader, item.scope)}
                        className="ipm-memory-delete-btn"
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
        <div className="ipm-memory-footer">
          <span className="ipm-memory-count">
            {entries.length} total mapping{entries.length === 1 ? '' : 's'} stored
          </span>
          <button
            onClick={onClose}
            className="ipm-btn-cancel ipm-memory-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
