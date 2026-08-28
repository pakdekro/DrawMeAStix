/**
 * How an object is drawn on the canvas.
 *
 * Three shapes, one setting, because the right answer depends on how many
 * objects are on the screen rather than on taste. Twelve objects want the
 * card: type, name, labels, TLP, all readable without clicking. Sixty want
 * the disc, where a node costs a sixth of the ink and the eye reads colour
 * and position instead of text.
 *
 * The choice lives in localStorage and not in the investigation: it is a way
 * of looking, not a property of the case, and it must not travel in a bundle.
 */

export type NodeShape = 'card' | 'compact' | 'disc'

export const NODE_SHAPES: { id: NodeShape; label: string; hint: string }[] = [
  { id: 'card', label: 'Card', hint: 'Everything readable - best under twenty objects' },
  { id: 'compact', label: 'Compact', hint: 'Name only, on one line' },
  { id: 'disc', label: 'Disc', hint: 'Type badge with the name underneath - best when it is crowded' },
]

/**
 * Diameter of the disc, in pixels. Kept here because two places need to
 * agree on it: the stylesheet that draws it, and the edge geometry that has
 * to know the circle sits at the TOP of the node's box, above the caption,
 * rather than at its centre.
 */
export const DISC_SIZE = 52

const KEY = 'dmas.node-shape'

export function readShape(store: Storage): NodeShape {
  const raw = store.getItem(KEY)
  return NODE_SHAPES.some((s) => s.id === raw) ? (raw as NodeShape) : 'card'
}

export function writeShape(store: Storage, shape: NodeShape): void {
  store.setItem(KEY, shape)
}
