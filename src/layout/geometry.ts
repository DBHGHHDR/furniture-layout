import type { Furniture, Opening, Placed, Rect, Room, Rotation, Wall } from '../types.ts'
import { ROTATIONS } from '../types.ts'

export const STEP = 10
export const DOOR_CLEARANCE = 70

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function footprint(width: number, depth: number, rot: Rotation): { w: number; d: number } {
  if (rot === 90 || rot === 270) return { w: depth, d: width }
  return { w: width, d: depth }
}

export function makePlaced(item: Furniture, x: number, y: number, rot: Rotation): Placed {
  const size = footprint(item.width, item.depth, rot)
  return {
    id: item.id,
    type: item.type,
    x: round2(x),
    y: round2(y),
    w: size.w,
    d: size.d,
    h: item.height,
    rotation: rot,
    nominalWidth: item.width,
    nominalDepth: item.depth,
  }
}

export function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 0.05 && b0 < a1 - 0.05
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return rangesOverlap(a.x, a.x + a.w, b.x, b.x + b.w) && rangesOverlap(a.y, a.y + a.d, b.y, b.y + b.d)
}

export function wallLength(room: Room, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? room.width : room.depth
}

export function doorClearances(room: Room, openings: Opening[]): Rect[] {
  const rects: Rect[] = []
  for (const opening of openings) {
    if (opening.kind !== 'door') continue
    const along = wallLength(room, opening.wall)
    const depth = Math.min(DOOR_CLEARANCE, along === room.width ? room.depth : room.width)
    if (opening.wall === 'south') rects.push({ x: opening.offset, y: 0, w: opening.width, d: depth })
    if (opening.wall === 'north') {
      rects.push({ x: opening.offset, y: room.depth - depth, w: opening.width, d: depth })
    }
    if (opening.wall === 'west') rects.push({ x: 0, y: opening.offset, w: depth, d: opening.width })
    if (opening.wall === 'east') {
      rects.push({ x: room.width - depth, y: opening.offset, w: depth, d: opening.width })
    }
  }
  return rects
}

export function blocksWindow(placed: Placed, room: Room, windows: Opening[]): boolean {
  for (const win of windows) {
    if (placed.h <= win.sill + 0.01) continue
    const start = win.offset
    const end = win.offset + win.width
    if (win.wall === 'south' && placed.y <= 0.5 && rangesOverlap(placed.x, placed.x + placed.w, start, end)) {
      return true
    }
    if (
      win.wall === 'north' &&
      Math.abs(placed.y + placed.d - room.depth) <= 0.5 &&
      rangesOverlap(placed.x, placed.x + placed.w, start, end)
    ) {
      return true
    }
    if (win.wall === 'west' && placed.x <= 0.5 && rangesOverlap(placed.y, placed.y + placed.d, start, end)) {
      return true
    }
    if (
      win.wall === 'east' &&
      Math.abs(placed.x + placed.w - room.width) <= 0.5 &&
      rangesOverlap(placed.y, placed.y + placed.d, start, end)
    ) {
      return true
    }
  }
  return false
}

export function isInside(placed: Rect, room: Room): boolean {
  return (
    placed.x >= -0.05 &&
    placed.y >= -0.05 &&
    placed.x + placed.w <= room.width + 0.05 &&
    placed.y + placed.d <= room.depth + 0.05
  )
}

export function isValid(
  placed: Placed,
  room: Room,
  doors: Rect[],
  windows: Opening[],
  existing: Placed[],
): boolean {
  if (placed.h > room.height + 0.01) return false
  if (!isInside(placed, room)) return false
  for (const other of existing) {
    if (rectsOverlap(placed, other)) return false
  }
  for (const door of doors) {
    if (rectsOverlap(placed, door)) return false
  }
  if (blocksWindow(placed, room, windows)) return false
  return true
}

export function backWall(placed: Placed, room: Room): Wall | null {
  if (placed.rotation === 0 && Math.abs(placed.y + placed.d - room.depth) <= 0.6) return 'north'
  if (placed.rotation === 180 && placed.y <= 0.6) return 'south'
  if (placed.rotation === 90 && Math.abs(placed.x + placed.w - room.width) <= 0.6) return 'east'
  if (placed.rotation === 270 && placed.x <= 0.6) return 'west'
  return null
}

export function isFlush(placed: Rect, room: Room): boolean {
  return (
    placed.x <= 0.6 ||
    placed.y <= 0.6 ||
    Math.abs(placed.x + placed.w - room.width) <= 0.6 ||
    Math.abs(placed.y + placed.d - room.depth) <= 0.6
  )
}

function stops(limit: number, size: number, step: number): number[] {
  if (size > limit + 0.05) return []
  const end = round2(limit - size)
  const vals: number[] = []
  for (let value = 0; value <= end + 0.01; value += step) {
    vals.push(round2(Math.min(value, end)))
  }
  if (vals.length === 0 || Math.abs(vals[vals.length - 1] - end) > 0.2) vals.push(end)
  return [...new Set(vals.map((value) => value.toFixed(2)))].map(Number)
}

export function wallCandidates(room: Room, w: number, d: number): Array<{ x: number; y: number }> {
  const xs = stops(room.width, w, STEP)
  const ys = stops(room.depth, d, STEP)
  const seen = new Set<string>()
  const out: Array<{ x: number; y: number }> = []
  const add = (x: number, y: number) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, y })
  }
  for (const x of xs) {
    add(x, 0)
    add(x, round2(room.depth - d))
  }
  for (const y of ys) {
    add(0, y)
    add(round2(room.width - w), y)
  }
  return out
}

export function gridCandidates(room: Room, w: number, d: number, step = STEP): Array<{ x: number; y: number }> {
  const xs = stops(room.width, w, step)
  const ys = stops(room.depth, d, step)
  if (xs.length * ys.length > 3500 && step < 40) return gridCandidates(room, w, d, step * 2)
  const out: Array<{ x: number; y: number }> = []
  for (const y of ys) {
    for (const x of xs) out.push({ x, y })
  }
  return out
}

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.d / 2 }
}

export function doorCenters(room: Room, openings: Opening[]): Array<{ x: number; y: number }> {
  return openings
    .filter((opening) => opening.kind === 'door')
    .map((opening) => {
      const mid = opening.offset + opening.width / 2
      if (opening.wall === 'south') return { x: mid, y: 0 }
      if (opening.wall === 'north') return { x: mid, y: room.depth }
      if (opening.wall === 'west') return { x: 0, y: mid }
      return { x: room.width, y: mid }
    })
}

export function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function nearestDoorDistance(point: { x: number; y: number }, doors: Array<{ x: number; y: number }>): number {
  if (doors.length === 0) return 0
  return Math.min(...doors.map((door) => pointDistance(point, door)))
}

export function distanceToWindow(rect: Rect, win: Opening, room: Room): number {
  let along0 = 0
  let along1 = 0
  let cross = 0
  if (win.wall === 'north' || win.wall === 'south') {
    along0 = rect.x
    along1 = rect.x + rect.w
    cross = win.wall === 'north' ? room.depth - (rect.y + rect.d) : rect.y
  } else {
    along0 = rect.y
    along1 = rect.y + rect.d
    cross = win.wall === 'east' ? room.width - (rect.x + rect.w) : rect.x
  }
  const start = win.offset
  const end = win.offset + win.width
  let along = 0
  if (along1 < start) along = start - along1
  else if (along0 > end) along = along0 - end
  return Math.hypot(Math.max(0, cross), along)
}

export function minWindowDistance(rect: Rect, windows: Opening[], room: Room): number {
  if (windows.length === 0) return 0
  return Math.min(...windows.map((win) => distanceToWindow(rect, win, room)))
}

export function beside(a: Rect, b: Rect, gap = 20): boolean {
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.d, b.y + b.d)
  if (gapX < 0 && gapY >= -0.05 && gapY <= gap) return true
  if (gapY < 0 && gapX >= -0.05 && gapX <= gap) return true
  return false
}

export function centrality(rect: Rect, room: Room): number {
  const point = centerOf(rect)
  const dx = Math.abs(point.x - room.width / 2) / (room.width / 2)
  const dy = Math.abs(point.y - room.depth / 2) / (room.depth / 2)
  return Math.max(0, 1 - Math.max(dx, dy))
}

export function spanOverlap(rect: Rect, win: Opening): boolean {
  if (win.wall === 'north' || win.wall === 'south') {
    return rangesOverlap(rect.x, rect.x + rect.w, win.offset, win.offset + win.width)
  }
  return rangesOverlap(rect.y, rect.y + rect.d, win.offset, win.offset + win.width)
}

const PARTNER_ROT: Record<Rotation, Rotation> = {
  0: 180,
  90: 270,
  180: 0,
  270: 90,
}

function uniquePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const seen = new Set<string>()
  const out: Array<{ x: number; y: number }> = []
  for (const point of points) {
    const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(point)
  }
  return out
}

export function placeInFront(
  anchor: Placed,
  item: Furniture,
  room: Room,
  doors: Rect[],
  windows: Opening[],
  existing: Placed[],
  gap = 8,
): Placed | null {
  const rotation = PARTNER_ROT[anchor.rotation]
  const size = footprint(item.width, item.depth, rotation)
  const points: Array<{ x: number; y: number }> = []
  const slides = (ideal: number, span0: number, span1: number) => {
    const values = [ideal, span0, span1 - size.w, ideal - STEP, ideal + STEP, ideal - STEP * 2, ideal + STEP * 2]
    return values.map((value) => round2(value))
  }

  if (anchor.rotation === 0 || anchor.rotation === 180) {
    const y = anchor.rotation === 0 ? anchor.y - gap - size.d : anchor.y + anchor.d + gap
    const ideal = anchor.x + anchor.w / 2 - size.w / 2
    for (const x of slides(ideal, anchor.x, anchor.x + anchor.w)) points.push({ x, y: round2(y) })
  } else {
    const x = anchor.rotation === 90 ? anchor.x - gap - size.w : anchor.x + anchor.w + gap
    const ideal = anchor.y + anchor.d / 2 - size.d / 2
    const values = [ideal, anchor.y, anchor.y + anchor.d - size.d, ideal - STEP, ideal + STEP, ideal - STEP * 2, ideal + STEP * 2]
    for (const y of values) points.push({ x: round2(x), y: round2(y) })
  }

  for (const point of uniquePoints(points)) {
    const placed = makePlaced(item, point.x, point.y, rotation)
    if (isValid(placed, room, doors, windows, existing)) return placed
  }

  for (const alt of ROTATIONS) {
    if (alt === rotation) continue
    const altSize = footprint(item.width, item.depth, alt)
    const extras: Array<{ x: number; y: number }> = []
    if (anchor.rotation === 0) extras.push({ x: anchor.x + anchor.w / 2 - altSize.w / 2, y: anchor.y - gap - altSize.d })
    if (anchor.rotation === 180) extras.push({ x: anchor.x + anchor.w / 2 - altSize.w / 2, y: anchor.y + anchor.d + gap })
    if (anchor.rotation === 90) extras.push({ x: anchor.x - gap - altSize.w, y: anchor.y + anchor.d / 2 - altSize.d / 2 })
    if (anchor.rotation === 270) extras.push({ x: anchor.x + anchor.w + gap, y: anchor.y + anchor.d / 2 - altSize.d / 2 })
    for (const point of extras) {
      const placed = makePlaced(item, point.x, point.y, alt)
      if (isValid(placed, room, doors, windows, existing)) return placed
    }
  }
  return null
}
