import type { Opening, Point, Scene } from '../types.ts'
import { boundsOf, getEdge, nearestEdgePoint, snap10 } from './polygon.ts'
import { round2 } from './geometry.ts'

export function resizeRoom(scene: Scene, width: number, depth: number): Scene {
  const box = boundsOf(scene.room.outline)
  if (!(width >= 40) || !(depth >= 40) || box.width < 1 || box.depth < 1) return scene
  const scaleX = width / box.width
  const scaleY = depth / box.depth
  const outline = scene.room.outline.map((point) => ({
    x: box.minX + (point.x - box.minX) * scaleX,
    y: box.minY + (point.y - box.minY) * scaleY,
  }))
  const openings = scene.openings.map((opening) => {
    const before = getEdge(scene.room.outline, opening.edge)
    const after = getEdge(outline, opening.edge)
    if (!before || !after || before.length < 1) return opening
    const scale = after.length / before.length
    const nextWidth = Math.max(10, opening.width * scale)
    const nextOffset = Math.max(0, Math.min(opening.offset * scale, Math.max(0, after.length - nextWidth)))
    return { ...opening, offset: round2(nextOffset), width: round2(nextWidth) }
  })
  return { ...scene, room: { ...scene.room, outline }, openings }
}

export function moveOutlineVertex(scene: Scene, index: number, point: Point): Scene {
  if (index < 0 || index >= scene.room.outline.length) return scene
  const outline = scene.room.outline.map((vertex, vertexIndex) => (vertexIndex === index ? point : vertex))
  return { ...scene, room: { ...scene.room, outline } }
}

export function insertOutlinePoint(scene: Scene, point: Point): Scene {
  const outline = scene.room.outline
  if (outline.length >= 12) return scene
  const nearest = nearestEdgePoint(outline, point)
  if (!nearest) return scene
  const edge = getEdge(outline, nearest.index)
  if (!edge) return scene
  const snapped = { x: snap10(nearest.point.x), y: snap10(nearest.point.y) }
  const along = ((snapped.x - edge.a.x) * edge.dx + (snapped.y - edge.a.y) * edge.dy) / (edge.length || 1)
  if (along < 15 || along > edge.length - 15) return scene
  const next = outline.slice()
  next.splice(nearest.index + 1, 0, snapped)
  const openings = scene.openings.flatMap((opening) => shiftOpening(opening, nearest.index, along))
  return { ...scene, room: { ...scene.room, outline: next }, openings }
}

export function deleteOutlineVertex(scene: Scene, index: number): Scene {
  const outline = scene.room.outline
  if (outline.length <= 3 || index < 0 || index >= outline.length) return scene
  const prev = (index - 1 + outline.length) % outline.length
  const next = outline.filter((_, vertexIndex) => vertexIndex !== index)
  const openings = scene.openings.flatMap((opening) => {
    if (opening.edge === index || opening.edge === prev) return []
    const edge = opening.edge > index ? opening.edge - 1 : opening.edge
    return [{ ...opening, edge }]
  })
  return { ...scene, room: { ...scene.room, outline: next }, openings }
}

function shiftOpening(opening: Opening, splitEdge: number, along: number): Opening[] {
  if (opening.edge < splitEdge) return [opening]
  if (opening.edge > splitEdge) return [{ ...opening, edge: opening.edge + 1 }]
  const end = opening.offset + opening.width
  if (end <= along + 0.1) return [opening]
  if (opening.offset >= along - 0.1) return [{ ...opening, edge: opening.edge + 1, offset: round2(opening.offset - along) }]
  return []
}
