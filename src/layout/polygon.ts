import type { Point } from '../types.ts'

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  depth: number
}

export type Edge = {
  index: number
  a: Point
  b: Point
  dx: number
  dy: number
  length: number
}

export function rectangleOutline(width: number, depth: number, origin: Point = { x: 0, y: 0 }): Point[] {
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + depth },
    { x: origin.x, y: origin.y + depth },
  ]
}

export function snap10(value: number): number {
  return Math.round(value / 10) * 10
}

export function boundsOf(outline: Point[]): Bounds {
  if (outline.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, depth: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of outline) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY }
}

export function signedArea(outline: Point[]): number {
  let sum = 0
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!
    const b = outline[(index + 1) % outline.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function getEdge(outline: Point[], index: number): Edge | null {
  if (outline.length < 2 || index < 0 || index >= outline.length) return null
  const a = outline[index]!
  const b = outline[(index + 1) % outline.length]!
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { index, a, b, dx, dy, length: Math.hypot(dx, dy) }
}

export function pointAt(edge: Edge, distance: number): Point {
  if (edge.length < 1e-6) return { x: edge.a.x, y: edge.a.y }
  const t = distance / edge.length
  return { x: edge.a.x + edge.dx * t, y: edge.a.y + edge.dy * t }
}

export function inwardNormal(a: Point, b: Point, ccw: boolean): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  if (ccw) return { x: -dy / length, y: dx / length }
  return { x: dy / length, y: -dx / length }
}

export function edgeTitle(outline: Point[], index: number): string {
  const edge = getEdge(outline, index)
  if (!edge || edge.length < 1e-6) return '벽'
  const angle = (Math.atan2(edge.dy, edge.dx) * 180) / Math.PI
  if (Math.abs(angle) <= 12) return '남쪽'
  if (Math.abs(Math.abs(angle) - 180) <= 12) return '북쪽'
  if (Math.abs(angle - 90) <= 12) return '동쪽'
  if (Math.abs(angle + 90) <= 12) return '서쪽'
  return `${index + 1}번`
}

export function oppositeEdge(outline: Point[], index: number): number | null {
  const edge = getEdge(outline, index)
  if (!edge) return null
  const ccw = signedArea(outline) >= 0
  const inward = inwardNormal(edge.a, edge.b, ccw)
  const outward = { x: -inward.x, y: -inward.y }
  let best = -1
  let bestDot = -0.34
  for (let other = 0; other < outline.length; other++) {
    if (other === index) continue
    const next = getEdge(outline, other)
    if (!next) continue
    const normal = inwardNormal(next.a, next.b, ccw)
    const dot = outward.x * -normal.x + outward.y * -normal.y
    if (dot < bestDot) {
      bestDot = dot
      best = other
    }
  }
  return best >= 0 ? best : null
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

export function properIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y)
  const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y)
  const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y)
  const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y)
  return d1 * d2 < -1e-4 && d3 * d4 < -1e-4
}

export function selfIntersects(outline: Point[]): boolean {
  const count = outline.length
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const adjacent = (i + 1) % count === j || (j + 1) % count === i
      if (adjacent) continue
      const a = outline[i]!
      const b = outline[(i + 1) % count]!
      const c = outline[j]!
      const d = outline[(j + 1) % count]!
      if (properIntersect(a, b, c, d)) return true
    }
  }
  return false
}

export function distancePointToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  if (length2 < 1e-8) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t))
}

export function pointInPolygon(point: Point, outline: Point[]): boolean {
  if (outline.length < 3) return false
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!
    const b = outline[(index + 1) % outline.length]!
    if (distancePointToSegment(point, a, b) <= 0.2) return true
  }
  let inside = false
  for (let index = 0, prev = outline.length - 1; index < outline.length; prev = index++) {
    const a = outline[index]!
    const b = outline[prev]!
    const crosses = (a.y > point.y) !== (b.y > point.y)
    if (!crosses) continue
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (point.x < x) inside = !inside
  }
  return inside
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (properIntersect(a, b, c, d)) return 0
  return Math.min(
    distancePointToSegment(a, c, d),
    distancePointToSegment(b, c, d),
    distancePointToSegment(c, a, b),
    distancePointToSegment(d, a, b),
  )
}

export type Quad = [Point, Point, Point, Point]

export function quadInsidePolygon(quad: Quad, outline: Point[]): boolean {
  for (const point of quad) {
    if (!pointInPolygon(point, outline)) return false
  }
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!
    const b = quad[(i + 1) % 4]!
    for (let j = 0; j < outline.length; j++) {
      const c = outline[j]!
      const d = outline[(j + 1) % outline.length]!
      if (properIntersect(a, b, c, d)) return false
    }
  }
  return true
}

function project(quad: Quad, axis: Point): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const point of quad) {
    const value = point.x * axis.x + point.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

export function quadsOverlap(a: Quad, b: Quad): boolean {
  const axes: Point[] = []
  for (const quad of [a, b]) {
    for (let index = 0; index < 4; index++) {
      const p = quad[index]!
      const q = quad[(index + 1) % 4]!
      const dx = q.x - p.x
      const dy = q.y - p.y
      const length = Math.hypot(dx, dy)
      if (length < 1e-6) continue
      axes.push({ x: -dy / length, y: dx / length })
    }
  }
  for (const axis of axes) {
    const pa = project(a, axis)
    const pb = project(b, axis)
    if (pa.max <= pb.min + 0.05 || pb.max <= pa.min + 0.05) return false
  }
  return true
}

export function nearestEdgePoint(outline: Point[], point: Point): { index: number; point: Point; distance: number; along: number } | null {
  if (outline.length < 2) return null
  let best: { index: number; point: Point; distance: number; along: number } | null = null
  for (let index = 0; index < outline.length; index++) {
    const edge = getEdge(outline, index)
    if (!edge || edge.length < 1e-6) continue
    const dx = edge.dx
    const dy = edge.dy
    let t = ((point.x - edge.a.x) * dx + (point.y - edge.a.y) * dy) / (edge.length * edge.length)
    t = Math.max(0, Math.min(1, t))
    const projected = { x: edge.a.x + dx * t, y: edge.a.y + dy * t }
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y)
    if (!best || distance < best.distance) best = { index, point: projected, distance, along: t * edge.length }
  }
  return best
}
