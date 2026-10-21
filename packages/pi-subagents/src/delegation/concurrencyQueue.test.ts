import { describe, expect, it } from "vitest";

import { ConcurrencyQueue, QueuedTaskCancelledError } from "./concurrencyQueue";

function createDeferredPromise<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  if (!resolvePromise) {
    throw new Error("Failed to initialize deferred promise");
  }

  return { promise, resolve: resolvePromise };
}

describe("ConcurrencyQueue", () => {
  it("runs read tasks up to the configured concurrency", async () => {
    const queue = new ConcurrencyQueue(2);
    const firstTask = createDeferredPromise<string>();
    const secondTask = createDeferredPromise<string>();
    const executionOrder: string[] = [];

    const firstHandle = queue.enqueue(
      async () => {
        executionOrder.push("first:start");
        const value = await firstTask.promise;
        executionOrder.push("first:end");
        return value;
      },
      { workspaceAccess: "read" },
    );
    const secondHandle = queue.enqueue(
      async () => {
        executionOrder.push("second:start");
        const value = await secondTask.promise;
        executionOrder.push("second:end");
        return value;
      },
      { workspaceAccess: "read" },
    );

    expect(executionOrder).toEqual(["first:start", "second:start"]);

    firstTask.resolve("one");
    secondTask.resolve("two");

    await expect(firstHandle.promise).resolves.toBe("one");
    await expect(secondHandle.promise).resolves.toBe("two");
    expect(executionOrder).toEqual(["first:start", "second:start", "first:end", "second:end"]);
  });

  it("serializes write tasks away from reads and other writes", async () => {
    const queue = new ConcurrencyQueue(2);
    const firstRead = createDeferredPromise<string>();
    const writeTask = createDeferredPromise<string>();
    const executionOrder: string[] = [];

    const firstHandle = queue.enqueue(
      async () => {
        executionOrder.push("read:start");
        const value = await firstRead.promise;
        executionOrder.push("read:end");
        return value;
      },
      { workspaceAccess: "read" },
    );
    const writeHandle = queue.enqueue(
      async () => {
        executionOrder.push("write:start");
        const value = await writeTask.promise;
        executionOrder.push("write:end");
        return value;
      },
      { workspaceAccess: "write" },
    );

    expect(executionOrder).toEqual(["read:start"]);

    firstRead.resolve("read");
    await expect(firstHandle.promise).resolves.toBe("read");
    expect(executionOrder).toEqual(["read:start", "read:end", "write:start"]);

    writeTask.resolve("write");
    await expect(writeHandle.promise).resolves.toBe("write");
    expect(executionOrder).toEqual(["read:start", "read:end", "write:start", "write:end"]);
  });

  it("cancels queued tasks before they start", async () => {
    const queue = new ConcurrencyQueue(1);
    const runningTask = createDeferredPromise<string>();

    queue.enqueue(async () => runningTask.promise, { workspaceAccess: "read" });
    const queuedHandle = queue.enqueue(async () => "later", { workspaceAccess: "read" });

    expect(queuedHandle.cancel()).toBe(true);
    await expect(queuedHandle.promise).rejects.toBeInstanceOf(QueuedTaskCancelledError);

    runningTask.resolve("done");
  });

  it("does not allow later readers to bypass a queued writer", async () => {
    const queue = new ConcurrencyQueue(2);
    const firstRead = createDeferredPromise<string>();
    const writer = createDeferredPromise<string>();
    const secondRead = createDeferredPromise<string>();
    const executionOrder: string[] = [];

    const firstHandle = queue.enqueue(
      async () => {
        executionOrder.push("read-1:start");
        const value = await firstRead.promise;
        executionOrder.push("read-1:end");
        return value;
      },
      { workspaceAccess: "read" },
    );
    const writerHandle = queue.enqueue(
      async () => {
        executionOrder.push("write:start");
        const value = await writer.promise;
        executionOrder.push("write:end");
        return value;
      },
      { workspaceAccess: "write" },
    );
    const secondHandle = queue.enqueue(
      async () => {
        executionOrder.push("read-2:start");
        const value = await secondRead.promise;
        executionOrder.push("read-2:end");
        return value;
      },
      { workspaceAccess: "read" },
    );

    expect(executionOrder).toEqual(["read-1:start"]);

    firstRead.resolve("one");
    await expect(firstHandle.promise).resolves.toBe("one");
    expect(executionOrder).toEqual(["read-1:start", "read-1:end", "write:start"]);

    writer.resolve("two");
    await expect(writerHandle.promise).resolves.toBe("two");
    expect(executionOrder).toEqual(["read-1:start", "read-1:end", "write:start", "write:end", "read-2:start"]);

    secondRead.resolve("three");
    await expect(secondHandle.promise).resolves.toBe("three");
  });
});
