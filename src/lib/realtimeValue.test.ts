import { describe, expect, it, vi } from "vitest";
import { runWithRealtimeValueLoaded } from "./realtimeValue";

describe("realtime value loading", () => {
  it("keeps the value subscription active through the operation", async () => {
    let active = false;
    const unsubscribe = vi.fn(() => {
      active = false;
    });

    const result = await runWithRealtimeValueLoaded(
      (onLoaded) => {
        active = true;
        queueMicrotask(onLoaded);
        return unsubscribe;
      },
      async () => {
        expect(active).toBe(true);
        return "committed";
      },
    );

    expect(result).toBe("committed");
    expect(active).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("cleans up when loading or the operation fails", async () => {
    const loadUnsubscribe = vi.fn();
    await expect(
      runWithRealtimeValueLoaded(
        (_onLoaded, onError) => {
          queueMicrotask(() => onError(new Error("load failed")));
          return loadUnsubscribe;
        },
        async () => "not reached",
      ),
    ).rejects.toThrow("load failed");
    expect(loadUnsubscribe).toHaveBeenCalledOnce();

    const operationUnsubscribe = vi.fn();
    await expect(
      runWithRealtimeValueLoaded(
        (onLoaded) => {
          queueMicrotask(onLoaded);
          return operationUnsubscribe;
        },
        async () => {
          throw new Error("transaction failed");
        },
      ),
    ).rejects.toThrow("transaction failed");
    expect(operationUnsubscribe).toHaveBeenCalledOnce();
  });
});
