import type { Point } from '../types.ts'
import { boundsOf, edgeTitle, getEdge, signedArea } from './polygon.ts'

export type EdgeMeasure = {
  index: number
  title: string
  length: number
  run: number
  rise: number
  diagonal: boolean
  a: Point
  b: Point
}

export type TriangleMeasure = {
  baseIndex: number
  base: number
  height: number
  apex: Point
  foot: Point
}

export type CornerMeasure = {
  index: number
  angle: number
  lengthToPoint: number
  bent: boolean
  point: Point
}

export type RoomDimensions = {
  area: number
  width: number
  depth: number
  rectangle: boolean
  edges: EdgeMeasure[]
  corners: CornerMeasure[]
  triangle: TriangleMeasure | null
}

function project(apex: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy || 1
  const t = ((apex.x - a.x) * dx + (apex.y - a.y) * dy) / length2
  return { x: a.x + dx * t, y: a.y + dy * t }
}

export function measureRoom(outline: Point[]): RoomDimensions {
  const box = boundsOf(outline)
  const edges = outline.flatMap((_, index) => {
    const edge = getEdge(outline, index)
    if (!edge) return []
    const run = Math.abs(edge.dx)
    const rise = Math.abs(edge.dy)
    return [{
      index,
      title: edgeTitle(outline, index),
      length: edge.length,
      run,
      rise,
      diagonal: run >= 20 && rise >= 20,
      a: edge.a,
      b: edge.b,
    }]
  })
  const area = Math.abs(signedArea(outline))
  const rectangle = outline.length === 4
    && edges.every((edge) => edge.run < 1 || edge.rise < 1)
    && Math.abs(area - box.width * box.depth) < 1
  const corners = outline.map((point, index) => {
    const incoming = edges[(index - 1 + edges.length) % edges.length]
    const angle = cornerAngle(outline, index)
    return {
      index,
      angle,
      lengthToPoint: incoming?.length ?? 0,
      bent: Math.abs(angle - 90) > 2,
      point,
    }
  })
  return {
    area,
    width: box.width,
    depth: box.depth,
    rectangle,
    edges,
    corners,
    triangle: outline.length === 3 ? triangleMeasure(outline, edges, area) : null,
  }
}

function cornerAngle(outline: Point[], index: number): number {
  const count = outline.length
  if (count < 3) return 0
  const prev = outline[(index - 1 + count) % count]!
  const curr = outline[index]!
  const next = outline[(index + 1) % count]!
  const inX = curr.x - prev.x
  const inY = curr.y - prev.y
  const outX = next.x - curr.x
  const outY = next.y - curr.y
  const turn = Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY)
  const interior = signedArea(outline) >= 0 ? Math.PI - turn : Math.PI + turn
  let degrees = (interior * 180) / Math.PI
  while (degrees < 0) degrees += 360
  while (degrees >= 360) degrees -= 360
  return degrees
}

function triangleMeasure(outline: Point[], edges: EdgeMeasure[], area: number): TriangleMeasure | null {
  if (edges.length !== 3 || area < 1) return null
  const horizontal = edges.filter((edge) => edge.rise <= edge.run * Math.tan((12 * Math.PI) / 180) + 0.5)
  const pool = horizontal.length > 0 ? horizontal : edges
  const base = pool.reduce((best, edge) => (edge.length > best.length ? edge : best))
  const apexIndex = [0, 1, 2].find((index) => index !== base.index && index !== (base.index + 1) % 3)
  if (apexIndex === undefined) return null
  const apex = outline[apexIndex]!
  return {
    baseIndex: base.index,
    base: base.length,
    height: (2 * area) / base.length,
    apex,
    foot: project(apex, base.a, base.b),
  }
}
