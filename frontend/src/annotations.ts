/**
 * Annotation layer (#136) - screenshot helpers.
 *
 * A pasted image is recompressed before storage: a raw screenshot quickly
 * weighs 1 to 3 MB, ten captures would weigh IndexedDB down for nothing.
 * WebP at quality 0.85, longest side capped - plenty for an investigation
 * context exhibit.
 */

const MAX_DIM = 1600

export async function compressImage(
  source: Blob,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(source)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  )
  return { blob: blob ?? source, width, height }
}
