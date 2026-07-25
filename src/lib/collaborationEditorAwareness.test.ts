import { describe, expect, it, vi } from "vitest";
import { collaborationEditorAwareness } from "./collaborationEditorAwareness";

describe("collaboration editor awareness", () => {
  it("excludes the local state without changing the shared awareness map", () => {
    const states = new Map<number, unknown>([
      [7, { nickname: "Me" }],
      [12, { nickname: "Alice" }],
    ]);
    const awareness = {
      clientID: 7,
      getStates: () => states,
    };

    const editorAwareness = collaborationEditorAwareness(awareness);

    expect(editorAwareness.getStates()).toEqual(
      new Map([[12, { nickname: "Alice" }]]),
    );
    expect(awareness.getStates()).toBe(states);
    expect(states.has(7)).toBe(true);
  });

  it("delegates awareness methods with the original receiver", () => {
    const awareness = {
      clientID: 7,
      calls: 0,
      getStates() {
        this.calls += 1;
        return new Map<number, unknown>();
      },
    };
    const getStates = vi.spyOn(awareness, "getStates");

    collaborationEditorAwareness(awareness).getStates();

    expect(getStates).toHaveBeenCalledOnce();
    expect(awareness.calls).toBe(1);
  });
});
