/**
 * Format extractors (#96) - the pure parts: pagination, dispatch, text
 * formats. html/pdf/docx depend on browser APIs (DOMParser, pdf.js
 * worker) and are covered by the Chromium E2E.
 */

import { describe, expect, it } from "vitest";

import { ACCEPT, MAX_DOCUMENT_BYTES, pageAt, supportedFile, textFromFile } from "./extractors";
import type { ExtractedDocument } from "./extractors";

describe("pageAt", () => {
  const doc: ExtractedDocument = {
    text: "page un\npage deux\npage trois\n",
    pageOffsets: [0, 8, 18],
  };

  it("résout l'offset vers la bonne page (1-indexée)", () => {
    expect(pageAt(doc, 0)).toBe(1);
    expect(pageAt(doc, 7)).toBe(1);
    expect(pageAt(doc, 8)).toBe(2);
    expect(pageAt(doc, 17)).toBe(2);
    expect(pageAt(doc, 18)).toBe(3);
    expect(pageAt(doc, 999)).toBe(3);
  });

  it("sans pagination (txt, html, docx) : 0", () => {
    expect(pageAt({ text: "abc", pageOffsets: [] }, 1)).toBe(0);
  });
});

describe("dispatch par extension", () => {
  it("formats pris en charge", () => {
    for (const name of ["a.txt", "b.MD", "c.html", "d.docx", "e.pdf", "f.csv", "g.log"]) {
      expect(supportedFile(name), name).toBe(true);
    }
    for (const name of ["a.exe", "b.png", "c.zip", "sans-extension"]) {
      expect(supportedFile(name), name).toBe(false);
    }
  });

  it("ACCEPT liste les extensions pour l'input fichier", () => {
    expect(ACCEPT).toContain(".pdf");
    expect(ACCEPT).toContain(".docx");
  });

  it("fichier texte : passthrough sans pagination", async () => {
    const file = new File(["IP vue : 203.0.113.45\n"], "notes.txt", { type: "text/plain" });
    const doc = await textFromFile(file);
    expect(doc.text).toContain("203.0.113.45");
    expect(doc.pageOffsets).toEqual([]);
  });

  it("format inconnu : erreur explicite", async () => {
    const file = new File(["x"], "payload.exe");
    await expect(textFromFile(file)).rejects.toThrow(/unsupported format/);
  });
});

describe("plafond de taille (audit de sécurité, juillet 2026)", () => {
  it("refuse un fichier au-delà du plafond, avant toute extraction", async () => {
    // The refusal must come before the switch on the extension: a .docx zip
    // bomb takes the tab down the moment mammoth decompresses it.
    const huge = new File([new Uint8Array(1)], "rapport.docx");
    Object.defineProperty(huge, "size", { value: MAX_DOCUMENT_BYTES + 1 });
    await expect(textFromFile(huge)).rejects.toThrow(/too large/);
  });

  it("laisse passer un rapport de taille réaliste", async () => {
    const ok = new File(["1.2.3.4 est malveillant"], "rapport.txt");
    await expect(textFromFile(ok)).resolves.toBeTruthy();
  });
});
