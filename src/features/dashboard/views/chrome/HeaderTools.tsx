// Tool buttons of the floating header: Add workbook, Timeframe, Metrics, Exit (line icons).
// This used to be the separate top bar (TopNavbar); it now lives inside FloorHeader.
import React, { useRef, useEffect } from 'react';
import { useDashboard } from '../../hooks';
import { TimeframeMenu, SettingsMenu } from '../../../../components/menus';
import { Icon } from './TabFrame';

const SUPPORTED_FILE = /\.(csv|tsv|txt|xls|xlsx|xlsm)$/i;

export const HeaderTools = React.memo(() => {
  const { dashData, uiState, uiHandlers, resetToLanding } = useDashboard();
  const menuRef = useRef<HTMLDivElement>(null);
  const timeframeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchSummary = dashData.batchImportSummary;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) uiHandlers.setShowColMenu(false);
      if (timeframeRef.current && !timeframeRef.current.contains(target)) uiHandlers.setShowTimeframeMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [uiHandlers]);

  // Add workbook: the files go through the same import as the landing page, on top of what
  // is already loaded (nothing is reset). Days that already exist are merged field by field.
  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => SUPPORTED_FILE.test(file.name));
    event.target.value = '';
    if (files.length) void dashData.handleAutomaticImport(files);
  };

  // The summary describes the LAST import only, so it is worded that way (not "loaded in total").
  const addTitle = batchSummary
    ? `Add workbook (last import: ${batchSummary.files} file(s), ${batchSummary.sheets} sheet(s), ${batchSummary.rows?.length ?? 0} rows)`
    : 'Add workbook';

  return (
    <div className="header-tools">
      <button
        type="button"
        className="header-icon-btn is-primary"
        title={addTitle}
        aria-label="Add workbook"
        onClick={() => fileInputRef.current?.click()}
      >
        <Icon name="add" />
      </button>
      <input ref={fileInputRef} type="file" multiple hidden accept=".csv,.txt,.tsv,.xls,.xlsx,.xlsm" onChange={handlePick} />

      <div className="column-menu-container flex" ref={timeframeRef}>
        <button
          type="button"
          title="Timeframe Filter"
          aria-label="Timeframe filter"
          aria-expanded={uiState.showTimeframeMenu}
          className={`header-icon-btn${uiState.showTimeframeMenu ? ' is-open' : ''}`}
          onClick={() => uiHandlers.setShowTimeframeMenu(!uiState.showTimeframeMenu)}
        >
          <Icon name="calendar" />
        </button>
        {uiState.showTimeframeMenu && (
          <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
            <TimeframeMenu
              activeTimeframe={dashData.activeTimeframe} setActiveTimeframe={dashData.setActiveTimeframe}
              selectedWeek={dashData.selectedWeek} setSelectedWeek={dashData.setSelectedWeek}
              selectedDate={dashData.selectedDate} setSelectedDate={dashData.setSelectedDate}
              selectedDow={dashData.selectedDow} setSelectedDow={dashData.setSelectedDow}
              selectedMonth={dashData.selectedMonth} setSelectedMonth={dashData.setSelectedMonth}
              loadedMonths={dashData.loadedMonths}
              closeMenu={() => uiHandlers.setShowTimeframeMenu(false)}
            />
          </div>
        )}
      </div>

      <div className="column-menu-container flex" ref={menuRef}>
        <button
          type="button"
          title="Toggle Metrics"
          aria-label="Toggle metrics"
          aria-expanded={uiState.showColMenu}
          className={`header-icon-btn${uiState.showColMenu ? ' is-open' : ''}`}
          onClick={() => uiHandlers.setShowColMenu(!uiState.showColMenu)}
        >
          <Icon name="metrics" />
        </button>
        {uiState.showColMenu && (
          <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
            <SettingsMenu
              visibleCols={uiState.visibleCols} toggleCol={uiHandlers.toggleCol}
              closeMenu={() => uiHandlers.setShowColMenu(false)}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        title="Exit to import landing page"
        aria-label="Exit to import landing page"
        className="header-icon-btn"
        onClick={resetToLanding}
      >
        <Icon name="exit" />
      </button>
    </div>
  );
});
