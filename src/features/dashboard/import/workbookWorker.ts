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

export const handleWorkerMessage = async (
  data: WorkerInMessage,
  postMessage: (message: WorkerOutMessage) => void
): Promise<void> => {
  if (!data) return;

  if (data.type === 'cancel') {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    return;
  }

  if (data.type === 'parse') {
    currentAbortController = new AbortController();
    const { arrayBuffer, options = {} } = data;

    try {
      const result = await parseWorkbookBuffer(
        arrayBuffer,
        {
          ...options,
          signal: currentAbortController.signal,
        },
        (progress: ImportProgress) => {
          postMessage({ type: 'progress', progress });
        }
      );

      postMessage({ type: 'success', result });
    } catch (err: unknown) {
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
  const workerScope = self as unknown as WorkerScope;
  workerScope.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
    void handleWorkerMessage(event.data, (msg) => workerScope.postMessage(msg));
  });
}

