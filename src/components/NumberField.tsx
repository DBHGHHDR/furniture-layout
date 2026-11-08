import { useEffect, useState } from 'react'

export function NumberField({
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
