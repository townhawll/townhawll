import { ProviderHttpError, type HttpProvider } from "./errors.js";

export function abortError(): DOMException {
  return new DOMException("Provider request cancelled.", "AbortError");
}

export function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", cancel);
        resolve();
      },
      Math.min(milliseconds, 2_147_483_647),
    );
    signal.addEventListener("abort", cancel, { once: true });
  });
}

type Pending = {
  signal: AbortSignal;
  cancel: () => void;
  resolve: (release: () => void) => void;
};

/** FIFO, bounded and process-local. A client must be reused across provider calls. */
export class RequestScheduler {
  private active = 0;
  private nextStartAt = 0;
  private blockedUntil = 0;
  private readonly pending: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly provider: HttpProvider,
    private readonly concurrency: number,
    private readonly maxPending: number,
    private readonly intervalMs: number,
  ) {}

  cooldown(milliseconds: number) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + milliseconds);
    this.pump();
  }

  acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      if (this.pending.length >= this.maxPending) {
        reject(new ProviderHttpError(this.provider, "QUEUE_FULL"));
        return;
      }
      const entry: Pending = {
        signal,
        resolve,
        cancel: () => {
          const index = this.pending.indexOf(entry);
          if (index !== -1) this.pending.splice(index, 1);
          reject(abortError());
          this.pump();
        },
      };
      signal.addEventListener("abort", entry.cancel, { once: true });
      this.pending.push(entry);
      this.pump();
    });
  }

  private pump() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending.length || this.active >= this.concurrency) return;
    const delay = Math.max(this.nextStartAt, this.blockedUntil) - Date.now();
    if (delay > 0) {
      // Long Retry-After values must not overflow Node's timer range.
      this.timer = setTimeout(
        () => this.pump(),
        Math.min(delay, 2_147_483_647),
      );
      return;
    }
    const entry = this.pending.shift();
    if (!entry) return;
    entry.signal.removeEventListener("abort", entry.cancel);
    this.active += 1;
    this.nextStartAt = Date.now() + this.intervalMs;
    let released = false;
    entry.resolve(() => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.pump();
    });
    this.pump();
  }
}
