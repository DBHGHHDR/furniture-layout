import { useMemo, useState } from 'react'
import { Editor } from './components/Editor.tsx'
import { FloorPlan2D, type ShapeTool } from './components/FloorPlan2D.tsx'
import { RoomScene3D } from './components/RoomScene3D.tsx'
import { UnitWorkspace } from './components/UnitWorkspace.tsx'
import { addInventory, loadInventory, writeInventory, type InventoryEntry } from './inventory.ts'
import { generateAll, validate } from './layout/generate.ts'
import { deleteOutlineVertex, insertOutlinePoint, moveOutlineVertex } from './layout/shapeEdit.ts'
import { copyScene, createSample } from './sample.ts'
import type { GoalId, LayoutResult, Scene } from './types.ts'
import { GOAL_LABEL, GOALS, uid } from './types.ts'

function sceneKey(scene: Scene): string {
  return JSON.stringify(scene)
}

const M2_PER_PYEONG = 3.305785

function formatArea(areaCm2: number): string {
  const squareMeters = areaCm2 / 10000
  const pyeong = squareMeters / M2_PER_PYEONG
  return `${squareMeters.toFixed(1)}㎡ · ${pyeong.toFixed(1)}평`
}

export default function App() {
  const [mode, setMode] = useState<'furniture' | 'unit'>('furniture')
  const [draft, setDraft] = useState(createSample)
  const [scene, setScene] = useState(createSample)
  const [goal, setGoal] = useState<GoalId>('sleep')
  const [resetKey, setResetKey] = useState(0)
  const [tool, setTool] = useState<ShapeTool | null>(null)
  const [pinned, setPinned] = useState<LayoutResult[] | null>(null)
  const [entries, setEntries] = useState<InventoryEntry[]>(() => loadInventory())
  const generated = useMemo(() => (pinned ? pinned : generateAll(scene)), [pinned, scene])
  const active = generated.find((result) => result.goal === goal) ?? generated[0] ?? null
  const problem = validate(draft)
  const dirty = sceneKey(draft) !== sceneKey(scene)
  const sameOutline = JSON.stringify(draft.room.outline) === JSON.stringify(scene.room.outline)

  const persist = (next: InventoryEntry[]) => {
    setEntries(next)
    writeInventory(next)
  }

  const openRoom = (next: Scene) => {
    setMode('furniture')
    setDraft(next)
    setScene(copyScene(next))
    setPinned(null)
    setGoal(next.furniture.some((item) => item.type === 'sofa') ? 'living' : 'sleep')
    setTool(null)
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">{mode === 'furniture' ? '한 방의 가구 배치' : '여러 실의 평면'}</p>
          <h1>{mode === 'furniture' ? '최적의 가구 배치' : '평면 레이아웃'}</h1>
          <nav className="mode-nav" aria-label="작업 모드">
            <button type="button" className={mode === 'furniture' ? 'on' : undefined} onClick={() => setMode('furniture')}>가구 배치</button>
            <button type="button" className={mode === 'unit' ? 'on' : undefined} onClick={() => setMode('unit')}>평면 레이아웃</button>
          </nav>
        </div>
        <p className="lede">
          {mode === 'furniture'
            ? '방 모양과 문, 창문, 가구 치수를 넣으면 수면, 공부, 거실, 수납, 가장 넓은 공간 배치를 만들어 2D와 3D로 보여 줍니다.'
            : '올려 둔 1층 도면을 외곽 크기에 맞춰 보여 줍니다. 방 이름은 더블클릭하고, 문과 창문은 끝점이나 왼쪽 수치로 바꿉니다.'}
        </p>
      </header>
      {mode === 'furniture' ? (
        <div className="workspace">
          <Editor
            scene={draft}
            problem={problem}
            dirty={dirty}
            tool={tool}
            onTool={setTool}
            onChange={setDraft}
            onGenerate={() => {
              setScene(copyScene(draft))
              setPinned(null)
            }}
            onReset={() => {
              const sample = createSample()
              setDraft(sample)
              setScene(copyScene(sample))
              setGoal('sleep')
              setPinned(null)
              setTool(null)
            }}
            entries={entries}
            onSaveInventory={(name) => {
              const count = entries.filter((entry) => entry.kind === 'furniture').length + 1
              persist(addInventory(entries, {
                id: uid('layout'),
                name: name || `가구 배치 ${count}`,
                createdAt: Date.now(),
                kind: 'furniture',
                scene: copyScene(scene),
                goal,
                results: generated,
              }))
            }}
            onLoadInventory={(entry) => {
              if (entry.kind !== 'furniture') return
              setDraft(copyScene(entry.scene))
              setScene(copyScene(entry.scene))
              setGoal(entry.goal)
              setPinned(entry.results)
              setTool(null)
            }}
            onDeleteInventory={(id) => persist(entries.filter((entry) => entry.id !== id))}
          />
          <main className="stage">
            <div className="cards" role="tablist" aria-label="배치 목적">
              {GOALS.map((id) => {
                const result = generated.find((item) => item.goal === id)
                const selected = id === goal
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={selected ? 'card on' : 'card'}
                    onClick={() => setGoal(id)}
                  >
                    <span>{GOAL_LABEL[id]}</span>
                    <strong>{result?.ok ? formatArea(result.openAreaCm2) : '배치 불가'}</strong>
                    <small>{id === 'open' ? '가장 큰 빈 직사각형' : '빈 공간'}</small>
                    <p>{result?.message}</p>
                  </button>
                )
              })}
            </div>
            <div className="views">
              <RoomScene3D
                room={scene.room}
                openings={scene.openings}
                placed={active?.ok ? active.placed : []}
                resetKey={resetKey}
                onReset={() => setResetKey((value) => value + 1)}
              />
              <FloorPlan2D
                room={draft.room}
                openings={draft.openings}
                layout={sameOutline ? active : null}
                tool={tool}
                onInsert={(point) => setDraft(insertOutlinePoint(draft, point))}
                onMoveVertex={(index, point) => setDraft((current) => moveOutlineVertex(current, index, point))}
                onDeleteVertex={(index) => setDraft(deleteOutlineVertex(draft, index))}
              />
            </div>
          </main>
        </div>
      ) : (
        <UnitWorkspace entries={entries} onEntries={persist} onOpenRoom={openRoom} />
      )}
      <footer className="site-footer">
        <p>서울과학기술대학교 건축학부 건축공학전공</p>
        <p>박효준 김현호 강다원</p>
        <p>
          문의 이메일 <a href="mailto:rfk9851@gmail.com">rfk9851@gmail.com</a>
        </p>
      </footer>
    </div>
  )
}
