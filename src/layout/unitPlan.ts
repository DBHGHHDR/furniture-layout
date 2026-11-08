import type { Furniture, Scene, Wall } from '../types.ts'
import { DEFAULT_SIZE, uid } from '../types.ts'
import { rectangleOutline } from './polygon.ts'

export type UnitProgram = {
  width: number
  depth: number
  bedrooms: number
  bathrooms: number
  living: boolean
  entrance: Wall
}

export type UnitRoomKind = 'entrance' | 'corridor' | 'living' | 'bedroom' | 'bathroom' | 'kitchen' | 'utility' | 'dress'

export type UnitOpening = {
  wall: Wall
  offset: number
  width: number
}

export type UnitRoom = {
  id: string
  kind: UnitRoomKind
  name: string
  x: number
  y: number
  w: number
  d: number
  door: UnitOpening | null
  window: (UnitOpening & { sill: number; height: number }) | null
}

export type UnitPlan = {
  id: string
  label: string
  note: string
  rooms: UnitRoom[]
}

export type UnitResult = {
  plans: UnitPlan[]
  message: string
}

export const DEFAULT_PROGRAM: UnitProgram = {
  width: 1180,
  depth: 775,
  bedrooms: 2,
  bathrooms: 2,
  living: true,
  entrance: 'south',
}

const SOURCE_W = 1180
const SOURCE_D = 775
const X_GRID = [0, 180, 500, 680, 1180]
const Y_GRID = [0, 220, 365, 775]

type OpeningSeed = { wall: Wall; offset: number; width: number }

type RoomSeed = {
  id: string
  kind: UnitRoomKind
  name: string
  x0: number
  x1: number
  y0: number
  y1: number
  door: OpeningSeed | null
  window: OpeningSeed | null
}

const PHOTO_ROOMS: RoomSeed[] = [
  { id: 'utility', kind: 'utility', name: '다용도실', x0: 0, x1: 1, y0: 2, y1: 3, door: { wall: 'east', offset: 150, width: 90 }, window: { wall: 'north', offset: 30, width: 120 } },
  { id: 'kitchen', kind: 'kitchen', name: '주방', x0: 1, x1: 2, y0: 2, y1: 3, door: { wall: 'east', offset: 40, width: 90 }, window: { wall: 'north', offset: 50, width: 200 } },
  { id: 'living', kind: 'living', name: '거실', x0: 2, x1: 4, y0: 2, y1: 3, door: { wall: 'south', offset: 40, width: 120 }, window: { wall: 'north', offset: 80, width: 420 } },
  { id: 'dress', kind: 'dress', name: '드레스룸', x0: 0, x1: 1, y0: 0, y1: 1, door: { wall: 'east', offset: 60, width: 80 }, window: { wall: 'south', offset: 30, width: 100 } },
  { id: 'dress-bath', kind: 'bathroom', name: '화장실', x0: 0, x1: 1, y0: 1, y1: 2, door: { wall: 'south', offset: 50, width: 70 }, window: { wall: 'west', offset: 30, width: 60 } },
  { id: 'master', kind: 'bedroom', name: '큰방', x0: 1, x1: 2, y0: 0, y1: 2, door: { wall: 'east', offset: 70, width: 90 }, window: { wall: 'south', offset: 50, width: 200 } },
  { id: 'entrance', kind: 'entrance', name: '현관', x0: 2, x1: 3, y0: 0, y1: 1, door: { wall: 'south', offset: 40, width: 100 }, window: null },
  { id: 'powder', kind: 'bathroom', name: '화장실 2', x0: 2, x1: 3, y0: 1, y1: 2, door: { wall: 'south', offset: 50, width: 70 }, window: null },
  { id: 'small', kind: 'bedroom', name: '작은방', x0: 3, x1: 4, y0: 0, y1: 2, door: { wall: 'west', offset: 50, width: 90 }, window: { wall: 'south', offset: 80, width: 240 } },
]

function axis(grid: number[], total: number, target: number): number[] {
  return grid.map((value, index) => {
    if (index === 0) return 0
    if (index === grid.length - 1) return target
    return Math.round((value / total) * target)
  })
}

function sourceSpan(seed: RoomSeed, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? X_GRID[seed.x1]! - X_GRID[seed.x0]! : Y_GRID[seed.y1]! - Y_GRID[seed.y0]!
}

function scaledOpening(seed: OpeningSeed, source: number, span: number): UnitOpening {
  const ratio = span / source
  const width = Math.min(Math.max(60, Math.round(seed.width * ratio)), Math.max(40, span - 8))
  const offset = Math.max(0, Math.min(Math.round(seed.offset * ratio), span - width))
  return { wall: seed.wall, offset, width }
}

function buildPhoto(width: number, depth: number): UnitRoom[] {
  const xs = axis(X_GRID, SOURCE_W, width)
  const ys = axis(Y_GRID, SOURCE_D, depth)
  return PHOTO_ROOMS.map((seed) => {
    const x = xs[seed.x0]!
    const y = ys[seed.y0]!
    const w = xs[seed.x1]! - x
    const d = ys[seed.y1]! - y
    const room = { x, y, w, d }
    return {
      id: seed.id,
      kind: seed.kind,
      name: seed.name,
      ...room,
      door: seed.door ? scaledOpening(seed.door, sourceSpan(seed, seed.door.wall), wallSpan(room, seed.door.wall)) : null,
      window: seed.window
        ? { ...scaledOpening(seed.window, sourceSpan(seed, seed.window.wall), wallSpan(room, seed.window.wall)), sill: 90, height: 110 }
        : null,
    }
  })
}

function mapWall(wall: Wall, entrance: Wall): Wall {
  if (entrance === 'south') return wall
  if (entrance === 'north') {
    if (wall === 'south') return 'north'
    if (wall === 'north') return 'south'
    return wall
  }
  if (entrance === 'east') {
    const mapped: Record<Wall, Wall> = { south: 'east', north: 'west', east: 'north', west: 'south' }
    return mapped[wall]
  }
  const mapped: Record<Wall, Wall> = { south: 'west', north: 'east', east: 'south', west: 'north' }
  return mapped[wall]
}

function wallSpan(room: { w: number; d: number }, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? room.w : room.d
}

function turnOpening<T extends UnitOpening>(opening: T, entrance: Wall, span: number): T {
  const wall = mapWall(opening.wall, entrance)
  if (entrance !== 'west') return { ...opening, wall }
  return { ...opening, wall, offset: Math.max(0, span - opening.offset - opening.width) }
}

function rotateRoom(room: UnitRoom, entrance: Wall, width: number, depth: number): UnitRoom {
  const door = room.door ? turnOpening(room.door, entrance, wallSpan(room, room.door.wall)) : null
  const window = room.window ? turnOpening(room.window, entrance, wallSpan(room, room.window.wall)) : null
  if (entrance === 'south') return { ...room, door, window }
  if (entrance === 'north') return { ...room, y: depth - room.y - room.d, door, window }
  if (entrance === 'east') return { ...room, x: width - room.y - room.d, y: room.x, w: room.d, d: room.w, door, window }
  return { ...room, x: room.y, y: depth - room.x - room.w, w: room.d, d: room.w, door, window }
}

export function generateUnitPlans(program: UnitProgram): UnitResult {
  const { width, depth, entrance } = program
  if (![width, depth].every((value) => Number.isFinite(value) && value >= 400 && value <= 4000)) {
    return { plans: [], message: '외곽의 가로와 세로는 400cm 이상 4000cm 이하여야 합니다.' }
  }
  const horizontal = entrance === 'south' || entrance === 'north'
  const genW = horizontal ? width : depth
  const genD = horizontal ? depth : width
  const rooms = buildPhoto(genW, genD).map((room) => rotateRoom(room, entrance, width, depth))
  return {
    plans: [{
      id: 'photo-1',
      label: '1층 평면도',
      note: '다용도실과 주방을 북쪽에 두고 거실을 넓게 둡니다. 남쪽은 드레스룸, 큰방, 현관, 작은방입니다.',
      rooms,
    }],
    message: '',
  }
}

function edgeOpening(kind: 'door' | 'window', opening: UnitOpening, roomW: number, roomD: number, sill = 0, height = 200) {
  let edge = 0
  let offset = opening.offset
  if (opening.wall === 'east') edge = 1
  if (opening.wall === 'north') {
    edge = 2
    offset = Math.max(0, roomW - opening.offset - opening.width)
  }
  if (opening.wall === 'west') {
    edge = 3
    offset = Math.max(0, roomD - opening.offset - opening.width)
  }
  return {
    id: uid(kind),
    kind,
    edge,
    offset,
    width: opening.width,
    sill,
    height,
  }
}

export function sceneFromEnvelope(width: number, depth: number, entrance: Wall): Scene {
  const doorSpan = entrance === 'north' || entrance === 'south' ? width : depth
  const doorWidth = Math.min(100, Math.max(70, doorSpan - 20))
  const door = { wall: entrance, width: doorWidth, offset: Math.round((doorSpan - doorWidth) / 2) }
  const windowWall: Wall = entrance === 'south' ? 'north' : entrance === 'north' ? 'south' : entrance === 'east' ? 'west' : 'east'
  const windowSpan = windowWall === 'north' || windowWall === 'south' ? width : depth
  const windowWidth = Math.min(160, Math.max(80, windowSpan - 80))
  const window = {
    wall: windowWall,
    width: windowWidth,
    offset: Math.round((windowSpan - windowWidth) / 2),
    sill: 90,
    height: 120,
  }
  return {
    room: { height: 250, outline: rectangleOutline(width, depth) },
    openings: [
      edgeOpening('door', door, width, depth, 0, 200),
      edgeOpening('window', window, width, depth, window.sill, window.height),
    ],
    furniture: [],
  }
}

export function sceneFromUnitRoom(room: UnitRoom): Scene {
  const openings = []
  if (room.door) openings.push(edgeOpening('door', room.door, room.w, room.d, 0, 200))
  if (room.window) openings.push(edgeOpening('window', room.window, room.w, room.d, room.window.sill, room.window.height))
  const furniture: Furniture[] = []
  if (room.kind === 'bedroom') furniture.push({ id: uid('bed'), type: 'bed', ...DEFAULT_SIZE.bed })
  if (room.kind === 'living') furniture.push({ id: uid('sofa'), type: 'sofa', ...DEFAULT_SIZE.sofa })
  return {
    room: { height: 250, outline: rectangleOutline(room.w, room.d) },
    openings,
    furniture,
  }
}
