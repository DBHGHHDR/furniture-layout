import { beside, blocksWindow, doorQuads, furnitureQuad, isValid, makePlaced } from './geometry.ts'
import { generateAll, validate } from './generate.ts'
import { measureRoom } from './dimensions.ts'
import { generateUnitPlans } from './unitPlan.ts'
import { largestEmpty } from './openArea.ts'
import { rectangleOutline } from './polygon.ts'
import { createSample } from '../sample.ts'
import { backEdge } from './geometry.ts'
import type { Scene } from '../types.ts'
import { quadsOverlap } from './polygon.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const box = { height: 250, outline: rectangleOutline(400, 350) }
const empty = largestEmpty(box, [])
assert(empty.area === 140000, `빈 방 면적 ${empty.area}`)

const corner = largestEmpty(box, [{ x: 0, y: 0, w: 160, d: 200 }])
assert(corner.area === 84000, `구석 침대 빈 면적 ${corner.area}`)

const sample = createSample()
const started = performance.now()
const results = generateAll(sample)
const elapsed = Math.round(performance.now() - started)
console.log(`sample ${elapsed}ms`)

for (const result of results) {
  console.log(result.goal, result.ok, (result.openAreaCm2 / 10000).toFixed(2), result.message)
  assert(result.ok, `${result.goal} 실패: ${result.message}`)
  assert(result.placed.length === sample.furniture.length, `${result.goal} 가구 수 ${result.placed.length}`)
  for (let i = 0; i < result.placed.length; i++) {
    for (let j = i + 1; j < result.placed.length; j++) {
      assert(!quadsOverlap(furnitureQuad(result.placed[i]!), furnitureQuad(result.placed[j]!)), `${result.goal} 겹침`)
    }
  }
  const doors = doorQuads(sample.room, sample.openings)
  for (const item of result.placed) {
    for (const door of doors) assert(!quadsOverlap(furnitureQuad(item), door), `${result.goal} 문 여유 침범 ${item.type}`)
    const windows = sample.openings.filter((opening) => opening.kind === 'window')
    assert(!blocksWindow(item, sample.room, windows), `${result.goal} 창문 가림 ${item.type}`)
  }
}

const open = results.find((result) => result.goal === 'open')!
for (const result of results) {
  assert(open.openAreaCm2 + 1 >= result.openAreaCm2, `가장 넓은 공간 ${open.openAreaCm2} < ${result.goal} ${result.openAreaCm2}`)
}

const sleep = results.find((result) => result.goal === 'sleep')!
const bed = sleep.placed.find((item) => item.type === 'bed')!
assert(backEdge(bed, sample.room) !== null, '수면 침대 머리맡')

const study = results.find((result) => result.goal === 'study')!
const desk = study.placed.find((item) => item.type === 'desk')!
const chair = study.placed.find((item) => item.type === 'chair')!
assert(beside(desk, chair, 30), '공부 의자')

const tall: Scene = createSample()
tall.furniture = tall.furniture.map((item) => (item.type === 'wardrobe' ? { ...item, height: 300 } : item))
const tallResults = generateAll(tall)
assert(tallResults.every((result) => !result.ok && result.message.includes('층고')), tallResults[0]?.message ?? '층고 검사 실패')

const huge: Scene = createSample()
huge.furniture = huge.furniture.map((item) => (item.type === 'bed' ? { ...item, width: 500, depth: 500 } : item))
const hugeResults = generateAll(huge)
assert(hugeResults.every((result) => !result.ok && result.message.includes('방보다')), hugeResults[0]?.message ?? '크기 검사 실패')

const living = createSample()
living.furniture = [
  ...living.furniture,
  { id: 'sofa-1', type: 'sofa', width: 180, depth: 80, height: 78 },
  { id: 'table-1', type: 'table', width: 80, depth: 45, height: 40 },
  { id: 'night-1', type: 'nightstand', width: 40, depth: 40, height: 48 },
]
const livingResults = generateAll(living)
const livingGoal = livingResults.find((result) => result.goal === 'living')!
console.log('living', livingGoal.ok, livingGoal.message)
assert(livingGoal.ok, livingGoal.message)
const sofa = livingGoal.placed.find((item) => item.type === 'sofa')!
const table = livingGoal.placed.find((item) => item.type === 'table')!
assert(backEdge(sofa, living.room) !== null, '소파 등')
assert(beside(sofa, table, 40), '테이블 앞')
const night = livingResults.find((result) => result.goal === 'sleep')!
const sleepBed = night.placed.find((item) => item.type === 'bed')!
const stand = night.placed.find((item) => item.type === 'nightstand')!
assert(beside(sleepBed, stand, 16), '협탁')

const bowtie = validate({
  room: {
    height: 250,
    outline: [
      { x: 0, y: 0 },
      { x: 300, y: 200 },
      { x: 0, y: 200 },
      { x: 300, y: 0 },
    ],
  },
  openings: [],
  furniture: [],
})
assert(Boolean(bowtie?.includes('교차')), bowtie ?? '교차 검사 실패')

const lRoom = {
  height: 250,
  outline: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 150 },
    { x: 150, y: 150 },
    { x: 150, y: 300 },
    { x: 0, y: 300 },
  ],
}
const outside = makePlaced({ id: 'out', type: 'nightstand', width: 80, depth: 80, height: 40 }, 200, 200, 0)
const inside = makePlaced({ id: 'in', type: 'nightstand', width: 80, depth: 80, height: 40 }, 10, 10, 0)
assert(!isValid(outside, lRoom, [], [], []), '윤곽 밖 가구')
assert(isValid(inside, lRoom, [], [], []), '윤곽 안 가구')

const unit = generateUnitPlans({ width: 1180, depth: 775, bedrooms: 2, bathrooms: 2, living: true, openKitchen: true, entrance: 'south' })
assert(unit.plans.length >= 3, unit.message || `시안 ${unit.plans.length}`)
for (const plan of unit.plans) {
  assert(plan.note.length > 0, plan.label)
  assert(plan.rooms.filter((room) => room.kind === 'bedroom').length === 2, `${plan.label} 방`)
  assert(plan.rooms.filter((room) => room.kind === 'bathroom').length === 2, `${plan.label} 화장실`)
  assert(plan.rooms.some((room) => room.kind === 'entrance' && room.y <= 0.5 && room.door?.wall === 'south'), `${plan.label} 현관`)
  assert(plan.rooms.some((room) => room.kind === 'living'), `${plan.label} 거실`)
  assert(plan.rooms.some((room) => room.kind === 'corridor'), `${plan.label} 복도`)
  const day = plan.rooms.find((room) => room.kind === 'kitchen') ?? plan.rooms.find((room) => room.name.includes('주방'))
  assert(day !== undefined, `${plan.label} 주방`)
  const living = plan.rooms.find((room) => room.kind === 'living')!
  const master = plan.rooms.find((room) => room.id === 'master')!
  for (const room of plan.rooms.filter((item) => item.kind === 'bedroom')) {
    assert(room.window !== null, `${plan.label} ${room.name} 창`)
    assert(room.w * room.d <= living.w * living.d, `${plan.label} 거실이 더 큼`)
    assert(room.w * room.d <= master.w * master.d, `${plan.label} 큰방`)
  }
  assert(living.window !== null, `${plan.label} 거실 창`)
  const covered = plan.rooms.reduce((sum, room) => sum + room.w * room.d, 0)
  assert(covered === 1180 * 775, `${plan.label} 면적 ${covered}`)
  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i]!
      const b = plan.rooms[j]!
      const hit = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.d - 0.5 && b.y < a.y + a.d - 0.5
      assert(!hit, `${plan.label} 겹침`)
    }
  }
}
const turned = generateUnitPlans({ width: 1180, depth: 775, bedrooms: 2, bathrooms: 2, living: true, openKitchen: true, entrance: 'east' })
const turnedEntrance = turned.plans[0]?.rooms.find((room) => room.kind === 'entrance')
assert(turnedEntrance !== undefined && turnedEntrance.x + turnedEntrance.w === 1180, '현관이 동쪽에 붙음')
assert(turnedEntrance?.door?.wall === 'east', '현관 문이 동쪽')
const scaled = generateUnitPlans({ width: 1200, depth: 900, bedrooms: 3, bathrooms: 1, living: true, openKitchen: true, entrance: 'south' })
assert(scaled.plans.length >= 2, scaled.message || '늘린 시안')
const scaledArea = scaled.plans[0]?.rooms.reduce((sum, room) => sum + room.w * room.d, 0) ?? 0
assert(scaledArea === 1200 * 900, `비율 면적 ${scaledArea}`)
assert(scaled.plans.every((plan) => plan.rooms.filter((room) => room.kind === 'bedroom').length === 3), '방 3개')
const tight = generateUnitPlans({ width: 400, depth: 400, bedrooms: 3, bathrooms: 2, living: true, openKitchen: true, entrance: 'south' })
assert(tight.plans.length === 0 && tight.message.length > 0, '좁은 외곽')
assert(unit.plans.length >= 4 && unit.plans.every((plan) => plan.rooms.some((room) => room.name === '거실·주방') && plan.rooms.every((room) => room.kind !== 'kitchen')), '모든 시안이 일체형')
const separated = generateUnitPlans({ width: 1180, depth: 775, bedrooms: 2, bathrooms: 2, living: true, openKitchen: false, entrance: 'south' })
assert(separated.plans.length >= 3 && separated.plans.every((plan) => plan.rooms.some((room) => room.kind === 'kitchen') && plan.rooms.every((room) => room.name !== '거실·주방')), '일체형 제외')
assert(unit.plans.map((plan) => plan.id).join() === separated.plans.map((plan) => plan.id).join(), '같은 배치 종류')
console.log('unit', unit.plans.map((plan) => plan.label).join(', '))

const triangle = measureRoom([
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 0, y: 300 },
])
assert(triangle.triangle !== null, '삼각형')
assert(Math.abs(triangle.triangle!.base - 400) < 1, `밑변 ${triangle.triangle?.base}`)
assert(Math.abs(triangle.triangle!.height - 300) < 1, `높이 ${triangle.triangle?.height}`)
assert(triangle.edges.some((edge) => edge.diagonal && Math.abs(edge.run - 400) < 1 && Math.abs(edge.rise - 300) < 1), '대각 성분')
const bend = triangle.corners.find((corner) => corner.index === 1)
assert(bend !== undefined && Math.abs(bend.angle - 36.87) < 0.2, `꺽인 각도 ${bend?.angle}`)
assert(bend !== undefined && Math.abs(bend.lengthToPoint - 400) < 1, `점까지 ${bend?.lengthToPoint}`)
assert(!triangle.rectangle, '삼각형은 직사각형이 아님')
const sampleDims = measureRoom(rectangleOutline(400, 350))
assert(sampleDims.rectangle, '예시 방은 직사각형')
assert(sampleDims.triangle === null, '직사각형 높이')

console.log('selfCheck ok')
