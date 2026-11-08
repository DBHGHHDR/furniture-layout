import { useState } from 'react'
import type { InventoryEntry } from '../inventory.ts'
import { Fold } from './Fold.tsx'

export function InventoryPanel({
  entries,
  onSave,
  onLoad,
  onDelete,
}: {
  entries: InventoryEntry[]
  onSave: (name: string) => void
  onLoad: (entry: InventoryEntry) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <Fold title="인벤토리">
      <div className="add-furniture">
        <input
          value={name}
          placeholder="이름"
          aria-label="인벤토리 이름"
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            onSave(name.trim())
            setName('')
          }}
        >
          저장
        </button>
      </div>
      {entries.length === 0 && <p className="hint">만든 배치를 저장하면 여기에 쌓입니다. 최대 30개까지 이 브라우저에 남습니다.</p>}
      {entries.map((entry) => (
        <article key={entry.id} className="block">
          <header>
            <strong>{entry.name}</strong>
            <button type="button" className="text-button" onClick={() => onDelete(entry.id)}>삭제</button>
          </header>
          <p className="hint">{new Date(entry.createdAt).toLocaleString('ko-KR')}</p>
          <button type="button" onClick={() => onLoad(entry)}>불러오기</button>
        </article>
      ))}
    </Fold>
  )
}
