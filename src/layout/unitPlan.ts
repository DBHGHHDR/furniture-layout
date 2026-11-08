import type { Furniture, Scene, Wall } from '../types.ts'
import { DEFAULT_SIZE, uid } from '../types.ts'
import { rectangleOutline } from './polygon.ts'

export type UnitProgram = {
  width: number
  depth: number
  bedrooms: number
  bathrooms: number
  living: boolean
  openKitchen: boolean
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
  openKitchen: true,
  entrance: 'south',
}

type Limits = {
  entranceW: number
  entranceD: number
  livingW: number
  livingD: number
  kitchenW: number
  kitchenD: number
  masterW: number
  masterD: number
  bedW: number
  bedD: number
  bathW: number
  bathD: number
  corridor: number
  utilityW: number
  utilityD: number
  dressW: number
  dressD: number
}

type RoomNode = {
  kind: 'room'
  id: string
  roomKind: UnitRoomKind
  name: string
  minW: number
  minD: number
}

type SplitNode = {
  kind: 'v' | 'h'
  parts: { weight: number; min: number; node: PlanNode }[]
}

type PlanNode = RoomNode | SplitNode

type Scheme = {
  id: string
  label: string
  note: string
  node: PlanNode
}

function limitsFor(area: number): Limits {
  const tiny = area < 40 * 10000
  const tight = area < 62 * 10000
  return {
    entranceW: tiny ? 120 : 150,
    entranceD: tiny ? 150 : 190,
    livingW: tiny ? 240 : tight ? 280 : 320,
    livingD: tiny ? 220 : tight ? 260 : 300,
    kitchenW: tiny ? 170 : 200,
    kitchenD: tiny ? 170 : 200,
    masterW: tiny ? 230 : 260,
    masterD: tiny ? 220 : 250,
    bedW: tiny ? 210 : 230,
    bedD: tiny ? 200 : 220,
    bathW: 140,
    bathD: tiny ? 140 : 150,
    corridor: tiny ? 100 : 110,
    utilityW: 160,
    utilityD: 170,
    dressW: 150,
    dressD: 160,
  }
}

function room(id: string, roomKind: UnitRoomKind, name: string, minW: number, minD: number): RoomNode {
  return { kind: 'room', id, roomKind, name, minW, minD }
}

function bedName(index: number, count: number): string {
  if (count === 1) return '방'
  return index === 0 ? '큰방' : `방 ${index + 1}`
}

function distribute(total: number, parts: { min: number; weight: number }[]): number[] | null {
  if (parts.length === 0) return []
  const minSum = parts.reduce((sum, part) => sum + part.min, 0)
  if (minSum > total) return null
  const extra = total - minSum
  const weightSum = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0)
  const raw = parts.map((part) => part.min + (weightSum === 0 ? extra / parts.length : extra * (Math.max(0, part.weight) / weightSum)))
  const sizes = raw.map((value) => Math.floor(value))
  let rest = total - sizes.reduce((sum, value) => sum + value, 0)
  const order = parts.map((_, index) => index).sort((a, b) => (raw[b]! - sizes[b]!) - (raw[a]! - sizes[a]!))
  for (const index of order) {
    if (rest <= 0) break
    sizes[index] = (sizes[index] ?? 0) + 1
    rest -= 1
  }
  if (sizes.some((size, index) => size < parts[index]!.min)) return null
  return sizes
}

function aspectOk(kind: UnitRoomKind, w: number, d: number): boolean {
  const ratio = Math.max(w, d) / Math.max(1, Math.min(w, d))
  if (kind === 'corridor') return Math.min(w, d) >= 100 && ratio <= 40
  if (kind === 'bathroom' || kind === 'utility' || kind === 'dress' || kind === 'entrance') return ratio <= 3.4
  return ratio <= 3
}

function realize(node: PlanNode, x: number, y: number, w: number, d: number, into: UnitRoom[]): boolean {
  if (w < 1 || d < 1) return false
  if (node.kind === 'room') {
    if (w < node.minW || d < node.minD || !aspectOk(node.roomKind, w, d)) return false
    into.push({ id: node.id, kind: node.roomKind, name: node.name, x, y, w, d, door: null, window: null })
    return true
  }
  const sizes = distribute(node.kind === 'v' ? w : d, node.parts)
  if (!sizes) return false
  let cursor = node.kind === 'v' ? x : y
  for (let index = 0; index < node.parts.length; index++) {
    const size = sizes[index]!
    const child = node.parts[index]!.node
    const ok = node.kind === 'v'
      ? realize(child, cursor, y, size, d, into)
      : realize(child, x, cursor, w, size, into)
    if (!ok) return false
    cursor += size
  }
  return true
}

function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0)
}

function touches(a: UnitRoom, b: UnitRoom): { wall: Wall; start: number; end: number } | null {
  const vertical = overlapLength(a.y, a.y + a.d, b.y, b.y + b.d)
  if (Math.abs(a.x + a.w - b.x) < 0.5 && vertical >= 70) {
    return { wall: 'east', start: Math.max(a.y, b.y) - a.y, end: Math.min(a.y + a.d, b.y + b.d) - a.y }
  }
  if (Math.abs(b.x + b.w - a.x) < 0.5 && vertical >= 70) {
    return { wall: 'west', start: Math.max(a.y, b.y) - a.y, end: Math.min(a.y + a.d, b.y + b.d) - a.y }
  }
  const horizontal = overlapLength(a.x, a.x + a.w, b.x, b.x + b.w)
  if (Math.abs(a.y + a.d - b.y) < 0.5 && horizontal >= 70) {
    return { wall: 'north', start: Math.max(a.x, b.x) - a.x, end: Math.min(a.x + a.w, b.x + b.w) - a.x }
  }
  if (Math.abs(b.y + b.d - a.y) < 0.5 && horizontal >= 70) {
    return { wall: 'south', start: Math.max(a.x, b.x) - a.x, end: Math.min(a.x + a.w, b.x + b.w) - a.x }
  }
  return null
}

function exteriorWalls(room: UnitRoom, width: number, depth: number): Wall[] {
  const walls: Wall[] = []
  if (room.y <= 0.5) walls.push('south')
  if (room.x + room.w >= width - 0.5) walls.push('east')
  if (room.y + room.d >= depth - 0.5) walls.push('north')
  if (room.x <= 0.5) walls.push('west')
  return walls
}

function centeredOpening(wall: Wall, start: number, end: number, width: number): UnitOpening | null {
  const span = end - start
  const door = Math.min(width, span - 16)
  if (door < 70) return null
  return { wall, offset: Math.round(start + (span - door) / 2), width: Math.round(door) }
}

function doorTargets(current: UnitRoom): string[] {
  if (current.kind === 'entrance') return []
  if (current.id === 'ensuite' || current.id === 'dress') return ['master', 'corridor', 'living']
  if (current.kind === 'kitchen') return ['living', 'corridor', 'entrance']
  if (current.kind === 'utility') return ['kitchen', 'living', 'corridor']
  if (current.kind === 'living') return ['entrance', 'corridor', 'kitchen']
  if (current.kind === 'corridor') return ['entrance', 'living']
  return ['corridor', 'living', 'entrance']
}

function doorWidth(kind: UnitRoomKind): number {
  if (kind === 'living') return 110
  if (kind === 'bedroom' || kind === 'kitchen' || kind === 'corridor') return 90
  if (kind === 'bathroom') return 75
  return 80
}

function assignDoor(current: UnitRoom, rooms: UnitRoom[]): UnitOpening | null {
  if (current.kind === 'entrance') return centeredOpening('south', 0, current.w, 100)
  for (const id of doorTargets(current)) {
    const host = rooms.find((room) => room.id === id)
    if (!host) continue
    const edge = touches(current, host)
    if (edge) return centeredOpening(edge.wall, edge.start, edge.end, doorWidth(current.kind))
  }
  return null
}

function windowWidth(kind: UnitRoomKind, span: number): number {
  const ratio = kind === 'living' ? 0.5 : kind === 'kitchen' ? 0.42 : kind === 'bedroom' ? 0.4 : kind === 'bathroom' ? 0.24 : 0.32
  const cap = kind === 'living' ? 420 : kind === 'bedroom' ? 220 : kind === 'kitchen' ? 200 : kind === 'bathroom' ? 80 : 120
  const min = kind === 'bathroom' ? 60 : 80
  return Math.round(Math.max(min, Math.min(cap, span * ratio, span - 24)))
}

function assignWindow(current: UnitRoom, width: number, depth: number): (UnitOpening & { sill: number; height: number }) | null {
  if (current.kind === 'entrance' || current.kind === 'corridor') return null
  const order: Record<UnitRoomKind, Wall[]> = {
    living: ['north', 'east', 'west', 'south'],
    kitchen: ['north', 'east', 'west', 'south'],
    bedroom: ['south', 'north', 'east', 'west'],
    bathroom: ['west', 'east', 'north', 'south'],
    utility: ['north', 'west', 'east', 'south'],
    dress: ['north', 'south', 'east', 'west'],
    entrance: [],
    corridor: [],
  }
  const exterior = exteriorWalls(current, width, depth)
  const ranked = order[current.kind].filter((wall) => exterior.includes(wall))
  const preferred = ranked.find((wall) => wall !== current.door?.wall) ?? ranked[0]
  if (!preferred) return null
  let span = wallSpan(current, preferred)
  let openingWidth = windowWidth(current.kind, span)
  let offset = Math.round((span - openingWidth) / 2)
  if (current.door?.wall === preferred) {
    const doorEnd = current.door.offset + current.door.width
    const right = doorEnd + 16
    const left = current.door.offset - 16
    if (span - right >= 60) {
      openingWidth = Math.min(openingWidth, span - right)
      offset = right + Math.max(0, Math.round((span - right - openingWidth) / 2))
    } else if (left >= 60) {
      openingWidth = Math.min(openingWidth, left)
      offset = Math.max(0, Math.round((left - openingWidth) / 2))
    } else {
      return null
    }
    span = wallSpan(current, preferred)
  }
  if (openingWidth < 60 || offset < 0 || offset + openingWidth > span) return null
  return { wall: preferred, offset, width: openingWidth, sill: 90, height: 110 }
}

function circulationOk(rooms: UnitRoom[]): boolean {
  const byId = (id: string) => rooms.find((room) => room.id === id)
  const corridor = byId('corridor')
  const living = rooms.find((room) => room.kind === 'living')
  const entrance = rooms.find((room) => room.kind === 'entrance')
  const hosts = [corridor, living, entrance].filter((room): room is UnitRoom => Boolean(room))
  for (const current of rooms) {
    if (current.kind === 'entrance' || current.kind === 'corridor') continue
    if (current.id === 'ensuite' || current.id === 'dress') {
      const master = byId('master')
      if (!master || !touches(current, master)) return false
      continue
    }
    if (current.kind === 'utility') {
      const kitchen = rooms.find((room) => room.kind === 'kitchen')
      const beside = kitchen ?? living
      if (!beside || !touches(current, beside)) return false
      continue
    }
    if (current.kind === 'kitchen') {
      if (hosts.some((host) => host.id !== current.id && touches(current, host)) || (living && touches(current, living))) continue
      return false
    }
    if (!hosts.some((host) => touches(current, host))) return false
  }
  return Boolean(entrance && entrance.y <= 0.5)
}

function finishRooms(rooms: UnitRoom[], width: number, depth: number): UnitRoom[] | null {
  if (!circulationOk(rooms)) return null
  const furnished = rooms.map((current) => ({ ...current, door: assignDoor(current, rooms) }))
  if (furnished.some((current) => current.door === null)) return null
  const withWindows = furnished.map((current) => ({ ...current, window: assignWindow(current, width, depth) }))
  const needsWindow = (room: UnitRoom) => room.kind === 'living' || room.kind === 'bedroom' || room.kind === 'kitchen'
  if (withWindows.some((room) => needsWindow(room) && room.window === null)) return null
  const living = withWindows.find((room) => room.kind === 'living')
  const bedrooms = withWindows.filter((room) => room.kind === 'bedroom')
  if (living && bedrooms.some((room) => room.w * room.d > living.w * living.d)) return null
  const master = withWindows.find((room) => room.id === 'master')
  if (master && bedrooms.some((room) => room.id !== 'master' && room.w * room.d > master.w * master.d)) return null
  const area = withWindows.reduce((sum, room) => sum + room.w * room.d, 0)
  if (area !== width * depth) return null
  return withWindows
}

function entrancePart(limits: Limits): SplitNode['parts'][number] {
  return { weight: 1, min: limits.entranceW, node: room('entrance', 'entrance', '현관', limits.entranceW, limits.entranceD) }
}

function dayParts(program: UnitProgram, limits: Limits, openKitchen: boolean, utility: boolean): SplitNode['parts'] {
  const parts: SplitNode['parts'] = []
  if (program.living) {
    const name = openKitchen ? '거실·주방' : '거실'
    parts.push({ weight: openKitchen ? 3.2 : 2.4, min: limits.livingW, node: room('living', 'living', name, limits.livingW, limits.livingD) })
  }
  if (!openKitchen) {
    parts.push({ weight: 1.35, min: limits.kitchenW, node: room('kitchen', 'kitchen', '주방', limits.kitchenW, limits.kitchenD) })
  }
  if (utility) {
    parts.push({ weight: 0.8, min: limits.utilityW, node: room('utility', 'utility', '다용도실', limits.utilityW, limits.utilityD) })
  }
  return parts
}

function hallPart(limits: Limits): SplitNode['parts'][number] {
  return { weight: 0.08, min: limits.corridor, node: room('corridor', 'corridor', '복도', 100, limits.corridor) }
}

function band(dayOnSouth: boolean, openKitchen: boolean, utility: boolean, dress: boolean, program: UnitProgram, limits: Limits): PlanNode | null {
  const night = nightRow(program, limits, dress)
  const cells = dayParts(program, limits, openKitchen, utility)
  if (!night) return studio(program, limits, openKitchen)
  if (!dayOnSouth && cells.length === 0) return null
  const dayDepth = Math.max(limits.entranceD, program.living ? limits.livingD : 0, !openKitchen ? limits.kitchenD : 0, utility ? limits.utilityD : 0)
  const southParts = dayOnSouth ? [entrancePart(limits), ...cells] : [entrancePart(limits), ...night.parts]
  const northParts = dayOnSouth ? night.parts : cells
  const southDepth = dayOnSouth ? dayDepth : Math.max(limits.entranceD, night.minD)
  const northFromCells = Math.max(...cells.map((part) => part.node.kind === 'room' ? part.node.minD : 0), 0)
  const fullWidthDay = !dayOnSouth && cells.length === 1
  const northDepth = dayOnSouth ? night.minD : Math.max(northFromCells, fullWidthDay ? Math.ceil(program.width / 3) : 0)
  return {
    kind: 'h',
    parts: [
      { weight: dayOnSouth ? 1.25 : 1.15, min: southDepth, node: { kind: 'v', parts: southParts } },
      hallPart(limits),
      { weight: dayOnSouth ? 1.15 : 1.3, min: northDepth, node: { kind: 'v', parts: northParts } },
    ],
  }
}

function studio(program: UnitProgram, limits: Limits, openKitchen: boolean): PlanNode {
  if (!program.living) {
    return {
      kind: 'h',
      parts: [
        { weight: 1, min: limits.entranceD, node: room('entrance', 'entrance', '현관', limits.entranceW, limits.entranceD) },
        { weight: 1.4, min: limits.kitchenD, node: room('kitchen', 'kitchen', '주방', limits.kitchenW, limits.kitchenD) },
      ],
    }
  }
  if (openKitchen) {
    return {
      kind: 'h',
      parts: [
        { weight: 0.75, min: limits.entranceD, node: room('entrance', 'entrance', '현관', limits.entranceW, limits.entranceD) },
        { weight: 2, min: limits.livingD, node: room('living', 'living', '거실·주방', limits.livingW, limits.livingD) },
      ],
    }
  }
  return {
    kind: 'h',
    parts: [
      {
        weight: 0.9,
        min: Math.max(limits.entranceD, limits.kitchenD),
        node: { kind: 'v', parts: [entrancePart(limits), { weight: 1.3, min: limits.kitchenW, node: room('kitchen', 'kitchen', '주방', limits.kitchenW, limits.kitchenD) }] },
      },
      { weight: 1.5, min: limits.livingD, node: room('living', 'living', '거실', limits.livingW, limits.livingD) },
    ],
  }
}

function nightRow(program: UnitProgram, limits: Limits, dress: boolean): { minD: number; parts: SplitNode['parts'] } | null {
  const parts: SplitNode['parts'] = []
  if (program.bedrooms >= 1) {
    if (dress) parts.push({ weight: 0.7, min: limits.dressW, node: room('dress', 'dress', '드레스룸', limits.dressW, limits.dressD) })
    parts.push({
      weight: 1.55,
      min: limits.masterW,
      node: room('master', 'bedroom', bedName(0, program.bedrooms), limits.masterW, limits.masterD),
    })
  }
  const ensuite = program.bedrooms >= 1 && program.bathrooms >= 2
  if (ensuite) parts.push({ weight: 0.7, min: limits.bathW, node: room('ensuite', 'bathroom', '전용 화장실', limits.bathW, limits.bathD) })
  for (let index = 1; index < program.bedrooms; index++) {
    parts.push({ weight: 1.15, min: limits.bedW, node: room(`bed-${index + 1}`, 'bedroom', bedName(index, program.bedrooms), limits.bedW, limits.bedD) })
  }
  const shared = program.bathrooms - (ensuite ? 1 : 0)
  for (let index = 0; index < shared; index++) {
    const id = index === 0 ? 'bath' : `bath-${index + 1}`
    const name = shared === 1 ? '화장실' : `화장실 ${index + 1}`
    parts.push({ weight: 0.65, min: limits.bathW, node: room(id, 'bathroom', name, limits.bathW, limits.bathD) })
  }
  if (parts.length === 0) return null
  const minD = Math.max(
    program.bedrooms > 0 ? limits.masterD : 0,
    program.bedrooms > 1 ? limits.bedD : 0,
    program.bathrooms > 0 ? limits.bathD : 0,
    dress ? limits.dressD : 0,
  )
  return { minD, parts }
}

function side(dayOnWest: boolean, openKitchen: boolean, utility: boolean, dress: boolean, program: UnitProgram, limits: Limits): PlanNode | null {
  const merged = openKitchen && program.living
  const dayRooms: { weight: number; min: number; node: RoomNode }[] = [
    { weight: 0.7, min: limits.entranceD, node: room('entrance', 'entrance', '현관', limits.entranceW, limits.entranceD) },
  ]
  if (program.living) {
    dayRooms.push({
      weight: merged ? 2.2 : 1.5,
      min: limits.livingD,
      node: room('living', 'living', merged ? '거실·주방' : '거실', limits.livingW, limits.livingD),
    })
  }
  if (!merged) {
    dayRooms.push({ weight: 1, min: limits.kitchenD, node: room('kitchen', 'kitchen', '주방', limits.kitchenW, limits.kitchenD) })
  }
  if (utility) dayRooms.push({ weight: 0.7, min: limits.utilityD, node: room('utility', 'utility', '다용도실', limits.utilityW, limits.utilityD) })
  const nightRooms: { weight: number; min: number; node: RoomNode }[] = []
  if (dress && program.bedrooms >= 1) {
    nightRooms.push({ weight: 0.65, min: limits.dressD, node: room('dress', 'dress', '드레스룸', limits.dressW, limits.dressD) })
  }
  if (program.bedrooms >= 1) {
    nightRooms.push({ weight: 1.4, min: limits.masterD, node: room('master', 'bedroom', bedName(0, program.bedrooms), limits.masterW, limits.masterD) })
  }
  const ensuite = program.bedrooms >= 1 && program.bathrooms >= 2
  if (ensuite) nightRooms.push({ weight: 0.7, min: limits.bathD, node: room('ensuite', 'bathroom', '전용 화장실', limits.bathW, limits.bathD) })
  for (let index = 1; index < program.bedrooms; index++) {
    nightRooms.push({ weight: 1.1, min: limits.bedD, node: room(`bed-${index + 1}`, 'bedroom', bedName(index, program.bedrooms), limits.bedW, limits.bedD) })
  }
  const shared = program.bathrooms - (ensuite ? 1 : 0)
  for (let index = 0; index < shared; index++) {
    const id = index === 0 ? 'bath' : `bath-${index + 1}`
    const name = shared === 1 ? '화장실' : `화장실 ${index + 1}`
    nightRooms.push({ weight: 0.65, min: limits.bathD, node: room(id, 'bathroom', name, limits.bathW, limits.bathD) })
  }
  const dayMinW = Math.max(...dayRooms.map((part) => part.node.minW))
  const day: SplitNode['parts'][number] = { weight: 1.15, min: dayMinW, node: { kind: 'h', parts: dayRooms } }
  const parts: SplitNode['parts'] = [day]
  if (nightRooms.length > 0) {
    parts.push({
      weight: 0.05,
      min: limits.corridor,
      node: room('corridor', 'corridor', '복도', limits.corridor, 100),
    })
    const nightMinW = Math.max(...nightRooms.map((part) => part.node.minW))
    parts.push({ weight: 1.2, min: nightMinW, node: { kind: 'h', parts: nightRooms } })
  }
  if (!dayOnWest) parts.reverse()
  return { kind: 'v', parts }
}

function schemesFor(program: UnitProgram, limits: Limits): Scheme[] {
  const area = program.width * program.depth
  const utility = area >= 80 * 10000
  const dress = area >= 95 * 10000 && program.bedrooms >= 1
  const open = program.living && program.openKitchen
  if (program.bedrooms + program.bathrooms === 0) {
    return open
      ? [{
          id: 'open-studio',
          label: '거실·주방 일체형',
          note: '현관 안쪽을 거실과 주방이 함께 쓰는 한 공간으로 둡니다.',
          node: studio(program, limits, true),
        }]
      : [{
          id: 'studio',
          label: '거실이 안쪽',
          note: '현관과 주방을 입구에 두고 안쪽을 거실로 넓게 씁니다.',
          node: studio(program, limits, false),
        }]
  }
  const specs: { id: string; label: string; note: string; node: PlanNode | null }[] = [
    {
      id: 'day-front',
      label: '낮이 현관 쪽',
      note: open
        ? '현관 옆에 거실·주방을 한 공간으로 두고, 복도 건너에 방과 화장실을 모읍니다.'
        : '현관 옆에 거실과 주방을 두고, 복도 건너에 방과 화장실을 모읍니다.',
      node: band(true, open, false, false, program, limits),
    },
    {
      id: 'day-back',
      label: '낮이 안쪽',
      note: open
        ? '현관과 방을 입구 쪽에 두고, 안쪽을 거실·주방 한 공간으로 넓게 둡니다.'
        : '현관과 방을 입구 쪽에 두고, 안쪽에 거실과 주방을 넓게 둡니다.',
      node: band(false, open, false, false, program, limits),
    },
    {
      id: 'side-west',
      label: '낮이 왼쪽',
      note: open
        ? '왼쪽을 거실·주방 한 공간으로 쓰고, 복도 오른쪽 외벽에 방과 화장실을 둡니다.'
        : '왼쪽을 거실과 주방으로 쓰고, 복도 오른쪽 외벽에 방과 화장실을 둡니다.',
      node: side(true, open, false, false, program, limits),
    },
    {
      id: 'side-east',
      label: '낮이 오른쪽',
      note: open
        ? '오른쪽을 거실·주방 한 공간으로 쓰고, 복도 왼쪽 외벽에 방과 화장실을 둡니다.'
        : '오른쪽을 거실과 주방으로 쓰고, 복도 왼쪽 외벽에 방과 화장실을 둡니다.',
      node: side(false, open, false, false, program, limits),
    },
  ]
  if (utility) {
    specs.push({
      id: 'with-utility',
      label: '다용도실이 있는 낮',
      note: open
        ? '거실·주방 옆에 다용도실을 붙이고, 방과 화장실은 복도 건너에 둡니다.'
        : '주방 옆에 다용도실을 붙이고, 방과 화장실은 복도 건너에 둡니다.',
      node: band(true, open, true, false, program, limits),
    })
  }
  if (dress) {
    specs.push({
      id: 'with-dress',
      label: '드레스룸이 있는 큰방',
      note: open
        ? '큰방 옆에 드레스룸을 두고, 낮 쪽은 거실·주방 한 공간으로 둡니다.'
        : '큰방 옆에 드레스룸을 두고, 전용 화장실이 있으면 그 방에만 붙입니다.',
      node: band(true, open, false, true, program, limits),
    })
  }
  return specs.flatMap((spec) => (spec.node ? [{ id: spec.id, label: spec.label, note: spec.note, node: spec.node }] : []))
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

function realizeScheme(scheme: Scheme, width: number, depth: number): UnitPlan | null {
  const placed: UnitRoom[] = []
  if (!realize(scheme.node, 0, 0, width, depth, placed)) return null
  const rooms = finishRooms(placed, width, depth)
  if (!rooms) return null
  return { id: scheme.id, label: scheme.label, note: scheme.note, rooms }
}

export function generateUnitPlans(program: UnitProgram): UnitResult {
  const { width, depth, entrance } = program
  if (![width, depth].every((value) => Number.isFinite(value) && value >= 400 && value <= 4000)) {
    return { plans: [], message: '외곽의 가로와 세로는 400cm 이상 4000cm 이하여야 합니다.' }
  }
  const horizontal = entrance === 'south' || entrance === 'north'
  const genW = horizontal ? width : depth
  const genD = horizontal ? depth : width
  const local = { ...program, width: genW, depth: genD, entrance: 'south' as const }
  const limits = limitsFor(genW * genD)
  const plans = schemesFor(local, limits).flatMap((scheme) => {
    const built = realizeScheme(scheme, genW, genD)
    if (!built) return []
    return [{ ...built, rooms: built.rooms.map((room) => rotateRoom(room, entrance, width, depth)) }]
  })
  if (plans.length === 0) {
    return {
      plans: [],
      message: '이 외곽에는 입력한 방과 화장실을 조건에 맞게 나누기 어렵습니다. 가로·세로를 키우거나 개수를 줄여 보세요.',
    }
  }
  return { plans, message: '' }
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
