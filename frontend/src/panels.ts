/**
 * Panel layout for the width available.
 *
 * The canvas IS the product, and it ended up at 39 % of the screen on a
 * 1280 px laptop: 584 px of chrome (rail 44 + palette 240 + inspector
 * 300), minus 200 px of minimap. The palette has since gone back to 180 px.
 *
 * The thresholds are therefore not arbitrary steps, they follow from a
 * rule: the chrome must not exceed 40 % of the window. The constants below
 * derive from it, and so track any width change.
 */

/** Panel widths, kept in step with index.css. */
export const RAIL_PX = 44;
export const SIDEBAR_PX = 180;
export const INSPECTOR_PX = 300;

/** Largest share of the window the chrome may take up. */
export const MAX_CHROME_RATIO = 0.4;

/** Below this, the inspector starts collapsed. */
export const RIGHT_BREAKPOINT = Math.round(
  (RAIL_PX + SIDEBAR_PX + INSPECTOR_PX) / MAX_CHROME_RATIO,
);

/** Below this, the object palette starts collapsed as well. */
export const LEFT_BREAKPOINT = Math.round((RAIL_PX + SIDEBAR_PX) / MAX_CHROME_RATIO);

/**
 * The minimap is 200 px wide. On an already narrow canvas, it eats the very
 * space it is meant to help you travel.
 */
export const MINIMAP_BREAKPOINT = 1200;

export interface PanelLayout {
  left: boolean;
  right: boolean;
}

/** Default layout for a given width. */
export function layoutForWidth(width: number): PanelLayout {
  return {
    left: width >= LEFT_BREAKPOINT,
    right: width >= RIGHT_BREAKPOINT,
  };
}

const KEY = "dmas.panels";

/**
 * An explicit choice by the analyst beats the width, and does so for good.
 *
 * Without this memory, the application would undo on every reload what the
 * user had just set - the worst failing of an interface that adapts: feeling
 * like it is fighting whoever is using it.
 */
export function loadLayout(width: number, storage?: Storage): PanelLayout {
  const fallback = layoutForWidth(width);
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      left: typeof saved.left === "boolean" ? saved.left : fallback.left,
      right: typeof saved.right === "boolean" ? saved.right : fallback.right,
    };
  } catch {
    // storage unavailable (private browsing, quota): the width decides
    return fallback;
  }
}

export function saveLayout(layout: PanelLayout, storage?: Storage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* with no storage, the setting holds for the session: no harm done */
  }
}
