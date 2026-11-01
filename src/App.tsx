import { useMemo, useState } from 'react'
import { Editor } from './components/Editor.tsx'
import { FloorPlan2D } from './components/FloorPlan2D.tsx'
import { RoomScene3D } from './components/RoomScene3D.tsx'
import { generateAll, validate } from './layout/generate.ts'
import { copyScene, createSample } from './sample.ts'
import type { GoalId, Scene } from './types.ts'
import { GOAL_LABEL, GOALS } from './types.ts'

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
  const [draft, setDraft] = useState(createSample)
  const [scene, setScene] = useState(createSample)
  const [goal, setGoal] = useState<GoalId>('sleep')
  const [resetKey, setResetKey] = useState(0)
  const results = useMemo(() => generateAll(scene), [scene])
  const active = results.find((result) => result.goal === goal) ?? results[0] ?? null
  const problem = validate(draft)
  const dirty = sceneKey(draft) !== sceneKey(scene)

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">한 방의 가구 배치</p>
          <h1>최적의 가구 배치</h1>
        </div>
        <p className="lede">
          가로, 세로, 층고와 문, 창문, 가구 치수를 넣으면 수면, 공부, 거실, 수납, 가장 넓은 공간 배치를 만들어 2D와 3D로 보여 줍니다.
        </p>
      </header>
      <div className="workspace">
        <Editor
          scene={draft}
          problem={problem}
          dirty={dirty}
          onChange={setDraft}
          onGenerate={() => setScene(copyScene(draft))}
          onReset={() => {
            const sample = createSample()
            setDraft(sample)
            setScene(copyScene(sample))
            setGoal('sleep')
          }}
        />
        <main className="stage">
          <div className="cards" role="tablist" aria-label="배치 목적">
            {GOALS.map((id) => {
              const result = results.find((item) => item.goal === id)
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
            <FloorPlan2D room={scene.room} openings={scene.openings} layout={active} />
          </div>
        </main>
      </div>
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
