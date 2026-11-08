import type { Furniture, FurnitureType, GoalId, LayoutResult, Opening, Placed, Scene } from '../types.ts'
import { FURNITURE_LABEL, FURNITURE_OBJECT, FURNITURE_SUBJECT, GOALS, ROTATIONS } from '../types.ts'
import {
  backEdge,
  beside,
  centrality,
  doorCenters,
  doorQuads,
  flushPlacements,
  gridCandidates,
  isFlush,
  isValid,
  makePlaced,
  minWindowDistance,
  nearestDoorDistance,
  placeInFront,
  spanOverlap,
  wallCandidates,
  centerOf,
} from './geometry.ts'
import { largestEmpty } from './openArea.ts'
import { boundsOf, edgeTitle, getEdge, oppositeEdge, selfIntersects, signedArea, type Quad } from './polygon.ts'

const BEAM = 8
const KEEP = 12

type Beam = { placed: Placed[]; score: number }
type Option = { placed: Placed[]; score: number }
type Step =
  | { kind: 'bed'; bed: Furniture }
  | { kind: 'desk'; desk: Furniture; chair?: Furniture }
  | { kind: 'sofa'; sofa: Furniture; table?: Furniture }
  | { kind: 'single'; item: Furniture }

type Expansion = { options: Option[]; deferred: Furniture[] }

const STORAGE = new Set<FurnitureType>(['wardrobe', 'bookshelf', 'dresser'])

function isStorage(type: FurnitureType): boolean {
  return STORAGE.has(type)
}

function windowsOf(openings: Opening[]): Opening[] {
  return openings.filter((opening) => opening.kind === 'window')
}

export function validate(scene: Scene): string | null {
  const { room, openings, furniture } = scene
  const outline = room.outline
  if (!Array.isArray(outline) || outline.length < 3 || outline.length > 12) {
    return '방 모양은 점 3개 이상 12개 이하여야 합니다.'
  }
  if (outline.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return '방 모양의 점 좌표를 확인해 주세요.'
  }
  const box = boundsOf(outline)
  if (![box.width, box.depth, room.height].every((value) => Number.isFinite(value) && value >= 100 && value <= 2000)) {
    return '방의 가로, 세로, 층고는 100cm 이상 2000cm 이하여야 합니다.'
  }
  for (let index = 0; index < outline.length; index++) {
    const edge = getEdge(outline, index)
    if (!edge || edge.length < 40) return '방 모양의 각 변은 40cm 이상이어야 합니다.'
  }
  if (selfIntersects(outline)) return '방 모양이 서로 교차합니다.'
  if (Math.abs(signedArea(outline)) < 500) return '방 넓이가 너무 작습니다.'

  const grouped = new Map<number, Opening[]>()
  for (const opening of openings) {
    if (!Number.isInteger(opening.edge) || opening.edge < 0 || opening.edge >= outline.length) {
      return '문이나 창문이 없는 변을 가리킵니다.'
    }
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width) || opening.width <= 0 || opening.offset < 0) {
      return '문과 창문의 위치와 폭을 확인해 주세요.'
    }
    const length = getEdge(outline, opening.edge)?.length ?? 0
    if (opening.offset + opening.width > length + 0.1) return '문이나 창문이 벽 길이를 벗어났습니다.'
    if (opening.kind === 'window') {
      if (opening.sill < 0 || opening.height <= 0) return '창문 높이를 확인해 주세요.'
      if (opening.sill + opening.height > room.height + 0.1) return '창문 아래와 창문 높이를 더하면 층고를 넘습니다.'
    }
    const list = grouped.get(opening.edge) ?? []
    list.push(opening)
    grouped.set(opening.edge, list)
  }
  for (const list of grouped.values()) {
    const sorted = [...list].sort((a, b) => a.offset - b.offset)
    for (let index = 1; index < sorted.length; index++) {
      const prev = sorted[index - 1]!
      const next = sorted[index]!
      if (next.offset < prev.offset + prev.width - 0.1) return '같은 변에서 문과 창문이 겹칩니다.'
    }
  }

  for (const item of furniture) {
    if (![item.width, item.depth, item.height].every((value) => Number.isFinite(value) && value > 0)) {
      return '가구 크기는 0보다 커야 합니다.'
    }
    if (item.height > room.height) return `${FURNITURE_LABEL[item.type]} 높이가 층고보다 큽니다.`
    const fits =
      (item.width <= box.width && item.depth <= box.depth) ||
      (item.depth <= box.width && item.width <= box.depth)
    if (!fits) return `${FURNITURE_SUBJECT[item.type]} 방보다 커서 들어가지 않습니다.`
  }
  return null
}

function fail(goal: GoalId, message: string): LayoutResult {
  return { goal, ok: false, message, placed: [], openAreaCm2: 0, openRect: null }
}

function cannotPlace(type: FurnitureType): string {
  return `${FURNITURE_OBJECT[type]} 문 앞을 비우고 겹치지 않게 둘 자리가 없습니다.`
}

function take(pool: Furniture[], type: FurnitureType): Furniture | undefined {
  const index = pool.findIndex((item) => item.type === type)
  if (index < 0) return undefined
  return pool.splice(index, 1)[0]
}

function takeAll(pool: Furniture[], type: FurnitureType): Furniture[] {
  const found = pool.filter((item) => item.type === type)
  for (const item of found) pool.splice(pool.indexOf(item), 1)
  return found
}

function buildSteps(goal: GoalId, furniture: Furniture[]): Step[] {
  const pool = [...furniture]
  const pullBeds = () => {
    const steps: Array<{ kind: 'bed'; bed: Furniture }> = []
    let bed = take(pool, 'bed')
    while (bed) {
      steps.push({ kind: 'bed', bed })
      bed = take(pool, 'bed')
    }
    return steps
  }
  const pullDesks = () => {
    const steps: Array<{ kind: 'desk'; desk: Furniture; chair?: Furniture }> = []
    let desk = take(pool, 'desk')
    while (desk) {
      steps.push({ kind: 'desk', desk, chair: take(pool, 'chair') })
      desk = take(pool, 'desk')
    }
    return steps
  }
  const pullSofas = () => {
    const steps: Array<{ kind: 'sofa'; sofa: Furniture; table?: Furniture }> = []
    let sofa = take(pool, 'sofa')
    while (sofa) {
      steps.push({ kind: 'sofa', sofa, table: take(pool, 'table') })
      sofa = take(pool, 'sofa')
    }
    return steps
  }
  const pullStorage = () => {
    const steps: Array<{ kind: 'single'; item: Furniture }> = []
    for (const type of ['wardrobe', 'bookshelf', 'dresser'] as const) {
      for (const item of takeAll(pool, type)) steps.push({ kind: 'single', item })
    }
    return steps
  }
  const pullNightstands = () => takeAll(pool, 'nightstand').map((item) => ({ kind: 'single' as const, item }))
  const pullRest = () => {
    pool.sort((a, b) => b.width * b.depth - a.width * a.depth)
    const steps = pool.map((item) => ({ kind: 'single' as const, item }))
    pool.length = 0
    return steps
  }

  if (goal === 'open') {
    const weighted: Array<{ step: Step; weight: number }> = [
      ...pullBeds().map((step) => ({ step, weight: step.bed.width * step.bed.depth }) as { step: Step; weight: number }),
      ...pullSofas().map((step) => ({ step, weight: step.sofa.width * step.sofa.depth }) as { step: Step; weight: number }),
      ...pullDesks().map((step) => ({ step, weight: step.desk.width * step.desk.depth }) as { step: Step; weight: number }),
      ...pullStorage().map((step) => ({ step, weight: step.item.width * step.item.depth })),
      ...pullRest().map((step) => ({ step, weight: step.item.width * step.item.depth })),
    ]
    weighted.sort((a, b) => b.weight - a.weight)
    return weighted.map((entry) => entry.step)
  }
  if (goal === 'sleep') return [...pullBeds(), ...pullNightstands(), ...pullStorage(), ...pullDesks(), ...pullSofas(), ...pullRest()]
  if (goal === 'study') return [...pullDesks(), ...pullBeds(), ...pullNightstands(), ...pullStorage(), ...pullSofas(), ...pullRest()]
  if (goal === 'living') return [...pullSofas(), ...pullStorage(), ...pullBeds(), ...pullNightstands(), ...pullDesks(), ...pullRest()]
  return [...pullStorage(), ...pullBeds(), ...pullNightstands(), ...pullDesks(), ...pullSofas(), ...pullRest()]
}

function topOptions(options: Option[], limit: number): Option[] {
  const sorted = [...options].sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const out: Option[] = []
  for (const option of sorted) {
    const key = option.placed.map((item) => `${item.id}@${item.x},${item.y},${item.rotation}`).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(option)
    if (out.length >= limit) break
  }
  return out
}

function scoreBed(goal: GoalId, placed: Placed, room: Scene['room'], openings: Opening[]): number {
  let score = 0
  const edge = backEdge(placed, room)
  score += edge !== null ? 700 : -450
  const doors = doorCenters(room, openings)
  const distance = nearestDoorDistance(centerOf(placed), doors)
  if (goal === 'sleep') score += distance * 0.9
  const windows = windowsOf(openings)
  if (edge !== null && windows.some((win) => win.edge === edge && spanOverlap(placed, win, room.outline)) && goal === 'sleep') score -= 240
  if (goal === 'study') {
    if (edge !== null && windows.some((win) => oppositeEdge(room.outline, win.edge) === edge)) score += 420
    score += minWindowDistance(placed, windows, room) * 0.45
  }
  if (goal === 'living') score -= centrality(placed, room) * 220
  return score
}

function scoreDesk(goal: GoalId, placed: Placed, room: Scene['room'], openings: Opening[], chairPlaced: boolean): number {
  let score = chairPlaced ? 320 : -240
  const windows = windowsOf(openings)
  const distance = minWindowDistance(placed, windows, room)
  const edge = backEdge(placed, room)
  if (goal === 'study') {
    score += 980 - distance * 2.4
    if (edge !== null && windows.some((win) => win.edge === edge && spanOverlap(placed, win, room.outline))) score += 480
  } else if (isFlush(placed, room)) {
    score += 70
  }
  if (goal === 'living') score -= centrality(placed, room) * 180
  return score
}

function scoreSofa(goal: GoalId, placed: Placed, room: Scene['room'], tablePlaced: boolean): number {
  let score = tablePlaced ? 520 : -60
  const edge = backEdge(placed, room)
  if (edge !== null) score += goal === 'living' ? 760 : 180
  else score -= 160
  if (goal === 'living') score -= centrality(placed, room) * 80
  return score
}

function scoreSingle(goal: GoalId, item: Furniture, placed: Placed, existing: Placed[], room: Scene['room'], openings: Opening[]): number {
  let score = isFlush(placed, room) ? 90 : -40
  if (item.type === 'nightstand') {
    const bed = existing.find((other) => other.type === 'bed')
    if (bed && beside(placed, bed, 16)) score += goal === 'sleep' ? 560 : 180
    else score -= 70
  }
  if (isStorage(item.type)) {
    score += isFlush(placed, room) ? (goal === 'storage' ? 740 : 160) : -80
    const neighbors = existing.filter((other) => isStorage(other.type) && beside(placed, other, 16))
    if (goal === 'storage') score += neighbors.length * 200
  }
  if (goal === 'living') score -= centrality(placed, room) * 380
  if (goal === 'sleep') score += nearestDoorDistance(centerOf(placed), doorCenters(room, openings)) * 0.12
  if (goal === 'study' && item.type === 'bed') score += minWindowDistance(placed, windowsOf(openings), room) * 0.2
  return score
}

function positionsFor(room: Scene['room'], w: number, d: number, allowGrid: boolean): Array<{ x: number; y: number }> {
  const wall = wallCandidates(room, w, d)
  if (!allowGrid) return wall
  return gridCandidates(room, w, d)
}

function collectPlacements(
  item: Furniture,
  room: Scene['room'],
  doors: Quad[],
  windows: Opening[],
  existing: Placed[],
  goal: GoalId,
  score: (placed: Placed) => number,
  requireBack: boolean,
): Option[] {
  const options: Option[] = []
  const pushPlaced = (placed: Placed) => {
    if (requireBack && backEdge(placed, room) === null) return
    if (!isValid(placed, room, doors, windows, existing)) return
    const value = goal === 'open' ? largestEmpty(room, existing.concat(placed)).area : score(placed)
    options.push({ placed: [placed], score: value })
  }
  const consider = (grid: boolean) => {
    for (const rotation of ROTATIONS) {
      const size = rotation === 90 || rotation === 270 ? { w: item.depth, d: item.width } : { w: item.width, d: item.depth }
      for (const point of positionsFor(room, size.w, size.d, grid)) {
        pushPlaced(makePlaced(item, point.x, point.y, rotation))
      }
    }
    if (!grid) {
      for (const point of flushPlacements(item, room)) {
        pushPlaced(makePlaced(item, point.x, point.y, point.rotation))
      }
    }
  }
  consider(false)
  if (options.length === 0 && !requireBack) consider(true)
  if (options.length === 0 && requireBack) {
    return collectPlacements(item, room, doors, windows, existing, goal, score, false)
  }
  return options
}

function expandStep(
  step: Step,
  goal: GoalId,
  state: Beam,
  scene: Scene,
  doors: Quad[],
  windows: Opening[],
): Expansion {
  const { room } = scene
  if (step.kind === 'bed') {
    const options = collectPlacements(
      step.bed,
      room,
      doors,
      windows,
      state.placed,
      goal,
      (placed) => scoreBed(goal, placed, room, scene.openings),
      true,
    )
    return { options: topOptions(options, KEEP), deferred: [] }
  }

  if (step.kind === 'desk') {
    const withChair: Option[] = []
    const without: Option[] = []
    const anchors = collectPlacements(
      step.desk,
      room,
      doors,
      windows,
      state.placed,
      goal === 'open' ? 'storage' : goal,
      () => 0,
      false,
    )
    for (const anchor of anchors) {
      const desk = anchor.placed[0]!
      const chair = step.chair
        ? placeInFront(desk, step.chair, room, doors, windows, state.placed.concat(desk))
        : null
      const group = chair ? [desk, chair] : [desk]
      const base = goal === 'open' ? largestEmpty(room, state.placed.concat(group)).area : scoreDesk(goal, desk, room, scene.openings, Boolean(chair))
      const option = { placed: group, score: base }
      if (chair) withChair.push(option)
      else without.push(option)
    }
    if (step.chair && withChair.length > 0) return { options: topOptions(withChair, KEEP), deferred: [] }
    if (step.chair) return { options: topOptions(without, KEEP), deferred: [step.chair] }
    return { options: topOptions(without, KEEP), deferred: [] }
  }

  if (step.kind === 'sofa') {
    const withTable: Option[] = []
    const without: Option[] = []
    const anchors = collectPlacements(
      step.sofa,
      room,
      doors,
      windows,
      state.placed,
      goal === 'open' ? 'storage' : goal,
      () => 0,
      true,
    )
    for (const anchor of anchors) {
      const sofa = anchor.placed[0]!
      const table = step.table
        ? placeInFront(sofa, step.table, room, doors, windows, state.placed.concat(sofa), 20)
        : null
      const group = table ? [sofa, table] : [sofa]
      const base = goal === 'open' ? largestEmpty(room, state.placed.concat(group)).area : scoreSofa(goal, sofa, room, Boolean(table))
      const option = { placed: group, score: base }
      if (table) withTable.push(option)
      else without.push(option)
    }
    if (step.table && withTable.length > 0) return { options: topOptions(withTable, KEEP), deferred: [] }
    if (step.table) return { options: topOptions(without, KEEP), deferred: [step.table] }
    return { options: topOptions(without, KEEP), deferred: [] }
  }

  const options = collectPlacements(
    step.item,
    room,
    doors,
    windows,
    state.placed,
    goal,
    (placed) => scoreSingle(goal, step.item, placed, state.placed, room, scene.openings),
    false,
  )
  return { options: topOptions(options, KEEP), deferred: [] }
}

function anchorType(step: Step): FurnitureType {
  if (step.kind === 'bed') return step.bed.type
  if (step.kind === 'desk') return step.desk.type
  if (step.kind === 'sofa') return step.sofa.type
  return step.item.type
}

function describe(goal: GoalId, placed: Placed[], scene: Scene, areaM2: number): string {
  const { room, openings } = scene
  const windows = windowsOf(openings)
  const doors = doorCenters(room, openings)
  const areaText = areaM2.toFixed(1)

  if (goal === 'open') {
    return `가구를 벽 쪽으로 붙여 가장 큰 빈 직사각형이 ${areaText}㎡입니다.`
  }
  if (goal === 'sleep') {
    const bed = placed.find((item) => item.type === 'bed')
    if (!bed) return '침대가 없습니다. 나머지 가구는 벽에 붙여 두었습니다.'
    const edge = backEdge(bed, room)
    const distance = Math.round(nearestDoorDistance(centerOf(bed), doors))
    const nightstand = placed.find((item) => item.type === 'nightstand' && beside(item, bed, 16))
    const head = edge !== null
      ? `침대 머리맡이 ${edgeTitle(room.outline, edge)} 벽에 닿아 있습니다.`
      : '침대를 방 안에 두었습니다.'
    const doorText = doors.length > 0 ? ` 문과는 약 ${distance}cm 떨어져 있습니다.` : ''
    const side = nightstand ? ' 협탁은 침대 옆에 있습니다.' : ''
    return `${head}${doorText}${side}`
  }
  if (goal === 'study') {
    const desk = placed.find((item) => item.type === 'desk')
    const wantedChair = scene.furniture.some((item) => item.type === 'chair')
    const chair = placed.find((item) => item.type === 'chair')
    if (!desk) return '책상이 없습니다. 큰 가구를 창문에서 먼 쪽에 두었습니다.'
    const distance = Math.round(minWindowDistance(desk, windows, room))
    const windowText =
      windows.length === 0
        ? '창문이 없어 책상을 벽에 붙여 두었습니다.'
        : `책상을 창문에서 약 ${distance}cm 위치에 두었습니다.`
    if (!wantedChair) return windowText
    const chairOk = chair ? beside(chair, desk, 30) : false
    return chairOk ? `${windowText} 의자 공간을 책상 앞에 두었습니다.` : `${windowText} 의자 자리를 확보하지 못했습니다.`
  }
  if (goal === 'living') {
    const sofa = placed.find((item) => item.type === 'sofa')
    const table = placed.find((item) => item.type === 'table')
    if (!sofa) return '소파가 없습니다. 가구를 벽에 붙여 가운데 통행을 남겼습니다.'
    const edge = backEdge(sofa, room)
    const base = edge !== null ? `소파 등을 ${edgeTitle(room.outline, edge)} 벽에 붙였습니다.` : '소파를 방 안에 두었습니다.'
    if (table && beside(table, sofa, 40)) return `${base} 테이블을 소파 앞에 두어 마주 보는 자리를 만들었습니다.`
    return base
  }
  const storage = placed.filter((item) => isStorage(item.type))
  if (storage.length === 0) return '수납 가구가 없습니다. 나머지 가구를 벽에 모아 두었습니다.'
  return '수납 가구를 벽에 붙여 남은 바닥을 한쪽으로 모았습니다.'
}

export function solve(goal: GoalId, scene: Scene): LayoutResult {
  const error = validate(scene)
  if (error) return fail(goal, error)
  const doors = doorQuads(scene.room, scene.openings)
  const windows = windowsOf(scene.openings)
  const steps = buildSteps(goal, scene.furniture)
  let beam: Beam[] = [{ placed: [], score: 0 }]

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!
    const collected: Beam[] = []
    let deferred: Furniture[] = []
    for (const state of beam) {
      const expansion = expandStep(step, goal, state, scene, doors, windows)
      if (expansion.deferred.length > 0) deferred = expansion.deferred
      for (const option of expansion.options) {
        collected.push({
          placed: state.placed.concat(option.placed),
          score: goal === 'open' ? option.score : state.score + option.score,
        })
      }
    }
    if (collected.length === 0) return fail(goal, cannotPlace(anchorType(step)))
    collected.sort((a, b) => b.score - a.score)
    const seen = new Set<string>()
    beam = []
    for (const state of collected) {
      const key = state.placed
        .map((item) => `${item.id}@${Math.round(item.x)}:${Math.round(item.y)}:${item.rotation}`)
        .sort()
        .join('|')
      if (seen.has(key)) continue
      seen.add(key)
      beam.push(state)
      if (beam.length >= BEAM) break
    }
    const missing = deferred.filter((item) => !beam.some((state) => state.placed.some((placed) => placed.id === item.id)))
    if (missing.length > 0) {
      steps.splice(index + 1, 0, ...missing.map((item) => ({ kind: 'single' as const, item })))
    }
  }

  const best = beam[0]
  if (!best) return fail(goal, '배치를 만들지 못했습니다.')
  const open = largestEmpty(scene.room, best.placed)
  const areaM2 = open.area / 10000
  return {
    goal,
    ok: true,
    message: describe(goal, best.placed, scene, areaM2),
    placed: best.placed,
    openAreaCm2: open.area,
    openRect: open.rect,
  }
}

export function generateAll(scene: Scene): LayoutResult[] {
  const error = validate(scene)
  if (error) return GOALS.map((goal) => fail(goal, error))
  return GOALS.map((goal) => solve(goal, scene))
}
