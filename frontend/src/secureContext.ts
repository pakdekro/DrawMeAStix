/**
 * Can the application actually run in this browser, on this origin?
 *
 * Two Web Crypto functions are load bearing here. `crypto.randomUUID` gives
 * a local identifier to every investigation, entity, relationship and note;
 * `crypto.subtle` computes the SHA-256 fingerprint that tells an export from
 * the state it was taken of. Without them nothing can be recorded and nothing
 * can be exported.
 *
 * Both are restricted to SECURE CONTEXTS: an HTTPS origin, or a localhost
 * one. Served over plain HTTP under any other hostname, an IP address on a
 * LAN being the usual case, the browser leaves them undefined.
 *
 * We test the two functions rather than `window.isSecureContext`, although
 * that flag is the reason they are missing almost every time. The test then
 * matches what the code needs instead of matching the most likely cause of
 * their absence, and a browser too old to provide them lands on the same
 * page rather than starting and failing later.
 */
export function canRun(win: {
  crypto?: { randomUUID?: unknown; subtle?: unknown };
}): boolean {
  const c = win.crypto;
  if (!c) return false;
  return typeof c.randomUUID === "function" && typeof c.subtle === "object" && c.subtle !== null;
}
