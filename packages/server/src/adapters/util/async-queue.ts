/** Single-producer / single-consumer async queue. Used to bridge a push-style
 *  callback (e.g. ACP `sessionUpdate`) into a `for await` consumer. Lives in
 *  adapters/util/ so non-ACP streaming adapters can reuse it. */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiters: Array<(v: IteratorResult<T>) => void> = [];
  private done = false;

  push(value: T): void {
    if (this.done) return;
    const w = this.waiters.shift();
    if (w) w({ value, done: false });
    else this.buffer.push(value);
  }

  close(): void {
    this.done = true;
    while (this.waiters.length) {
      const w = this.waiters.shift()!;
      w({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) =>
          this.waiters.push(resolve),
        );
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
    };
  }
}
