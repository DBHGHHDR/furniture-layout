import type { Furniture, Opening, Placed, Point, Rect, Room } from '../types.ts'
import { ROTATIONS } from '../types.ts'
import {
  boundsOf,
  distancePointToSegment,
  getEdge,
  inwardNormal,
  pointAt,
  pointInPolygon,
  properIntersect,
  quadInsidePolygon,
  quadsOverlap,
  segmentDistance,
  signedArea,
  type Edge,
  type Quad,
} from './polygon.ts'

export const STEP = 10
export const DOOR_CLEARANCE = 70

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normRotation(rotation: number): number {
  const wrapped = ((rotation % 360) + 360) % 360
  for (const card of [0, 90, 180, 270, 360]) {
    if (Math.abs(wrapped - card) < 0.51) return card === 360 ? 0 : card
  }
  return round2(wrapped)
}

export function footprint(width: number, depth: number, rot: number): { w: number; d: number } {
  const rotation = normRotation(rot)
  if (rotation === 90 || rotation === 270) return { w: depth, d: width }
  if (rotation === 0 || rotation === 180) return { w: width, d: depth }
  const rad = (rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return { w: round2(width * c + depth * s), d: round2(width * s + depth * c) }
}

export function makePlaced(item: Furniture, x: number, y: number, rot: number): Placed {
  const rotation = normRotation(rot)
  const size = footprint(item.width, item.depth, rotation)
  return {
    id: item.id,
    type: item.type,
    x: round2(x),
    y: round2(y),
    w: size.w,
    d: size.d,
    h: item.height,
    rotation,
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

export function furnitureQuad(placed: Placed): Quad {
  const cx = placed.x + placed.w / 2
  const cy = placed.y + placed.d / 2
  const rad = (placed.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = placed.nominalWidth / 2
  const hd = placed.nominalDepth / 2
  const locals: Array<[number, number]> = [
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
    [-hw, -hd],
  ]
  return locals.map(([lx, lz]) => ({
    x: cx + lx * cos + lz * sin,
    y: cy - lx * sin + lz * cos,
  })) as Quad
}

export function backSegment(placed: Placed): { a: Point; b: Point } {
  const quad = furnitureQuad(placed)
  return { a: quad[0], b: quad[1] }
}

function pointLineDistance(point: Point, edge: Edge): number {
  const length = edge.length || 1
  return Math.abs(edge.dx * (edge.a.y - point.y) - edge.dy * (edge.a.x - point.x)) / length
}

function projectsOn(point: Point, edge: Edge, slack: number): boolean {
  if (edge.length < 1e-6) return false
  const t = ((point.x - edge.a.x) * edge.dx + (point.y - edge.a.y) * edge.dy) / (edge.length * edge.length)
  const along = t * edge.length
  return along >= -slack && along <= edge.length + slack
}

export function backEdge(placed: Placed, room: Room): number | null {
  const back = backSegment(placed)
  const ccw = signedArea(room.outline) >= 0
  const center = { x: placed.x + placed.w / 2, y: placed.y + placed.d / 2 }
  let best: { index: number; dist: number } | null = null
  for (let index = 0; index < room.outline.length; index++) {
    const edge = getEdge(room.outline, index)
    if (!edge) continue
    const d0 = pointLineDistance(back.a, edge)
    const d1 = pointLineDistance(back.b, edge)
    if (d0 > 0.8 || d1 > 0.8) continue
    if (!projectsOn(back.a, edge, 1.2) || !projectsOn(back.b, edge, 1.2)) continue
    const mid = { x: (back.a.x + back.b.x) / 2, y: (back.a.y + back.b.y) / 2 }
    const inward = inwardNormal(edge.a, edge.b, ccw)
    const toward = (center.x - mid.x) * inward.x + (center.y - mid.y) * inward.y
    if (toward < -0.5) continue
    const dist = (d0 + d1) / 2
    if (!best || dist < best.dist) best = { index, dist }
  }
  return best?.index ?? null
}

export function doorQuads(room: Room, openings: Opening[]): Quad[] {
  const ccw = signedArea(room.outline) >= 0
  const quads: Quad[] = []
  for (const opening of openings) {
    if (opening.kind !== 'door') continue
    const edge = getEdge(room.outline, opening.edge)
    if (!edge || opening.width <= 0) continue
    const inward = inwardNormal(edge.a, edge.b, ccw)
    const p0 = pointAt(edge, opening.offset)
    const p1 = pointAt(edge, opening.offset + opening.width)
    quads.push([
      p0,
      p1,
      { x: p1.x + inward.x * DOOR_CLEARANCE, y: p1.y + inward.y * DOOR_CLEARANCE },
      { x: p0.x + inward.x * DOOR_CLEARANCE, y: p0.y + inward.y * DOOR_CLEARANCE },
    ])
  }
  return quads
}

function openingSegment(room: Room, opening: Opening): { a: Point; b: Point } | null {
  const edge = getEdge(room.outline, opening.edge)
  if (!edge) return null
  return { a: pointAt(edge, opening.offset), b: pointAt(edge, opening.offset + opening.width) }
}

function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.d },
    { x: rect.x, y: rect.y + rect.d },
  ]
}

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  const corners = rectCorners(rect)
  for (let index = 0; index < 4; index++) {
    if (properIntersect(a, b, corners[index]!, corners[(index + 1) % 4]!)) return true
  }
  return pointInPolygon(a, corners) || pointInPolygon(b, corners)
}

export function distRectToSegment(rect: Rect, a: Point, b: Point): number {
  if (segmentHitsRect(a, b, rect)) return 0
  const corners = rectCorners(rect)
  let best = Infinity
  for (let index = 0; index < 4; index++) {
    best = Math.min(best, segmentDistance(a, b, corners[index]!, corners[(index + 1) % 4]!))
  }
  return best
}

function intervalOnEdge(rect: Rect, edge: Edge): { min: number; max: number } {
  const length = edge.length || 1
  let min = Infinity
  let max = -Infinity
  for (const corner of rectCorners(rect)) {
    const t = ((corner.x - edge.a.x) * edge.dx + (corner.y - edge.a.y) * edge.dy) / length
    min = Math.min(min, t)
    max = Math.max(max, t)
  }
  return { min, max }
}

export function blocksWindow(placed: Placed, room: Room, windows: Opening[]): boolean {
  for (const win of windows) {
    if (placed.h <= win.sill + 0.01) continue
    const edge = getEdge(room.outline, win.edge)
    const segment = openingSegment(room, win)
    if (!edge || !segment) continue
    const along = intervalOnEdge(placed, edge)
    if (!rangesOverlap(along.min, along.max, win.offset, win.offset + win.width)) continue
    if (distRectToSegment(placed, segment.a, segment.b) <= 0.55) return true
  }
  return false
}

export function isInside(placed: Rect, room: Room): boolean {
  const quad: Quad = [
    { x: placed.x, y: placed.y },
    { x: placed.x + placed.w, y: placed.y },
    { x: placed.x + placed.w, y: placed.y + placed.d },
    { x: placed.x, y: placed.y + placed.d },
  ]
  return quadInsidePolygon(quad, room.outline)
}

export function isValid(
  placed: Placed,
  room: Room,
  doors: Quad[],
  windows: Opening[],
  existing: Placed[],
): boolean {
  if (placed.h > room.height + 0.01) return false
  const quad = furnitureQuad(placed)
  if (!quadInsidePolygon(quad, room.outline)) return false
  for (const other of existing) {
    if (quadsOverlap(quad, furnitureQuad(other))) return false
  }
  for (const door of doors) {
    if (quadsOverlap(quad, door)) return false
  }
  if (blocksWindow(placed, room, windows)) return false
  return true
}

export function isFlush(placed: Rect, room: Room): boolean {
  let best = Infinity
  for (let index = 0; index < room.outline.length; index++) {
    const edge = getEdge(room.outline, index)
    if (!edge) continue
    best = Math.min(best, distRectToSegment(placed, edge.a, edge.b))
  }
  return best <= 0.6
}

function stops(limit: number, size: number, step: number): number[] {
  if (size > limit + 0.05) return []
  const end = round2(limit - size)
  const vals: number[] = []
  for (let value = 0; value <= end + 0.01; value += step) {
    vals.push(round2(Math.min(value, end)))
  }
  if (vals.length === 0 || Math.abs(vals[vals.length - 1]! - end) > 0.2) vals.push(end)
  return [...new Set(vals.map((value) => value.toFixed(2)))].map(Number)
}

function rangeStops(min: number, max: number, size: number, step: number): number[] {
  return stops(max - min, size, step).map((value) => round2(min + value))
}

export function wallCandidates(room: Room, w: number, d: number): Array<{ x: number; y: number }> {
  const box = boundsOf(room.outline)
  const xs = rangeStops(box.minX, box.maxX, w, STEP)
  const ys = rangeStops(box.minY, box.maxY, d, STEP)
  const seen = new Set<string>()
  const out: Array<{ x: number; y: number }> = []
  const add = (x: number, y: number) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, y })
  }
  for (const x of xs) {
    add(x, box.minY)
    add(x, round2(box.maxY - d))
  }
  for (const y of ys) {
    add(box.minX, y)
    add(round2(box.maxX - w), y)
  }
  return out
}

export function gridCandidates(room: Room, w: number, d: number, step = STEP): Array<{ x: number; y: number }> {
  const box = boundsOf(room.outline)
  const xs = rangeStops(box.minX, box.maxX, w, step)
  const ys = rangeStops(box.minY, box.maxY, d, step)
  if (xs.length * ys.length > 3500 && step < 40) return gridCandidates(room, w, d, step * 2)
  const out: Array<{ x: number; y: number }> = []
  for (const y of ys) {
    for (const x of xs) out.push({ x, y })
  }
  return out
}

export function rotationAgainstEdge(edge: Edge, ccw: boolean): number {
  const inward = inwardNormal(edge.a, edge.b, ccw)
  const outward = { x: -inward.x, y: -inward.y }
  const degrees = (Math.atan2(outward.x, outward.y) * 180) / Math.PI
  return normRotation(degrees)
}

function onOuterBorder(edge: Edge, box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const horizontal = Math.abs(edge.dy) <= 0.8
  const vertical = Math.abs(edge.dx) <= 0.8
  if (horizontal) {
    return Math.abs(edge.a.y - box.minY) <= 0.8 || Math.abs(edge.a.y - box.maxY) <= 0.8
  }
  if (vertical) {
    return Math.abs(edge.a.x - box.minX) <= 0.8 || Math.abs(edge.a.x - box.maxX) <= 0.8
  }
  return false
}

export function flushPlacements(item: Furniture, room: Room): Array<{ x: number; y: number; rotation: number }> {
  const ccw = signedArea(room.outline) >= 0
  const box = boundsOf(room.outline)
  const out: Array<{ x: number; y: number; rotation: number }> = []
  for (let index = 0; index < room.outline.length; index++) {
    const edge = getEdge(room.outline, index)
    if (!edge || item.width > edge.length + 0.05) continue
    if (onOuterBorder(edge, box)) continue
    const rotation = rotationAgainstEdge(edge, ccw)
    const size = footprint(item.width, item.depth, rotation)
    const inward = inwardNormal(edge.a, edge.b, ccw)
    for (const offset of stops(edge.length, item.width, STEP)) {
      const backMid = pointAt(edge, offset + item.width / 2)
      const center = {
        x: backMid.x + inward.x * (item.depth / 2),
        y: backMid.y + inward.y * (item.depth / 2),
      }
      out.push({
        x: round2(center.x - size.w / 2),
        y: round2(center.y - size.d / 2),
        rotation,
      })
    }
  }
  return out
}

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.d / 2 }
}

export function doorCenters(room: Room, openings: Opening[]): Array<{ x: number; y: number }> {
  const centers: Array<{ x: number; y: number }> = []
  for (const opening of openings) {
    if (opening.kind !== 'door') continue
    const edge = getEdge(room.outline, opening.edge)
    if (!edge) continue
    centers.push(pointAt(edge, opening.offset + opening.width / 2))
  }
  return centers
}

export function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function nearestDoorDistance(point: { x: number; y: number }, doors: Array<{ x: number; y: number }>): number {
  if (doors.length === 0) return 0
  return Math.min(...doors.map((door) => pointDistance(point, door)))
}

export function minWindowDistance(rect: Rect, windows: Opening[], room: Room): number {
  if (windows.length === 0) return 0
  let best = Infinity
  for (const win of windows) {
    const segment = openingSegment(room, win)
    if (!segment) continue
    best = Math.min(best, distRectToSegment(rect, segment.a, segment.b))
  }
  return best === Infinity ? 0 : best
}

export function beside(a: Rect, b: Rect, gap = 20): boolean {
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.d, b.y + b.d)
  if (gapX < 0 && gapY >= -0.05 && gapY <= gap) return true
  if (gapY < 0 && gapX >= -0.05 && gapX <= gap) return true
  return false
}

export function centrality(rect: Rect, room: Room): number {
  const box = boundsOf(room.outline)
  if (box.width < 1 || box.depth < 1) return 0
  const point = centerOf(rect)
  const dx = Math.abs(point.x - (box.minX + box.maxX) / 2) / (box.width / 2)
  const dy = Math.abs(point.y - (box.minY + box.maxY) / 2) / (box.depth / 2)
  return Math.max(0, 1 - Math.max(dx, dy))
}

export function spanOverlap(rect: Rect, opening: Opening, outline: Room['outline']): boolean {
  const edge = getEdge(outline, opening.edge)
  if (!edge) return false
  const along = intervalOnEdge(rect, edge)
  return rangesOverlap(along.min, along.max, opening.offset, opening.offset + opening.width)
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
  doors: Quad[],
  windows: Opening[],
  existing: Placed[],
  gap = 8,
): Placed | null {
  const rotation = normRotation(anchor.rotation + 180)
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
  } else if (anchor.rotation === 90 || anchor.rotation === 270) {
    const x = anchor.rotation === 90 ? anchor.x - gap - size.w : anchor.x + anchor.w + gap
    const ideal = anchor.y + anchor.d / 2 - size.d / 2
    const values = [ideal, anchor.y, anchor.y + anchor.d - size.d, ideal - STEP, ideal + STEP, ideal - STEP * 2, ideal + STEP * 2]
    for (const y of values) points.push({ x: round2(x), y: round2(y) })
  } else {
    const rad = (anchor.rotation * Math.PI) / 180
    const front = { x: -Math.sin(rad), y: -Math.cos(rad) }
    const along = { x: Math.cos(rad), y: -Math.sin(rad) }
    const center = { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.d / 2 }
    const mid = {
      x: center.x + front.x * (anchor.nominalDepth / 2),
      y: center.y + front.y * (anchor.nominalDepth / 2),
    }
    const chairSize = footprint(item.width, item.depth, rotation)
    for (const slide of [0, -STEP, STEP, -STEP * 2, STEP * 2]) {
      const chairCenter = {
        x: mid.x + front.x * (gap + item.depth / 2) + along.x * slide,
        y: mid.y + front.y * (gap + item.depth / 2) + along.y * slide,
      }
      points.push({
        x: round2(chairCenter.x - chairSize.w / 2),
        y: round2(chairCenter.y - chairSize.d / 2),
      })
    }
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

export function rectDistanceToOutline(rect: Rect, outline: Room['outline']): number {
  let best = Infinity
  for (let index = 0; index < outline.length; index++) {
    const edge = getEdge(outline, index)
    if (!edge) continue
    best = Math.min(best, distRectToSegment(rect, edge.a, edge.b))
  }
  return best
}

export function segmentNearPoint(point: Point, a: Point, b: Point): number {
  return distancePointToSegment(point, a, b)
}
