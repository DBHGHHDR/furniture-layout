import type { Point, Rect, Room } from '../types.ts'
import { rectsOverlap, STEP } from './geometry.ts'
import { boundsOf, quadInsidePolygon, signedArea, type Quad } from './polygon.ts'

const maskCache = new Map<string, Uint8Array>()

function isAxisRectangle(outline: Point[]): boolean {
  if (outline.length !== 4) return false
  const box = boundsOf(outline)
  const corners = new Set(outline.map((point) => `${point.x},${point.y}`))
  const needed = [
    `${box.minX},${box.minY}`,
    `${box.maxX},${box.minY}`,
    `${box.maxX},${box.maxY}`,
    `${box.minX},${box.maxY}`,
  ]
  return needed.every((key) => corners.has(key)) && Math.abs(Math.abs(signedArea(outline)) - box.width * box.depth) < 1
}

function outsideMask(room: Room, cols: number, rows: number, box: ReturnType<typeof boundsOf>): Uint8Array {
  const key = `${cols}x${rows}:${JSON.stringify(room.outline)}`
  const cached = maskCache.get(key)
  if (cached) return cached
  const mask = new Uint8Array(cols * rows)
  if (!isAxisRectangle(room.outline)) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = box.minX + col * STEP
        const y = box.minY + row * STEP
        if (x >= box.maxX - 0.01 || y >= box.maxY - 0.01) {
          mask[row * cols + col] = 1
          continue
        }
        const cellW = Math.min(STEP, box.maxX - x)
        const cellD = Math.min(STEP, box.maxY - y)
        const quad: Quad = [
          { x, y },
          { x: x + cellW, y },
          { x: x + cellW, y: y + cellD },
          { x, y: y + cellD },
        ]
        if (!quadInsidePolygon(quad, room.outline)) mask[row * cols + col] = 1
      }
    }
  }
  maskCache.set(key, mask)
  if (maskCache.size > 12) {
    const first = maskCache.keys().next().value
    if (first) maskCache.delete(first)
  }
  return mask
}

export function largestEmpty(room: Room, occupied: Rect[]): { area: number; rect: Rect | null } {
  const box = boundsOf(room.outline)
  if (box.width < 1 || box.depth < 1) return { area: 0, rect: null }
  const cols = Math.max(1, Math.ceil(box.width / STEP - 1e-6))
  const rows = Math.max(1, Math.ceil(box.depth / STEP - 1e-6))
  const outside = outsideMask(room, cols, rows, box)
  const heights = new Array<number>(cols).fill(0)
  let bestArea = 0
  let best: Rect | null = null

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = box.minX + col * STEP
      const y = box.minY + row * STEP
      if (x >= box.maxX - 0.01 || y >= box.maxY - 0.01) {
        heights[col] = 0
        continue
      }
      const cell: Rect = {
        x,
        y,
        w: Math.min(STEP, box.maxX - x),
        d: Math.min(STEP, box.maxY - y),
      }
      const blocked = outside[row * cols + col] === 1 || occupied.some((item) => rectsOverlap(cell, item))
      heights[col] = blocked ? 0 : heights[col]! + 1
    }
    const found = largestInHistogram(heights, row, box)
    if (found && found.area > bestArea) {
      bestArea = found.area
      best = found.rect
    }
  }

  return { area: bestArea, rect: best }
}

function largestInHistogram(
  heights: number[],
  row: number,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): { area: number; rect: Rect } | null {
  const stack: number[] = []
  const extended = heights.concat(0)
  let bestArea = 0
  let best: Rect | null = null

  for (let index = 0; index < extended.length; index++) {
    while (stack.length > 0 && extended[stack[stack.length - 1]!]! > extended[index]!) {
      const height = extended[stack.pop()!]!
      const left = stack.length > 0 ? stack[stack.length - 1]! : -1
      const widthCells = index - left - 1
      if (height <= 0 || widthCells <= 0) continue
      const col0 = left + 1
      const col1 = index - 1
      const row0 = row - height + 1
      const x = box.minX + col0 * STEP
      const y = box.minY + row0 * STEP
      const w = Math.min(box.maxX, box.minX + (col1 + 1) * STEP) - x
      const d = Math.min(box.maxY, box.minY + (row + 1) * STEP) - y
      const area = w * d
      if (area > bestArea) {
        bestArea = area
        best = { x, y, w, d }
      }
    }
    stack.push(index)
  }

  if (!best) return null
  return { area: bestArea, rect: best }
}
