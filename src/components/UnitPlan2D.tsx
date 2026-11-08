import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { UnitOpening, UnitPlan, UnitRoom, UnitRoomKind } from '../layout/unitPlan.ts'
import type { Wall } from '../types.ts'

const FILL: Record<UnitRoomKind, string> = {
  bedroom: '#e6e1d6',
  bathroom: '#d5e4ef',
  living: '#e7efe4',
  entrance: '#f3e6cf',
  corridor: '#f7f4ee',
  kitchen: '#f4ead4',
  utility: '#efe4d4',
  dress: '#e7e1d8',
}

type OpeningKind = 'door' | 'window'
type NodeEnd = 'start' | 'end'

type Drag = {
  room: UnitRoom
  kind: OpeningKind
  end: NodeEnd
  opening: UnitOpening
}

export function UnitPlan2D({
  plan,
  width,
  depth,
  selectedId,
  onSelect,
  onRename,
  onOpening,
}: {
  plan: UnitPlan
  width: number
  depth: number
  selectedId: string | null
  onSelect: (room: UnitRoom) => void
  onRename: (roomId: string, name: string) => void
  onOpening: (roomId: string, kind: OpeningKind, opening: UnitOpening) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const pad = 88
  const maxW = 760
  const maxH = 560
  const scale = Math.min((maxW - pad * 2) / width, (maxH - pad * 2) / depth)
  const viewW = width * scale + pad * 2
  const viewH = depth * scale + pad * 2
  const X = (x: number) => pad + x * scale
  const Y = (y: number) => pad + (depth - y) * scale

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      const svg = svgRef.current
      if (!drag || !svg) return
      const point = clientToCm(svg, event.clientX, event.clientY, pad, scale, depth)
      if (!point) return
      const hit = closestWall(drag.room, point.x, point.y)
      const minWidth = drag.kind === 'door' ? 70 : 80
      onOpening(drag.room.id, drag.kind, moveNode(drag.opening, drag.end, hit.wall, hit.t, hit.span, minWidth))
    }
    const up = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [depth, onOpening, pad, scale])

  const startDrag = (event: ReactPointerEvent, room: UnitRoom, kind: OpeningKind, end: NodeEnd, opening: UnitOpening) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(room)
    dragRef.current = { room, kind, end, opening }
  }

  return (
    <figure className="plan">
      <figcaption>레퍼런스 평면</figcaption>
      <svg ref={svgRef} viewBox={`0 0 ${viewW} ${viewH}`} role="img" aria-label="방 배치 평면도">
        <rect x={X(0)} y={Y(depth)} width={width * scale} height={depth * scale} fill="#f4ecdf" stroke="#1c1c1c" strokeWidth={7} />
        {plan.rooms.map((room) => (
          <g key={room.id} onClick={() => onSelect(room)} style={{ cursor: 'pointer' }}>
            <rect
              x={X(room.x)}
              y={Y(room.y + room.d)}
              width={room.w * scale}
              height={room.d * scale}
              fill={FILL[room.kind]}
              stroke={room.id === selectedId ? '#215c49' : '#1c1c1c'}
              strokeWidth={room.id === selectedId ? 3 : 1.2}
            />
            {editing?.id === room.id ? (
              <foreignObject x={X(room.x + room.w / 2) - 58} y={Y(room.y + room.d / 2) - 16} width={116} height={32}>
                <input
                  className="plan-name-input"
                  aria-label={`${room.name} 이름 편집`}
                  value={editing.value}
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setEditing({ id: room.id, value: event.target.value })}
                  onBlur={(event) => {
                    const next = event.currentTarget.value.trim()
                    onRename(room.id, next || room.name)
                    setEditing(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') setEditing(null)
                  }}
                />
              </foreignObject>
            ) : room.w * scale > 46 && room.d * scale > 28 ? (
              <text
                x={X(room.x + room.w / 2)}
                y={Y(room.y + room.d / 2)}
                textAnchor="middle"
                className="piece-label"
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onSelect(room)
                  setEditing({ id: room.id, value: room.name })
                }}
              >
                <title>더블클릭하면 이름을 바꿉니다.</title>
                <tspan x={X(room.x + room.w / 2)} dy="-0.35em">{room.name}</tspan>
                <tspan x={X(room.x + room.w / 2)} dy="1.25em" className="piece-size">{(room.w * room.d / 10000).toFixed(1)}㎡</tspan>
              </text>
            ) : null}
          </g>
        ))}
        {plan.rooms.map((room) => (
          <g key={`${room.id}-openings`}>
            {room.door && (
              <OpeningShape
                room={room}
                opening={room.door}
                kind="door"
                heightCm={null}
                envelopeWidth={width}
                envelopeDepth={depth}
                X={X}
                Y={Y}
                onNode={(event, end) => startDrag(event, room, 'door', end, room.door!)}
              />
            )}
            {room.window && (
              <OpeningShape
                room={room}
                opening={room.window}
                kind="window"
                heightCm={room.window.height}
                envelopeWidth={width}
                envelopeDepth={depth}
                X={X}
                Y={Y}
                onNode={(event, end) => startDrag(event, room, 'window', end, room.window!)}
              />
            )}
          </g>
        ))}
        <text x={viewW / 2} y={viewH - 14} textAnchor="middle" className="dim">{Math.round(width)}cm</text>
        <text x={16} y={viewH / 2} textAnchor="middle" className="dim" transform={`rotate(-90 16 ${viewH / 2})`}>{Math.round(depth)}cm</text>
      </svg>
    </figure>
  )
}

function OpeningShape({
  room,
  opening,
  kind,
  heightCm,
  envelopeWidth,
  envelopeDepth,
  X,
  Y,
  onNode,
}: {
  room: UnitRoom
  opening: UnitOpening
  kind: OpeningKind
  heightCm: number | null
  envelopeWidth: number
  envelopeDepth: number
  X: (value: number) => number
  Y: (value: number) => number
  onNode: (event: ReactPointerEvent, end: NodeEnd) => void
}) {
  const horizontal = opening.wall === 'north' || opening.wall === 'south'
  const y = opening.wall === 'north' ? room.y + room.d : opening.wall === 'south' ? room.y : room.y + opening.offset
  const x = opening.wall === 'east' ? room.x + room.w : opening.wall === 'west' ? room.x : room.x + opening.offset
  const x2 = horizontal ? x + opening.width : x
  const y2 = horizontal ? y : y + opening.width
  const stroke = kind === 'window' ? '#9ec9e2' : '#f4ecdf'
  const exterior = opening.wall === 'south'
    ? room.y <= 0.8
    : opening.wall === 'north'
      ? room.y + room.d >= envelopeDepth - 0.8
      : opening.wall === 'west'
        ? room.x <= 0.8
        : room.x + room.w >= envelopeWidth - 0.8
  return (
    <>
      <line x1={X(x)} y1={Y(y)} x2={X(x2)} y2={Y(y2)} stroke={stroke} strokeWidth={8} />
      {kind === 'window' && (
        <OpeningDimension x={x} y={y} x2={x2} y2={y2} wall={opening.wall} widthCm={opening.width} heightCm={heightCm} exterior={exterior} X={X} Y={Y} />
      )}
      <OpeningNode cx={X(x)} cy={Y(y)} kind={kind} label={kind === 'door' ? '문 시작' : '창문 시작'} onPointerDown={(event) => onNode(event, 'start')} />
      <OpeningNode cx={X(x2)} cy={Y(y2)} kind={kind} label={kind === 'door' ? '문 끝' : '창문 끝'} onPointerDown={(event) => onNode(event, 'end')} />
    </>
  )
}

function OpeningDimension({
  x,
  y,
  x2,
  y2,
  wall,
  widthCm,
  heightCm,
  exterior,
  X,
  Y,
}: {
  x: number
  y: number
  x2: number
  y2: number
  wall: Wall
  widthCm: number
  heightCm: number | null
  exterior: boolean
  X: (value: number) => number
  Y: (value: number) => number
}) {
  const x1 = X(x)
  const y1 = Y(y)
  const xe = X(x2)
  const ye = Y(y2)
  const nx = wall === 'west' ? -1 : wall === 'east' ? 1 : 0
  const ny = wall === 'south' ? 1 : wall === 'north' ? -1 : 0
  const dir = exterior ? 1 : -1
  const clear = 14
  const gap = exterior ? 46 : 36
  const past = 5
  const ox = nx * dir * gap
  const oy = ny * dir * gap
  const ax = x1 + ox
  const ay = y1 + oy
  const bx = xe + ox
  const by = ye + oy
  const mx = (ax + bx) / 2 + nx * dir * 8
  const my = (ay + by) / 2 + ny * dir * 8
  const label = heightCm === null ? `${Math.round(widthCm)}cm` : `${Math.round(widthCm)}×${Math.round(heightCm)}`
  const vertical = nx !== 0
  return (
    <g className="opening-dim">
      <line x1={x1 + nx * dir * clear} y1={y1 + ny * dir * clear} x2={ax + nx * dir * past} y2={ay + ny * dir * past} />
      <line x1={xe + nx * dir * clear} y1={ye + ny * dir * clear} x2={bx + nx * dir * past} y2={by + ny * dir * past} />
      <line x1={ax} y1={ay} x2={bx} y2={by} />
      <line x1={ax - 3.5} y1={ay + 3.5} x2={ax + 3.5} y2={ay - 3.5} />
      <line x1={bx - 3.5} y1={by + 3.5} x2={bx + 3.5} y2={by - 3.5} />
      <text
        x={mx}
        y={my}
        textAnchor="middle"
        dominantBaseline="middle"
        className="dim opening-dim-text"
        transform={vertical ? `rotate(-90 ${mx} ${my})` : undefined}
      >
        {label}
      </text>
    </g>
  )
}

function OpeningNode({
  cx,
  cy,
  kind,
  label,
  onPointerDown,
}: {
  cx: number
  cy: number
  kind: OpeningKind
  label: string
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  return (
    <circle className={kind === 'window' ? 'opening-node window' : 'opening-node'} cx={cx} cy={cy} r={6} onPointerDown={onPointerDown}>
      <title>{label}. 끌어서 위치와 폭을 바꿉니다.</title>
    </circle>
  )
}

function clientToCm(svg: SVGSVGElement, clientX: number, clientY: number, pad: number, scale: number, depth: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: (local.x - pad) / scale, y: depth - (local.y - pad) / scale }
}

function closestWall(room: UnitRoom, x: number, y: number): { wall: Wall; t: number; span: number } {
  const sides = [
    { wall: 'south' as const, dist: Math.abs(y - room.y), t: x - room.x, span: room.w },
    { wall: 'north' as const, dist: Math.abs(y - (room.y + room.d)), t: x - room.x, span: room.w },
    { wall: 'west' as const, dist: Math.abs(x - room.x), t: y - room.y, span: room.d },
    { wall: 'east' as const, dist: Math.abs(x - (room.x + room.w)), t: y - room.y, span: room.d },
  ].sort((a, b) => a.dist - b.dist)
  const best = sides[0]!
  return { wall: best.wall, t: Math.max(0, Math.min(best.span, best.t)), span: best.span }
}

function moveNode(opening: UnitOpening, end: NodeEnd, wall: Wall, t: number, span: number, minWidth: number): UnitOpening {
  const width = Math.min(opening.width, Math.max(minWidth, span - 4))
  if (opening.wall !== wall) {
    if (end === 'end') {
      const endAt = Math.max(minWidth, Math.min(span, t))
      const nextWidth = Math.min(width, endAt)
      return { ...opening, wall, offset: endAt - nextWidth, width: nextWidth }
    }
    const offset = Math.max(0, Math.min(t, span - minWidth))
    return { ...opening, wall, offset, width: Math.min(width, span - offset) }
  }
  if (end === 'start') {
    const endAt = opening.offset + opening.width
    const offset = Math.max(0, Math.min(t, endAt - minWidth))
    return { ...opening, wall, offset, width: Math.max(minWidth, endAt - offset) }
  }
  return { ...opening, wall, width: Math.max(minWidth, Math.min(span - opening.offset, t - opening.offset)) }
}
