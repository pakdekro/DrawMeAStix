/**
 * Persistence of the enrichment token (#227).
 *
 * A bearer token is not a setting, it is a secret. These tests cover the one
 * place where you can get it wrong without noticing: what is really written
 * to disk, as opposed to what the application believes it holds in memory.
 */

// Neither localStorage nor sessionStorage under Node. We build them before
// importing the module, which reads them from its first call on.
function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as Storage;
}

globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

import { beforeEach, describe, expect, it } from "vitest";
import { loadEndpoints, saveEndpoints } from "./enrich";

const DISQUE = "dmas.enrich.endpoints";
const SESSION = "dmas.enrich.tokens";

const endpoint = (remember: boolean) => ({
  id: "e1",
  label: "CERT sidecar",
  url: "https://enrich.example.org",
  token: "s3cr3t",
  remember,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("ce qui est écrit sur le disque", () => {
  it("ne contient pas le jeton quand on ne l'a pas demandé", () => {
    saveEndpoints([endpoint(false)]);
    // The assertion that matters: the secret is absent from disk, not just
    // filed somewhere else in the same file on disk.
    expect(localStorage.getItem(DISQUE)).not.toContain("s3cr3t");
    expect(sessionStorage.getItem(SESSION)).toContain("s3cr3t");
    // and the application itself keeps seeing it
    expect(loadEndpoints()[0].token).toBe("s3cr3t");
  });

  it("le contient quand on l'a demandé", () => {
    saveEndpoints([endpoint(true)]);
    expect(localStorage.getItem(DISQUE)).toContain("s3cr3t");
    expect(sessionStorage.getItem(SESSION)).toBeNull();
    expect(loadEndpoints()[0].token).toBe("s3cr3t");
  });

  it("oublie le jeton quand la session se termine, et garde le reste", () => {
    saveEndpoints([endpoint(false)]);
    sessionStorage.clear(); // the tab was closed

    const [charge] = loadEndpoints();
    expect(charge.token).toBe("");
    // The endpoint survives: the token is what you retype, not the whole
    // configuration.
    expect(charge.url).toBe("https://enrich.example.org");
    expect(charge.remember).toBe(false);
  });

  it("passer de mémorisé à non mémorisé retire le jeton du disque", () => {
    saveEndpoints([endpoint(true)]);
    saveEndpoints([endpoint(false)]);
    // Unticking the box must ERASE what was already written, otherwise the
    // setting only protects future tokens and lies about the others.
    expect(localStorage.getItem(DISQUE)).not.toContain("s3cr3t");
  });
});

describe("configurations déjà en place", () => {
  it("un endpoint d'avant ce réglage garde son jeton", () => {
    // Written by an earlier version: token present, no flag. Reading it as
    // "not remembered" would have silently wiped the configuration of anyone
    // who had already set it up.
    localStorage.setItem(
      DISQUE,
      JSON.stringify([{ id: "e1", label: "CERT", url: "https://x.example", token: "ancien" }]),
    );
    const [charge] = loadEndpoints();
    expect(charge.token).toBe("ancien");
    expect(charge.remember).toBe(true);
  });
});

describe("stockage hostile", () => {
  it("un sessionStorage indisponible n'empêche pas d'enregistrer l'endpoint", () => {
    const vrai = globalThis.sessionStorage;
    globalThis.sessionStorage = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("bloqué");
      },
      removeItem: () => {
        throw new Error("bloqué");
      },
    } as unknown as Storage;
    try {
      // Losing a token is fixed by retyping it; losing the endpoint is not.
      expect(() => saveEndpoints([endpoint(false)])).not.toThrow();
      expect(localStorage.getItem(DISQUE)).toContain("enrich.example.org");
      expect(() => loadEndpoints()).not.toThrow();
    } finally {
      globalThis.sessionStorage = vrai;
    }
  });
});
