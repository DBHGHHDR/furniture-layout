import { useState, type ReactNode } from 'react'

export function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="fold">
      <h2>
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {title}
          <svg className="fold-arrow" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.2 4.3 L6 8.1 L9.8 4.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h2>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}
