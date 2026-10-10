// asyncUtils.ts — S8 of recommendations.md: single owner for the two tiny
// async helpers that were duplicated across the import pipeline
// (previously inline in importService.ts and workbookLoader.ts).
//
// NOTE: workbookWorker.ts keeps its own inline copy of createAbortError ON
// PURPOSE. The worker is instantiated from a blob/URL and must not gain an
// import edge to this module — do not "deduplicate" that copy.

export const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

export const createAbortError = () => {
  const error = new Error('Import cancelled.');
  (error as Error & { name?: string }).name = 'AbortError';
  return error;
};
