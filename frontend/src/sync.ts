/**
 * Cross-tab signal (#220).
 *
 * Two tabs open on the same base do not see each other: each keeps in
 * memory the state it read at its last load. A bulk edit in one therefore
 * rewrites properties from values read before the other one's changes, and
 * silently undoes them.
 *
 * We do NOT attempt to merge - that would be a real design topic, and the
 * product is single-user by nature. We settle for telling the other tab
 * that it is stale, which is enough for nobody to work believing they see
 * the real state.
 *
 * The channel never delivers to its own sender: a tab therefore does not
 * signal itself, with no need for an identifier.
 */

const CHANNEL = "dmas.changes";

let channel: BroadcastChannel | null = null;

function open(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
}

/** Announces that a write has just gone through in this tab. */
export function announceChange(): void {
  try {
    open()?.postMessage("changed");
  } catch {
    /* channel unavailable: a missing signal must never break a write */
  }
}

/** Subscribes to writes from the OTHER tabs. Returns the unsubscribe function. */
export function onExternalChange(callback: () => void): () => void {
  const bus = open();
  if (!bus) return () => undefined;
  const handler = () => callback();
  bus.addEventListener("message", handler);
  return () => bus.removeEventListener("message", handler);
}

/** Tests only: closes the channel to start over clean. */
export function _resetSyncForTests(): void {
  channel?.close();
  channel = null;
}
