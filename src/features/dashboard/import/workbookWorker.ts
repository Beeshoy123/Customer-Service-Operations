import { parseWorkbookBuffer } from './workbookLoader';
import type { ImportOptions, ImportProgress, WorkbookResult } from './types';

export type WorkerInMessage =
  | {
      type: 'parse';
      arrayBuffer: ArrayBuffer;
      options?: Omit<ImportOptions, 'signal' | 'onProgress'>;
    }
  | {
      type: 'cancel';
    };

export type WorkerOutMessage =
  | {
      type: 'progress';
      progress: ImportProgress;
    }
  | {
      type: 'success';
      result: WorkbookResult;
    }
  | {
      type: 'error';
      error: string;
      name?: string;
    };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerInMessage>) => void) | null;
  postMessage(message: WorkerOutMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerInMessage>) => void): void;
}

let currentAbortController: AbortController | null = null;

console.log('[DEBUG 4a - workbookWorker.ts] Worker script evaluated in worker thread!');

export const handleWorkerMessage = async (
  data: WorkerInMessage,
  postMessage: (message: WorkerOutMessage) => void
): Promise<void> => {
  if (!data) return;
  console.log('[DEBUG 4c - workbookWorker.ts] handleWorkerMessage called with type:', data.type);

  if (data.type === 'cancel') {
    console.log('[DEBUG 4c-cancel] Worker received cancel request');
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    return;
  }

  if (data.type === 'parse') {
    currentAbortController = new AbortController();
    const { arrayBuffer, options = {} } = data;
    console.log('[DEBUG 4d - workbookWorker.ts] Worker received PARSE message! ArrayBuffer byteLength:', arrayBuffer?.byteLength, 'Starting parseWorkbookBuffer in background thread...');
    const workerParseStart = performance.now();

    try {
      const result = await parseWorkbookBuffer(
        arrayBuffer,
        {
          ...options,
          signal: currentAbortController.signal,
        },
        (progress: ImportProgress) => {
          console.log('[DEBUG 4-progress - workbookWorker.ts] Progress update:', progress.percent, progress.message);
          postMessage({ type: 'progress', progress });
        }
      );

      const parseDuration = (performance.now() - workerParseStart).toFixed(1);
      console.log(`[DEBUG 4e - workbookWorker.ts] Worker parseWorkbookBuffer FINISHED successfully in ${parseDuration}ms! Sheets parsed: ${result.sheets.length}. Posting success to main thread...`);
      postMessage({ type: 'success', result });
    } catch (err: unknown) {
      console.error('[DEBUG 4f - workbookWorker.ts] Error during parseWorkbookBuffer in worker:', err);
      const errorObj = err as Error | undefined;
      const isAbort = errorObj?.name === 'AbortError' || currentAbortController?.signal.aborted;
      postMessage({
        type: 'error',
        error: errorObj instanceof Error ? errorObj.message : String(err),
        name: isAbort ? 'AbortError' : errorObj?.name,
      });
    } finally {
      currentAbortController = null;
    }
  }
};

// If running in a Web Worker environment, wire up the listener
if (typeof self !== 'undefined' && typeof (self as unknown as WorkerScope).postMessage === 'function') {
  console.log('[DEBUG 4b-setup] Web Worker environment detected (self.postMessage is function). Attaching message listener.');
  const workerScope = self as unknown as WorkerScope;
  workerScope.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
    console.log('[DEBUG 4b - workbookWorker.ts] Worker addEventListener message received:', event.data?.type);
    void handleWorkerMessage(event.data, (msg) => workerScope.postMessage(msg));
  });
}


