/**
 * Inventory of the keyboard shortcuts (#190).
 *
 * Single source: the help overlay and the command palette hints read the
 * same list. A shortcut documented in two places always ends up being
 * accurate in only one of them.
 *
 * This file only *describes*. The behaviour itself stays in the components
 * that listen to the keyboard: hanging the logic here would force the help
 * overlay to know about the canvas, when all it needs to know is what to
 * display.
 */

export interface Shortcut {
  /** keys, one entry per key to press together ("Ctrl" + "K") */
  keys: string[];
  /** other combination leading to the same action, displayed second */
  alt?: string[];
  what: string;
  /** small print, for the cases where the key comes with a limitation */
  note?: string;
}

export interface ShortcutGroup {
  title: string;
  /** context the group applies in, displayed under the title */
  scope: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Everywhere",
    scope: "on the canvas, whatever has focus",
    shortcuts: [
      {
        keys: ["Ctrl", "K"],
        what: "Command palette: jump to an object, create one, relate, run an action",
        note: "the only shortcut that still works while you are typing in a field",
      },
      { keys: ["Ctrl", "Z"], what: "Undo the last deletion" },
      { keys: ["Ctrl", "B"], what: "Fold or unfold the objects panel" },
    ],
  },
  {
    title: "Canvas",
    scope: "when the focus is not in a text field",
    shortcuts: [
      { keys: ["/"], what: "Search the canvas by name" },
      {
        keys: ["l"],
        what: "Link focus: selecting an object rings what it is connected to",
        note: "off by default, because it dims the rest and that gets in the way while you rearrange",
      },
      { keys: ["Del"], what: "Delete the selection" },
      {
        keys: ["Ctrl", "click"],
        alt: ["Shift", "click"],
        what: "Add an object to the selection",
        note: "some window managers swallow Ctrl+click, hence the second one",
      },
      { keys: ["drag"], what: "Relate: drag from the edge of one object onto another" },
      {
        keys: ["Ctrl", "V"],
        what: "Paste a screenshot as a capture pinned on the canvas",
      },
    ],
  },
  {
    title: "Triage tray",
    scope: "the bottom strip, once it holds candidates",
    shortcuts: [
      { keys: ["j"], alt: ["↓"], what: "Next candidate" },
      { keys: ["k"], alt: ["↑"], what: "Previous candidate" },
      { keys: ["y"], alt: ["Enter"], what: "Accept: put it on the canvas" },
      { keys: ["n"], alt: ["Del"], what: "Reject: drop it" },
    ],
  },
  {
    title: "Command palette",
    scope: "once it is open",
    shortcuts: [
      { keys: ["↑"], alt: ["↓"], what: "Move through the list" },
      { keys: ["Enter"], what: "Run the highlighted line" },
      {
        keys: ["Esc"],
        what: "Step back, then close",
        note: "in relate mode it drops the source before closing the palette",
      },
    ],
  },
];

/** Key that opens the help, quoted inside the help itself. */
export const HELP_KEY = "?";

/**
 * On macOS, Cmd plays the role of Ctrl - the listeners already accept both.
 * Only the display has to pick one.
 */
export function isMac(platform: string = navigator.platform): boolean {
  return /Mac|iPhone|iPad/.test(platform);
}

/** Label of a key, adapted to the platform. */
export function keyLabel(key: string, mac: boolean): string {
  return mac && key === "Ctrl" ? "Cmd" : key;
}
