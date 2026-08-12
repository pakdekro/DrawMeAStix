/**
 * Detection of the screens on which the canvas is not usable.
 *
 * Two conditions, and not a single width:
 *
 * - **touch AND narrow**: that is a phone. Width alone would block a laptop
 *   whose window is merely shrunk, which would be wrong;
 * - **very narrow, whatever the pointer**: below this threshold the rail and
 *   the panels leave nothing to the canvas, mouse or no mouse.
 */

/** Above this, even on touch, the screen is wide enough (tablet in landscape). */
export const TOUCH_MAX_WIDTH = 820;

/** Below this, the interface is broken whatever the device. */
export const HARD_MIN_WIDTH = 560;

export const SMALL_SCREEN_QUERY =
  `(pointer: coarse) and (max-width: ${TOUCH_MAX_WIDTH}px), (max-width: ${HARD_MIN_WIDTH}px)`;

const KEY = "dmas.smallscreen";

/**
 * The analyst asked to come in anyway: we stop asking again.
 *
 * Durable and not limited to the session: someone deliberately working on a
 * tablet should not have to walk through that door again every day.
 */
export function hasOptedIn(storage?: Storage): boolean {
  try {
    return storage?.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

export function rememberOptIn(storage?: Storage): void {
  try {
    storage?.setItem(KEY, "yes");
  } catch {
    /* with no storage, the choice holds for the session: no harm done */
  }
}
