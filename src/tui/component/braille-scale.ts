// Braille art scaler — decode braille text to a binary bitmap, resample to target
// terminal size, re-encode back to braille characters.
//
// Braille Unicode: U+2800 base, each char encodes a 2x4 dot grid.
// Dot positions (bit index):
//   col0  col1
//   0     3
//   1     4
//   2     5
//   6     7

const BRAILLE_BASE = 0x2800

// Bit index → (row, col) within the 2x4 cell
const BIT_POS: [number, number][] = [
  [0, 0], // bit 0
  [1, 0], // bit 1
  [2, 0], // bit 2
  [0, 1], // bit 3
  [1, 1], // bit 4
  [2, 1], // bit 5
  [3, 0], // bit 6
  [3, 1], // bit 7
]

/** Decode braille text lines into a binary bitmap { data, width, height } (in dots) */
function decodeBraille(lines: string[]): { data: Uint8Array; width: number; height: number } {
  // Find max char width
  let maxChars = 0
  for (const line of lines) {
    const len = [...line].length
    if (len > maxChars) maxChars = len
  }

  const pxW = maxChars * 2 // each char = 2 dots wide
  const pxH = lines.length * 4 // each char = 4 dots tall
  const data = new Uint8Array(pxW * pxH) // 0 or 1

  for (let row = 0; row < lines.length; row++) {
    const chars = [...lines[row]]
    for (let col = 0; col < chars.length; col++) {
      const cp = chars[col].codePointAt(0) ?? 0
      if (cp < BRAILLE_BASE || cp > BRAILLE_BASE + 0xFF) continue
      const bits = cp - BRAILLE_BASE
      for (let b = 0; b < 8; b++) {
        if (bits & (1 << b)) {
          const [dr, dc] = BIT_POS[b]
          const px = col * 2 + dc
          const py = row * 4 + dr
          data[py * pxW + px] = 1
        }
      }
    }
  }

  return { data, width: pxW, height: pxH }
}

/** Resample bitmap to target size using area averaging, re-encode to braille lines */
export function scaleBraille(lines: string[], targetCols: number, targetRows: number): string[] {
  if (lines.length === 0 || targetCols <= 0 || targetRows <= 0) return []

  const src = decodeBraille(lines)
  if (src.width === 0 || src.height === 0) return []

  // Target dot dimensions
  const dstDotW = targetCols * 2
  const dstDotH = targetRows * 4

  // Scale factors
  const sx = src.width / dstDotW
  const sy = src.height / dstDotH

  // For each destination dot, compute the average density in the source region.
  // If density > threshold, the dot is "on".
  const threshold = 0.2
  const result: string[] = []

  for (let charRow = 0; charRow < targetRows; charRow++) {
    let line = ""
    for (let charCol = 0; charCol < targetCols; charCol++) {
      let bits = 0
      for (let b = 0; b < 8; b++) {
        const [dr, dc] = BIT_POS[b]
        const dotX = charCol * 2 + dc
        const dotY = charRow * 4 + dr

        // Map to source region
        const srcX0 = dotX * sx
        const srcY0 = dotY * sy
        const srcX1 = (dotX + 1) * sx
        const srcY1 = (dotY + 1) * sy

        // Count "on" pixels in the source region (integer sampling for speed)
        const x0 = Math.floor(srcX0)
        const y0 = Math.floor(srcY0)
        const x1 = Math.ceil(srcX1)
        const y1 = Math.ceil(srcY1)

        let count = 0
        let total = 0
        for (let py = y0; py < y1 && py < src.height; py++) {
          for (let px = x0; px < x1 && px < src.width; px++) {
            total++
            if (src.data[py * src.width + px]) count++
          }
        }

        if (total > 0 && count / total > threshold) {
          bits |= 1 << b
        }
      }
      line += String.fromCodePoint(BRAILLE_BASE + bits)
    }
    result.push(line)
  }

  return result
}
