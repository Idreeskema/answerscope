export interface QueueItem<T> {
  /** Normalized-URL dedup key. */
  key: string;
  depth: number;
  payload: T;
}

export interface BfsQueueOptions<T> {
  seeds: QueueItem<T>[];
  concurrency: number;
  maxItems: number;
  maxDepth: number;
  /** Processes one item and returns newly-discovered items to (maybe) enqueue. */
  process: (item: QueueItem<T>) => Promise<QueueItem<T>[]>;
}

/**
 * Small in-process, concurrency-limited breadth-first crawl queue (spec
 * section 5: "CrawlQueue"). Seeds/discoveries are appended to a FIFO array
 * and drained left-to-right, so ordering is breadth-first; up to
 * `concurrency` items are in flight at once. Dedup (by `key`) and the
 * maxItems/maxDepth caps are enforced at enqueue time, so the crawl can never
 * process more than maxItems URLs or go deeper than maxDepth.
 */
export function runBfsQueue<T>(options: BfsQueueOptions<T>): Promise<void> {
  const { seeds, concurrency, maxItems, maxDepth, process } = options;
  const queue: QueueItem<T>[] = [];
  const seen = new Set<string>();

  const tryEnqueue = (item: QueueItem<T>): void => {
    if (seen.size >= maxItems) return;
    if (item.depth > maxDepth) return;
    if (seen.has(item.key)) return;
    seen.add(item.key);
    queue.push(item);
  };

  seeds.forEach(tryEnqueue);

  return new Promise((resolve) => {
    let active = 0;
    let cursor = 0;

    const pump = (): void => {
      if (cursor >= queue.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && cursor < queue.length) {
        const item = queue[cursor++];
        active++;
        process(item)
          .then((discovered) => discovered.forEach(tryEnqueue))
          .catch(() => {
            // process() is expected to catch and record its own errors
            // (CrawlError rows); this is only a safety net so one bad item
            // can never wedge the whole queue.
          })
          .finally(() => {
            active--;
            pump();
          });
      }
    };

    pump();
  });
}
