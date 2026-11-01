import { rectsOverlap } from './geometry.ts'
import { STEP } from './geometry.ts'
import type { Rect, Room } from '../types.ts'

export function largestEmpty(room: Room, occupied: Rect[]): { area: number; rect: Rect | null } {
  const cols = Math.max(1, Math.ceil(room.width / STEP))
  const rows = Math.max(1, Math.ceil(room.depth / STEP))
  const heights = new Array<number>(cols).fill(0)
  let bestArea = 0
  let best: Rect | null = null

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * STEP
      const y = row * STEP
      if (x >= room.width || y >= room.depth) {
        heights[col] = 0
        continue
      }
      const cell: Rect = {
        x,
        y,
        w: Math.min(STEP, room.width - x),
        d: Math.min(STEP, room.depth - y),
      }
      const blocked = occupied.some((item) => rectsOverlap(cell, item))
      heights[col] = blocked ? 0 : heights[col] + 1
    }
    const found = largestInHistogram(heights, row, room)
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
  room: Room,
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
      const x = col0 * STEP
      const y = row0 * STEP
      const w = Math.min(room.width, (col1 + 1) * STEP) - x
      const d = Math.min(room.depth, (row + 1) * STEP) - y
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
