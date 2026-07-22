import { describe, expect, it, vi } from "vitest";
import { readFirebaseServerTimeOffset } from "./firebaseServerTime";

describe("readFirebaseServerTimeOffset", () => {
  it("reads the virtual .info path with a one-shot listener", async () => {
    const reference = { key: "serverTimeOffset" };
    const ref = vi.fn(() => reference);
    const onValue = vi.fn((_reference, callback, _cancel, options) => {
      callback({ val: () => 1_234 });
      expect(options).toEqual({ onlyOnce: true });
      return () => undefined;
    });

    const offset = await readFirebaseServerTimeOffset(
      {} as never,
      { ref, onValue } as never,
    );

    expect(ref).toHaveBeenCalledWith({}, ".info/serverTimeOffset");
    expect(offset).toBe(1_234);
  });

  it("falls back to zero when Firebase has no measured offset", async () => {
    const onValue = vi.fn((_reference, callback) => {
      callback({ val: () => null });
      return () => undefined;
    });

    await expect(
      readFirebaseServerTimeOffset(
        {} as never,
        { ref: vi.fn(() => ({})), onValue } as never,
      ),
    ).resolves.toBe(0);
  });
});
