import { singleFlight } from "./singleFlight";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("shares one run between concurrent callers", async () => {
    const d = deferred<number>();
    let calls = 0;
    const fn = singleFlight(() => {
      calls += 1;
      return d.promise;
    });
    const a = fn();
    const b = fn();
    expect(a).toBe(b);
    d.resolve(7);
    await expect(a).resolves.toBe(7);
    expect(calls).toBe(1);
  });

  it("runs again after the previous run resolved", async () => {
    let calls = 0;
    const fn = singleFlight(async () => {
      calls += 1;
      return calls;
    });
    await fn();
    await fn();
    expect(calls).toBe(2);
  });

  it("runs again after an early return that skipped the main work", async () => {
    let online = false;
    let drained = 0;
    const fn = singleFlight(async () => {
      if (!online) return "skipped";
      drained += 1;
      return "drained";
    });
    await expect(fn()).resolves.toBe("skipped");
    online = true;
    await expect(fn()).resolves.toBe("drained");
    expect(drained).toBe(1);
  });

  it("releases the slot after a rejection", async () => {
    let fail = true;
    const fn = singleFlight(async () => {
      if (fail) throw new Error("boom");
      return "ok";
    });
    await expect(fn()).rejects.toThrow("boom");
    fail = false;
    await expect(fn()).resolves.toBe("ok");
  });
});
