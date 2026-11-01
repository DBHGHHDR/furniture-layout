import { useEffect, useState } from 'react'
import type { FurnitureType, Opening, Scene, Wall } from '../types.ts'
import {
  DEFAULT_SIZE,
  FURNITURE_LABEL,
  FURNITURE_TYPES,
  WALLS,
  WALL_LABEL,
  uid,
} from '../types.ts'

type EditorProps = {
  scene: Scene
  problem: string | null
  dirty: boolean
  onChange: (scene: Scene) => void
  onGenerate: () => void
  onReset: () => void
}

export function Editor({ scene, problem, dirty, onChange, onGenerate, onReset }: EditorProps) {
  const [addType, setAddType] = useState<FurnitureType>('bed')

  const patchRoom = (key: 'width' | 'depth' | 'height', value: number) => {
    onChange({ ...scene, room: { ...scene.room, [key]: value } })
  }

  const patchOpening = (id: string, patch: Partial<Opening>) => {
    onChange({
      ...scene,
      openings: scene.openings.map((opening) => (opening.id === id ? { ...opening, ...patch } : opening)),
    })
  }

  const addOpening = (kind: Opening['kind']) => {
    const opening: Opening =
      kind === 'door'
        ? { id: uid('door'), kind, wall: 'south', offset: 20, width: 90, sill: 0, height: 200 }
        : { id: uid('window'), kind, wall: 'north', offset: 40, width: 140, sill: 90, height: 110 }
    onChange({ ...scene, openings: [...scene.openings, opening] })
  }

  const addFurniture = () => {
    const size = DEFAULT_SIZE[addType]
    onChange({
      ...scene,
      furniture: [...scene.furniture, { id: uid(addType), type: addType, ...size }],
    })
  }

  return (
    <aside className="editor">
      <section>
        <h2>방</h2>
        <div className="fields">
          <NumberField label="가로" suffix="cm" value={scene.room.width} onChange={(value) => patchRoom('width', value)} />
          <NumberField label="세로" suffix="cm" value={scene.room.depth} onChange={(value) => patchRoom('depth', value)} />
          <NumberField label="층고" suffix="cm" value={scene.room.height} onChange={(value) => patchRoom('height', value)} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>문과 창문</h2>
          <div className="row-actions">
            <button type="button" onClick={() => addOpening('door')}>문 추가</button>
            <button type="button" onClick={() => addOpening('window')}>창문 추가</button>
          </div>
        </div>
        {scene.openings.length === 0 && <p className="hint">문이나 창문을 추가하면 그 앞은 비워 둡니다.</p>}
        {scene.openings.map((opening) => (
          <article key={opening.id} className="block">
            <header>
              <strong>{opening.kind === 'door' ? '문' : '창문'}</strong>
              <button type="button" className="text-button" onClick={() => onChange({ ...scene, openings: scene.openings.filter((item) => item.id !== opening.id) })}>
                삭제
              </button>
            </header>
            <label>
              벽
              <select value={opening.wall} onChange={(event) => patchOpening(opening.id, { wall: event.target.value as Wall })}>
                {WALLS.map((wall) => (
                  <option key={wall} value={wall}>{WALL_LABEL[wall]}</option>
                ))}
              </select>
            </label>
            <div className="fields">
              <NumberField label="시작 거리" suffix="cm" value={opening.offset} onChange={(offset) => patchOpening(opening.id, { offset })} />
              <NumberField label="폭" suffix="cm" value={opening.width} onChange={(width) => patchOpening(opening.id, { width })} />
              {opening.kind === 'window' && (
                <>
                  <NumberField label="창대" suffix="cm" value={opening.sill} onChange={(sill) => patchOpening(opening.id, { sill })} />
                  <NumberField label="창문 높이" suffix="cm" value={opening.height} onChange={(height) => patchOpening(opening.id, { height })} />
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>가구</h2>
        </div>
        <div className="add-furniture">
          <select value={addType} onChange={(event) => setAddType(event.target.value as FurnitureType)}>
            {FURNITURE_TYPES.map((type) => (
              <option key={type} value={type}>{FURNITURE_LABEL[type]}</option>
            ))}
          </select>
          <button type="button" onClick={addFurniture}>가구 추가</button>
        </div>
        {scene.furniture.map((item) => (
          <article key={item.id} className="block">
            <header>
              <strong>{FURNITURE_LABEL[item.type]}</strong>
              <button
                type="button"
                className="text-button"
                onClick={() => onChange({ ...scene, furniture: scene.furniture.filter((entry) => entry.id !== item.id) })}
              >
                삭제
              </button>
            </header>
            <div className="fields">
              <NumberField
                label="가로"
                suffix="cm"
                value={item.width}
                onChange={(width) => onChange({
                  ...scene,
                  furniture: scene.furniture.map((entry) => (entry.id === item.id ? { ...entry, width } : entry)),
                })}
              />
              <NumberField
                label="세로"
                suffix="cm"
                value={item.depth}
                onChange={(depth) => onChange({
                  ...scene,
                  furniture: scene.furniture.map((entry) => (entry.id === item.id ? { ...entry, depth } : entry)),
                })}
              />
              <NumberField
                label="높이"
                suffix="cm"
                value={item.height}
                onChange={(height) => onChange({
                  ...scene,
                  furniture: scene.furniture.map((entry) => (entry.id === item.id ? { ...entry, height } : entry)),
                })}
              />
            </div>
          </article>
        ))}
      </section>

      {problem && <p className="problem">{problem}</p>}
      {dirty && !problem && <p className="hint">입력을 바꿨습니다. 배치안 만들기를 누르면 그림에 반영됩니다.</p>}
      <div className="generate-row">
        <button type="button" className="primary" onClick={onGenerate}>배치안 만들기</button>
        <button type="button" onClick={onReset}>예시로 되돌리기</button>
      </div>
    </aside>
  )
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string
  value: number
  suffix: string
  onChange: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  return (
    <label>
      {label}
      <span className="number">
        <input
          inputMode="decimal"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        <em>{suffix}</em>
      </span>
    </label>
  )
}
