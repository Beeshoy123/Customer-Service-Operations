import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { Worker as ThreadWorker } from 'node:worker_threads';
import {
  parseWorkbookSheets,
  parseWorkbookBuffer,
  convertWorkbookToSheets,
  convertWorkbookToSheetsViaWorker,
  getSheetRowCountFromRef,
  isSheetOverThreshold,
  iterateSheetRowsBatched,
  DEFAULT_LARGE_SHEET_ROW_THRESHOLD,
  DEFAULT_BATCH_ROW_SIZE,
} from './workbookLoader';
import type { ImportProgress } from './types';
import type { WorkerInMessage, WorkerOutMessage } from './workbookWorker';

describe('workbookLoader', () => {
  it('separates headerRow from data rows and sets rowCount to data row count', async () => {
    // Create an in-memory workbook with 1 header row and 2 data rows
    const data = [
      ['Agent Name', 'Date', 'Calls'],
      ['Alice Smith', '2026-01-01', 10],
      ['Bob Jones', '2026-01-01', 15],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PerformanceData');

    const result = await parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
    const sheet = result.sheets[0];

    // headerRow should contain the first row
    assert.deepEqual(sheet.headerRow, ['Agent Name', 'Date', 'Calls']);

    // rows should contain ONLY data rows, never the header row
    assert.equal(sheet.rows.length, 2);
    assert.deepEqual(sheet.rows[0], ['Alice Smith', '2026-01-01', '10']);
    assert.deepEqual(sheet.rows[1], ['Bob Jones', '2026-01-01', '15']);

    // rowCount must reflect the data row count
    assert.equal(sheet.rowCount, 2);
  });

  it('handles sheet with header only and 0 data rows', async () => {
    const data = [
      ['Agent Name', 'Date', 'Calls'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'EmptyData');

    const result = await parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
    const sheet = result.sheets[0];
    assert.deepEqual(sheet.headerRow, ['Agent Name', 'Date', 'Calls']);
    assert.equal(sheet.rows.length, 0);
    assert.equal(sheet.rowCount, 0);
  });

  it('exposes correct default threshold constants', () => {
    assert.equal(DEFAULT_LARGE_SHEET_ROW_THRESHOLD, 50000);
    assert.equal(DEFAULT_BATCH_ROW_SIZE, 5000);
  });

  it('correctly calculates row count from !ref dimension', () => {
    const sheetWithRef = { '!ref': 'A1:C307201' };
    assert.equal(getSheetRowCountFromRef(sheetWithRef), 307201);

    const sheetWithOffset = { '!ref': 'B5:E15' };
    assert.equal(getSheetRowCountFromRef(sheetWithOffset), 11);

    const emptySheet = {};
    assert.equal(getSheetRowCountFromRef(emptySheet), 0);

    const invalidRef = { '!ref': 'invalid' };
    assert.equal(getSheetRowCountFromRef(invalidRef), 0);
  });

  it('detects when sheet exceeds row threshold or file size threshold', () => {
    const smallSheet = { '!ref': 'A1:C1000' };
    assert.equal(isSheetOverThreshold(smallSheet), false);

    const largeSheet = { '!ref': 'A1:C50000' };
    assert.equal(isSheetOverThreshold(largeSheet), true);

    const customThresholdSheet = { '!ref': 'A1:C500' };
    assert.equal(isSheetOverThreshold(customThresholdSheet, { largeSheetRowThreshold: 400 }), true);
    assert.equal(isSheetOverThreshold(customThresholdSheet, { largeSheetRowThreshold: 600 }), false);

    // Large file size threshold trigger
    assert.equal(isSheetOverThreshold(smallSheet, { fileSize: 15 * 1024 * 1024 }), true);
    assert.equal(isSheetOverThreshold(smallSheet, { fileSize: 5 * 1024 * 1024 }), false);
  });

  it('iterates sheet rows in batches via async generator and yields between batches', async () => {
    const data = [
      ['Header1', 'Header2'],
      ['Row1', '1'],
      ['Row2', '2'],
      ['Row3', '3'],
      ['Row4', '4'],
      ['Row5', '5'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const batches: unknown[][][] = [];

    for await (const batch of iterateSheetRowsBatched(worksheet, { batchSize: 2 })) {
      batches.push(batch);
    }

    // 6 rows total with batchSize: 2 = 3 batches
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0], [['Header1', 'Header2'], ['Row1', '1']]);
    assert.deepEqual(batches[1], [['Row2', '2'], ['Row3', '3']]);
    assert.deepEqual(batches[2], [['Row4', '4'], ['Row5', '5']]);
  });

  it('processes large sheet in batches and threads progress callback with expected format', async () => {
    // Generate a sheet with 6,000 rows
    const data: unknown[][] = [['Agent Name', 'Date', 'Score']];
    for (let i = 1; i <= 6000; i += 1) {
      data.push([`Agent ${i}`, '2026-01-01', i]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'LargeData');

    const progressReports: ImportProgress[] = [];

    // Use a custom low threshold of 2,000 rows and 2,000 batch size to test batching
    const result = await parseWorkbookSheets(workbook, {
      largeSheetRowThreshold: 2000,
      batchRowSize: 2000,
      onProgress: (progress) => {
        progressReports.push(progress);
      },
    });

    // Check return shape
    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
    assert.equal(result.sheets[0].rowCount, 6000);

    // Verify progress callbacks reported "Processing sheet X of Y: N / M rows"
    const processingReports = progressReports.filter((p) => p.message?.startsWith('Processing sheet 1 of 1:'));
    assert.ok(processingReports.length > 0, 'Expected batched progress reports');

    // Check message format
    const lastReport = processingReports[processingReports.length - 1];
    assert.match(lastReport.message ?? '', /^Processing sheet 1 of 1: \d{1,3}(,\d{3})* \/ \d{1,3}(,\d{3})* rows$/);
  });

  it('supports 50,000+ row threshold detection and batch processing', async () => {
    // Generate 50,001 rows
    const data: unknown[][] = [['Agent', 'Value']];
    for (let i = 1; i <= 50001; i += 1) {
      data.push([`Agent_${i}`, i]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    assert.equal(isSheetOverThreshold(worksheet), true);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '50kSheet');

    const progressMessages: string[] = [];

    const result = await parseWorkbookSheets(workbook, {
      onProgress: (p) => {
        if (p.message) progressMessages.push(p.message);
      },
    });

    assert.equal(result.sheets.length, 1);
    assert.equal(result.sheets[0].rowCount, 50001);

    // Verify batched progress was called multiple times (50,000 / 5,000 = 10+ batches)
    const batchMessages = progressMessages.filter((m) => m.startsWith('Processing sheet 1 of 1:'));
    assert.ok(batchMessages.length >= 10, `Expected at least 10 batch updates, got ${batchMessages.length}`);
    assert.ok(batchMessages.some((m) => m.includes('5,000') || m.includes('10,000')));
  });

  it('aborts batch iteration when signal is aborted', async () => {
    const data: unknown[][] = [['Header1']];
    for (let i = 1; i <= 1000; i += 1) {
      data.push([`Row ${i}`]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const controller = new AbortController();

    const iteratePromise = (async () => {
      let count = 0;
      for await (const _ of iterateSheetRowsBatched(worksheet, { batchSize: 10, signal: controller.signal })) {
        count += 1;
        if (count === 2) {
          controller.abort();
        }
      }
    })();

    await assert.rejects(iteratePromise, (error: any) => {
      return error.name === 'AbortError';
    });
  });

  it('convertWorkbookToSheets accepts file and threads progress callback', async () => {
    const data = [
      ['Agent Name', 'Calls'],
      ['Alice', 10],
      ['Bob', 20],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TestSheet');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const progressCalls: ImportProgress[] = [];
    const result = await convertWorkbookToSheets(file, (p) => {
      progressCalls.push(p);
    });

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.equal(result.sheets[0].sheetName, 'TestSheet');
    assert.equal(result.sheets[0].rowCount, 2);
    assert.ok(progressCalls.length > 0);
  });

  it('parseWorkbookBuffer parses array buffer and threads progress callback', async () => {
    const data = [
      ['Col1', 'Col2'],
      ['Val1', 'Val2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BufferSheet');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const progress: ImportProgress[] = [];
    const result = await parseWorkbookBuffer(buffer, {
      fileName: 'test.xlsx',
      onProgress: (p) => progress.push(p),
    });

    assert.equal(result.sheets.length, 1);
    assert.equal(result.sheets[0].sheetName, 'BufferSheet');
    assert.equal(result.sheets[0].rowCount, 1);
  });

  it('convertWorkbookToSheetsViaWorker: event loop continues running during worker processing', async () => {
    class MockAsyncWorker {
      onmessage: ((event: MessageEvent<WorkerOutMessage>) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      terminated = false;

      postMessage(msg: WorkerInMessage, _transfer?: any[]) {
        if (msg.type === 'parse') {
          // Simulate worker taking time on background thread
          setTimeout(() => {
            if (this.terminated) return;
            this.onmessage?.({
              data: {
                type: 'progress',
                progress: { phase: 'loading workbook', percent: 50, message: 'Processing in worker' },
              },
            } as unknown as MessageEvent<WorkerOutMessage>);

            setTimeout(() => {
              if (this.terminated) return;
              this.onmessage?.({
                data: {
                  type: 'success',
                  result: {
                    sheets: [
                      {
                        workbookName: 'Mock',
                        sheetName: 'MockSheet',
                        index: 0,
                        rows: [['Data']],
                        headerRow: ['Header'],
                        rowCount: 1,
                      },
                    ],
                    skippedSheets: [],
                    totalSheets: 1,
                  },
                },
              } as unknown as MessageEvent<WorkerOutMessage>);
            }, 40);
          }, 40);
        }
      }

      terminate() {
        this.terminated = true;
      }
    }

    const origWorker = (globalThis as any).Worker;
    (globalThis as any).Worker = MockAsyncWorker;

    try {
      const file = new File([new ArrayBuffer(100)], 'test.xlsx');
      let ticks = 0;
      const interval = setInterval(() => {
        ticks += 1;
      }, 10);

      const progressList: ImportProgress[] = [];
      const result = await convertWorkbookToSheetsViaWorker(file, (p) => {
        progressList.push(p);
      });

      clearInterval(interval);

      // Verify the main thread event loop continued ticking while the worker was busy
      assert.ok(ticks >= 4, `Expected at least 4 event loop ticks, got ${ticks}`);
      assert.equal(result.sheets.length, 1);
      assert.equal(result.sheets[0].sheetName, 'MockSheet');
      assert.ok(progressList.some((p) => p.percent === 50));
    } finally {
      (globalThis as any).Worker = origWorker;
    }
  });

  it('convertWorkbookToSheetsViaWorker: ignores in-flight progress and success messages after cancellation', async () => {
    let capturedWorker: any = null;

    class MockRacingWorker {
      onmessage: ((event: MessageEvent<WorkerOutMessage>) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      terminated = false;
      receivedCancel = false;

      constructor() {
        capturedWorker = this;
      }

      postMessage(msg: WorkerInMessage) {
        if (msg.type === 'cancel') {
          this.receivedCancel = true;
        }
      }

      terminate() {
        this.terminated = true;
      }
    }

    const origWorker = (globalThis as any).Worker;
    (globalThis as any).Worker = MockRacingWorker;

    try {
      const file = new File([new ArrayBuffer(100)], 'test.xlsx');
      const controller = new AbortController();
      const progressAfterCancel: ImportProgress[] = [];

      const parsePromise = convertWorkbookToSheetsViaWorker(file, {
        signal: controller.signal,
        onProgress: (p) => {
          progressAfterCancel.push(p);
        },
      });

      // Allow file.arrayBuffer() to resolve so worker is instantiated
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abort while worker is active
      controller.abort();

      assert.ok(capturedWorker, 'Worker should have been instantiated');
      assert.equal(capturedWorker.receivedCancel, true);
      assert.equal(capturedWorker.terminated, true);

      // Simulate worker posting late progress and success messages racing with terminate
      capturedWorker.onmessage?.({
        data: {
          type: 'progress',
          progress: { phase: 'loading workbook', percent: 99, message: 'Late progress' },
        },
      } as unknown as MessageEvent<WorkerOutMessage>);

      capturedWorker.onmessage?.({
        data: {
          type: 'success',
          result: {
            sheets: [{ workbookName: 'Late', sheetName: 'LateSheet', index: 0, rows: [], headerRow: ['A'], rowCount: 0 }],
            skippedSheets: [],
            totalSheets: 1,
          },
        },
      } as unknown as MessageEvent<WorkerOutMessage>);

      // The promise must reject with AbortError, NOT resolve with the late result
      await assert.rejects(parsePromise, (err: any) => {
        return err.name === 'AbortError';
      });

      // The late progress message must have been dropped
      assert.equal(
        progressAfterCancel.some((p) => p.message === 'Late progress'),
        false,
        'Late progress after cancellation must be ignored'
      );
    } finally {
      (globalThis as any).Worker = origWorker;
    }
  });

  it('convertWorkbookToSheetsViaWorker: surfaces worker error and terminates worker', async () => {
    let capturedWorker: any = null;

    class MockErrorWorker {
      onmessage: ((event: MessageEvent<WorkerOutMessage>) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      terminated = false;

      constructor() {
        capturedWorker = this;
      }

      postMessage(msg: WorkerInMessage) {
        if (msg.type === 'parse') {
          setTimeout(() => {
            this.onmessage?.({
              data: {
                type: 'error',
                error: 'Corrupted workbook zip header',
              },
            } as unknown as MessageEvent<WorkerOutMessage>);
          }, 10);
        }
      }

      terminate() {
        this.terminated = true;
      }
    }

    const origWorker = (globalThis as any).Worker;
    (globalThis as any).Worker = MockErrorWorker;

    try {
      const file = new File([new ArrayBuffer(100)], 'test.xlsx');
      await assert.rejects(
        convertWorkbookToSheetsViaWorker(file),
        (err: any) => {
          return err.message.includes('Corrupted workbook zip header');
        }
      );
      assert.equal(capturedWorker.terminated, true);
    } finally {
      (globalThis as any).Worker = origWorker;
    }
  });

  it('convertWorkbookToSheetsViaWorker: falls back to convertWorkbookToSheets when Worker is undefined', async () => {
    const origWorker = (globalThis as any).Worker;
    (globalThis as any).Worker = undefined;

    try {
      const data = [
        ['Agent Name', 'Calls'],
        ['Alice', 10],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'FallbackSheet');

      const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const file = new File([buffer], 'fallback.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const result = await convertWorkbookToSheetsViaWorker(file);
      assert.equal(result.sheets.length, 1);
      assert.equal(result.sheets[0].sheetName, 'FallbackSheet');
      assert.equal(result.sheets[0].rowCount, 1);
    } finally {
      (globalThis as any).Worker = origWorker;
    }
  });

  it(
    'convertWorkbookToSheetsViaWorker: real worker thread parses 100,000-row workbook without blocking event loop',
    { timeout: 60000 },
    async () => {
      class RealWorkerBridge {
        private thread: ThreadWorker;
        onmessage: ((event: MessageEvent<WorkerOutMessage>) => void) | null = null;
        onerror: ((event: any) => void) | null = null;

        constructor(_url: URL | string) {
          const workerFilePath = new URL('./workbookWorker.ts', import.meta.url).href;
          const code = `
            import { parentPort } from 'node:worker_threads';
            let listener = null;
            const queue = [];

            parentPort.on('message', (data) => {
              if (listener) {
                listener({ data });
              } else {
                queue.push(data);
              }
            });

            globalThis.self = {
              postMessage: (msg) => parentPort.postMessage(msg),
              addEventListener: (t, fn) => {
                listener = fn;
                while (queue.length > 0) {
                  fn({ data: queue.shift() });
                }
              },
            };

            import(${JSON.stringify(workerFilePath)});
          `;

          this.thread = new ThreadWorker(code, { eval: true });
          this.thread.on('message', (data) => {
            this.onmessage?.({ data } as unknown as MessageEvent<WorkerOutMessage>);
          });
          this.thread.on('error', (err) => {
            console.error('RealWorkerBridge thread error:', err);
            this.onerror?.({ message: err.message, error: err } as unknown as ErrorEvent);
          });
        }

        postMessage(message: any, transferList?: any[]) {
          this.thread.postMessage(message, transferList);
        }

        terminate() {
          this.thread.unref();
          void this.thread.terminate();
        }
      }

      const origWorker = (globalThis as any).Worker;
      (globalThis as any).Worker = RealWorkerBridge;

      try {
        // Generate a real 100,000-row spreadsheet
        const data: unknown[][] = [['Agent Name', 'Date', 'Calls']];
        for (let i = 1; i <= 100000; i += 1) {
          data.push(['Agent_' + i, '2026-01-01', i]);
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'BigSheet');
        const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const file = new File([buffer], 'big_100k.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        // Track event loop ticks while the real worker runs XLSX.read() + parsing
        let ticks = 0;
        const interval = setInterval(() => {
          ticks += 1;
        }, 10);

        const progressUpdates: ImportProgress[] = [];
        const result = await convertWorkbookToSheetsViaWorker(file, {
          largeFileSizeThreshold: 1024 * 1024,
          onProgress: (p) => progressUpdates.push(p),
        });

        clearInterval(interval);

        // Prove the main thread stayed responsive: ticks must have advanced repeatedly
        assert.ok(ticks >= 10, 'Expected at least 10 event loop ticks during 100k parse, got ' + ticks);

        // Verify the real worker returned the correct row count, sheet metadata, and processed rows
        assert.equal(result.sheets.length, 1);
        assert.equal(result.sheets[0].sheetName, 'BigSheet');
        assert.equal(result.sheets[0].rowCount, 100000);
        assert.ok(result.rows, 'Expected result.rows to be populated by worker pipeline');
        assert.equal(result.rows.length, 100000);
        assert.equal(result.rows[0].agentName, 'Agent_1');
        assert.equal(result.rows[99999].agentName, 'Agent_100000');
        assert.ok(progressUpdates.length > 0, 'Expected progress updates from real worker');
        assert.ok(progressUpdates.some((p) => p.phase === 'validating'), 'Expected validating phase progress update');
      } finally {
        (globalThis as any).Worker = origWorker;
      }
    }
  );
});
