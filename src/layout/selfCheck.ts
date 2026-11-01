import { blocksWindow, doorClearances, rectsOverlap } from './geometry.ts'
import { generateAll } from './generate.ts'
import { largestEmpty } from './openArea.ts'
import { createSample } from '../sample.ts'
import { backWall, beside } from './geometry.ts'
import type { Scene } from '../types.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const empty = largestEmpty({ width: 400, depth: 350, height: 250 }, [])
assert(empty.area === 140000, `빈 방 면적 ${empty.area}`)

const corner = largestEmpty({ width: 400, depth: 350, height: 250 }, [{ x: 0, y: 0, w: 160, d: 200 }])
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
      assert(!rectsOverlap(result.placed[i]!, result.placed[j]!), `${result.goal} 겹침`)
    }
  }
  const doors = doorClearances(sample.room, sample.openings)
  for (const item of result.placed) {
    for (const door of doors) assert(!rectsOverlap(item, door), `${result.goal} 문 여유 침범 ${item.type}`)
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
assert(backWall(bed, sample.room) !== null, '수면 침대 머리맡')

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
assert(backWall(sofa, living.room) !== null, '소파 등')
assert(beside(sofa, table, 40), '테이블 앞')
const night = livingResults.find((result) => result.goal === 'sleep')!
const sleepBed = night.placed.find((item) => item.type === 'bed')!
const stand = night.placed.find((item) => item.type === 'nightstand')!
assert(beside(sleepBed, stand, 16), '협탁')

console.log('selfCheck ok')
