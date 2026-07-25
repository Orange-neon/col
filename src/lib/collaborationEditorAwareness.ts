interface EditorAwareness {
  readonly clientID: number;
  getStates(): Map<number, unknown>;
}

/**
 * The collaboration transport and Monaco use separate, bridged Y.Docs, so
 * y-monaco cannot identify the transport awareness client as local by comparing
 * it with the editor document's client id. Hide that one state from y-monaco's
 * decoration pass while continuing to delegate updates and events to the real
 * Awareness instance.
 */
export function collaborationEditorAwareness<T extends EditorAwareness>(awareness: T): T {
  const localClientId = awareness.clientID;

  return new Proxy(awareness, {
    get(target, property) {
      if (property === "getStates") {
        return () => {
          const states = target.getStates();
          if (!states.has(localClientId)) return states;
          const remoteStates = new Map(states);
          remoteStates.delete(localClientId);
          return remoteStates;
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
