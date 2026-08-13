import { describe, expect, it } from "vitest";

import { canRun } from "./secureContext";

describe("secure context guard", () => {
  it("runs when both functions are there", () => {
    expect(canRun({ crypto: { randomUUID: () => "", subtle: {} } })).toBe(true);
  });

  it("refuses what a plain HTTP origin actually looks like", () => {
    // Measured in Chromium on http://192.168.1.9:8000: isSecureContext false,
    // randomUUID and subtle both undefined, getRandomValues still there. That
    // last one is why the guard cannot be a `crypto` presence check.
    expect(canRun({ crypto: { getRandomValues: () => {} } as never })).toBe(false);
  });

  it("refuses when only one of the two is missing", () => {
    expect(canRun({ crypto: { randomUUID: () => "" } })).toBe(false);
    expect(canRun({ crypto: { subtle: {} } })).toBe(false);
  });

  it("refuses when there is no crypto at all", () => {
    expect(canRun({})).toBe(false);
  });

  it("does not take a null subtle for an object", () => {
    // `typeof null` is "object", the oldest trap in the language.
    expect(canRun({ crypto: { randomUUID: () => "", subtle: null } })).toBe(false);
  });
});
