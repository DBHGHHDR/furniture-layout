import { useState } from 'react'
import type { FurnitureType, Opening, Point, Scene } from '../types.ts'
import type { InventoryEntry as StoredEntry } from '../inventory.ts'
import {
  DEFAULT_SIZE,
  FURNITURE_LABEL,
  FURNITURE_TYPES,
  uid,
} from '../types.ts'
import { measureRoom } from '../layout/dimensions.ts'
import { edgeTitle, getEdge } from '../layout/polygon.ts'
import { resizeRoom } from '../layout/shapeEdit.ts'
import type { ShapeTool } from './FloorPlan2D.tsx'
import { Fold } from './Fold.tsx'
import { InventoryPanel } from './InventoryPanel.tsx'
import { NumberField } from './NumberField.tsx'

type EditorProps = {
  scene: Scene
  problem: string | null
  dirty: boolean
  tool: ShapeTool | null
  onTool: (tool: ShapeTool | null) => void
  onChange: (scene: Scene) => void
  onGenerate: () => void
  onReset: () => void
  entries: StoredEntry[]
  onSaveInventory: (name: string) => void
  onLoadInventory: (entry: StoredEntry) => void
  onDeleteInventory: (id: string) => void
}

export function Editor({
  scene,
  problem,
  dirty,
  tool,
  onTool,
  onChange,
  onGenerate,
  onReset,
  entries,
  onSaveInventory,
  onLoadInventory,
  onDeleteInventory,
}: EditorProps) {
  const [addType, setAddType] = useState<FurnitureType>('bed')
  const dims = measureRoom(scene.room.outline)

  const patchOpening = (id: string, patch: Partial<Opening>) => {
    onChange({
      ...scene,
      openings: scene.openings.map((opening) => (opening.id === id ? { ...opening, ...patch } : opening)),
    })
  }

  const addOpening = (kind: Opening['kind']) => {
    const opening: Opening =
      kind === 'door'
        ? { id: uid('door'), kind, edge: 0, offset: 20, width: 90, sill: 0, height: 200 }
        : { id: uid('window'), kind, edge: 0, offset: 40, width: 120, sill: 90, height: 110 }
    onChange({ ...scene, openings: [...scene.openings, opening] })
  }

  const addFurniture = () => {
    const size = DEFAULT_SIZE[addType]
    onChange({
      ...scene,
      furniture: [...scene.furniture, { id: uid(addType), type: addType, ...size }],
    })
  }

  const moveVertex = (index: number, point: Point) => {
    const outline = scene.room.outline.map((vertex, vertexIndex) => (vertexIndex === index ? point : vertex))
    onChange({ ...scene, room: { ...scene.room, outline } })
  }

  const toggle = (next: ShapeTool) => onTool(tool === next ? null : next)

  return (
    <aside className="editor">
      <Fold title="방 모양">
        <p className="hint">변 길이는 평면도 바깥에 두고, 꺾인 꼭짓점에는 각도를 표시합니다. 방 크기는 레퍼런스에서 가져온 집이나 방도 가로와 세로로 바꿉니다.</p>
        <div className="fields">
          <NumberField label="방 가로" suffix="cm" value={Math.round(dims.width)} onChange={(width) => onChange(resizeRoom(scene, width, dims.depth))} />
          <NumberField label="방 세로" suffix="cm" value={Math.round(dims.depth)} onChange={(depth) => onChange(resizeRoom(scene, dims.width, depth))} />
        </div>
        <div className="row-actions">
          <button type="button" className={tool === 'add' ? 'on' : undefined} onClick={() => toggle('add')}>점 추가</button>
          <button type="button" className={tool === 'move' ? 'on' : undefined} onClick={() => toggle('move')}>점 이동</button>
          <button type="button" className={tool === 'delete' ? 'on' : undefined} onClick={() => toggle('delete')}>점 삭제</button>
        </div>
        <NumberField label="층고" suffix="cm" value={scene.room.height} onChange={(height) => onChange({ ...scene, room: { ...scene.room, height } })} />
        {scene.room.outline.map((point, index) => (
          <div key={`vertex-${index}`} className="fields">
            <NumberField label={`점 ${index + 1} 가로`} suffix="cm" value={point.x} onChange={(x) => moveVertex(index, { x, y: point.y })} />
            <NumberField label={`점 ${index + 1} 세로`} suffix="cm" value={point.y} onChange={(y) => moveVertex(index, { x: point.x, y })} />
          </div>
        ))}
        <ul className="dim-list">
          <li>면적 {(dims.area / 10000).toFixed(1)}㎡ · 전체 가로 {Math.round(dims.width)}cm · 세로 {Math.round(dims.depth)}cm</li>
          {dims.edges.map((edge) => (
            <li key={edge.index}>변 {edge.index + 1} {edge.title} {Math.round(edge.length)}cm</li>
          ))}
          {dims.corners.filter((corner) => corner.bent).map((corner) => (
            <li key={`corner-${corner.index}`}>
              점 {corner.index + 1} 각도 {Math.round(corner.angle)}° · 점까지 {Math.round(corner.lengthToPoint)}cm
            </li>
          ))}
          {dims.triangle && (
            <li>삼각형 높이 {Math.round(dims.triangle.height)}cm · 밑변 {Math.round(dims.triangle.base)}cm</li>
          )}
        </ul>
      </Fold>

      <Fold title="문과 창문">
        <div className="row-actions">
          <button type="button" onClick={() => addOpening('door')}>문 추가</button>
          <button type="button" onClick={() => addOpening('window')}>창문 추가</button>
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
              변
              <select value={opening.edge} onChange={(event) => patchOpening(opening.id, { edge: Number(event.target.value) })}>
                {scene.room.outline.map((_, index) => {
                  const edge = getEdge(scene.room.outline, index)
                  return (
                    <option key={index} value={index}>
                      변 {index + 1} · {edgeTitle(scene.room.outline, index)} · {Math.round(edge?.length ?? 0)}cm
                    </option>
                  )
                })}
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
      </Fold>

      <Fold title="가구">
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
      </Fold>

      {problem && <p className="problem">{problem}</p>}
      {dirty && !problem && <p className="hint">입력을 바꿨습니다. 배치안 만들기를 누르면 그림에 반영됩니다.</p>}
      <div className="generate-row">
        <button type="button" className="primary" onClick={onGenerate}>배치안 만들기</button>
        <button type="button" onClick={onReset}>예시로 되돌리기</button>
      </div>
      <InventoryPanel
        entries={entries.filter((entry) => entry.kind === 'furniture')}
        onSave={onSaveInventory}
        onLoad={onLoadInventory}
        onDelete={onDeleteInventory}
      />
    </aside>
  )
}
