import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { UnitOpening, UnitPlan, UnitRoom, UnitRoomKind } from '../layout/unitPlan.ts'
import type { Wall } from '../types.ts'
import { DoorSwing, WindowStroke } from './planMarks.tsx'
import { usePlanZoom } from './usePlanZoom.ts'

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
  const dragRef = useRef<Drag | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const padLeft = 128
  const padTop = 72
  const padBottom = 148
  const maxW = 760
  const maxH = 560
  const scale = Math.min((maxW - padLeft - 28) / width, (maxH - padTop - padBottom) / depth)
  const viewW = width * scale + padLeft + 28
  const viewH = depth * scale + padTop + padBottom
  const { svgRef, viewBox, zoom, zoomBy } = usePlanZoom(viewW, viewH)
  const X = (x: number) => padLeft + x * scale
  const Y = (y: number) => padTop + (depth - y) * scale

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      const svg = svgRef.current
      if (!drag || !svg) return
      const point = clientToCm(svg, event.clientX, event.clientY, padLeft, padTop, scale, depth)
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
  }, [depth, onOpening, padLeft, padTop, scale])

  const startDrag = (event: ReactPointerEvent, room: UnitRoom, kind: OpeningKind, end: NodeEnd, opening: UnitOpening) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(room)
    dragRef.current = { room, kind, end, opening }
  }

  return (
    <figure className="plan">
      <figcaption>
        배치 시안
        <span className="plan-zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.25)}>축소</button>
          <button type="button" onClick={() => zoomBy(1.25)}>확대</button>
        </span>
      </figcaption>
      <svg ref={svgRef} viewBox={viewBox} role="img" aria-label="방 배치 평면도">
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
                zoom={zoom}
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
                zoom={zoom}
                X={X}
                Y={Y}
                onNode={(event, end) => startDrag(event, room, 'window', end, room.window!)}
              />
            )}
          </g>
        ))}
        <WallDimensions plan={plan} width={width} depth={depth} X={X} Y={Y} />
        <Sunlight width={width} depth={depth} scale={scale} X={X} Y={Y} />
      </svg>
    </figure>
  )
}

function OpeningShape({
  room,
  opening,
  kind,
  zoom,
  X,
  Y,
  onNode,
}: {
  room: UnitRoom
  opening: UnitOpening
  kind: OpeningKind
  zoom: number
  X: (value: number) => number
  Y: (value: number) => number
  onNode: (event: ReactPointerEvent, end: NodeEnd) => void
}) {
  const horizontal = opening.wall === 'north' || opening.wall === 'south'
  const y = opening.wall === 'north' ? room.y + room.d : opening.wall === 'south' ? room.y : room.y + opening.offset
  const x = opening.wall === 'east' ? room.x + room.w : opening.wall === 'west' ? room.x : room.x + opening.offset
  const x2 = horizontal ? x + opening.width : x
  const y2 = horizontal ? y : y + opening.width
  const hinge = { x, y }
  const closed = { x: x2, y: y2 }
  const inward = inwardOf(opening.wall)
  const open = { x: hinge.x + inward.x * opening.width, y: hinge.y + inward.y * opening.width }
  return (
    <>
      {kind === 'window'
        ? <WindowStroke a={hinge} b={closed} X={X} Y={Y} />
        : <DoorSwing hinge={hinge} closed={closed} open={open} X={X} Y={Y} />}
      <OpeningNode cx={X(x)} cy={Y(y)} kind={kind} zoom={zoom} label={kind === 'door' ? '문 시작' : '창문 시작'} onPointerDown={(event) => onNode(event, 'start')} />
      <OpeningNode cx={X(x2)} cy={Y(y2)} kind={kind} zoom={zoom} label={kind === 'door' ? '문 끝' : '창문 끝'} onPointerDown={(event) => onNode(event, 'end')} />
    </>
  )
}

function inwardOf(wall: Wall): { x: number; y: number } {
  if (wall === 'south') return { x: 0, y: 1 }
  if (wall === 'north') return { x: 0, y: -1 }
  if (wall === 'west') return { x: 1, y: 0 }
  return { x: -1, y: 0 }
}

function WallDimensions({
  plan,
  width,
  depth,
  X,
  Y,
}: {
  plan: UnitPlan
  width: number
  depth: number
  X: (value: number) => number
  Y: (value: number) => number
}) {
  const xs = stops([0, width, ...plan.rooms.flatMap((room) => [room.x, room.x + room.w])])
  const ys = stops([0, depth, ...plan.rooms.flatMap((room) => [room.y, room.y + room.d])])
  const south = Y(0)
  const west = X(0)
  return (
    <g className="opening-dim" pointerEvents="none">
      <SegmentChain horizontal from={xs} toSvg={X} face={south} chain={48} overall={92} total={Math.round(width)} />
      <SegmentChain horizontal={false} from={ys} toSvg={Y} face={west} chain={-52} overall={-96} total={Math.round(depth)} />
    </g>
  )
}

function SegmentChain({
  horizontal,
  from,
  toSvg,
  face,
  chain,
  overall,
  total,
}: {
  horizontal: boolean
  from: number[]
  toSvg: (value: number) => number
  face: number
  chain: number
  overall: number
  total: number
}) {
  const points = from.map(toSvg)
  const first = points[0] ?? 0
  const last = points[points.length - 1] ?? first
  return (
    <g>
      {from.slice(0, -1).map((start, index) => {
        const end = from[index + 1]!
        const a = points[index]!
        const b = points[index + 1]!
        return (
          <DimSpan
            key={`${start}-${end}`}
            horizontal={horizontal}
            a={a}
            b={b}
            face={face}
            at={face + chain}
            label={`${Math.round(end - start)}cm`}
          />
        )
      })}
      <DimSpan horizontal={horizontal} a={first} b={last} face={face} at={face + overall} label={`${total}cm`} />
    </g>
  )
}

function DimSpan({
  horizontal,
  a,
  b,
  face,
  at,
  label,
}: {
  horizontal: boolean
  a: number
  b: number
  face: number
  at: number
  label: string
}) {
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  const mid = (start + end) / 2
  const tick = 3.5
  if (horizontal) {
    return (
      <g>
        <line x1={start} y1={face} x2={start} y2={at + Math.sign(at - face) * 5} />
        <line x1={end} y1={face} x2={end} y2={at + Math.sign(at - face) * 5} />
        <line x1={start} y1={at} x2={end} y2={at} />
        <line x1={start - tick} y1={at + tick} x2={start + tick} y2={at - tick} />
        <line x1={end - tick} y1={at + tick} x2={end + tick} y2={at - tick} />
        <text x={mid} y={at - 8} textAnchor="middle" className="dim">{label}</text>
      </g>
    )
  }
  return (
    <g>
      <line x1={face} y1={start} x2={at + Math.sign(at - face) * 5} y2={start} />
      <line x1={face} y1={end} x2={at + Math.sign(at - face) * 5} y2={end} />
      <line x1={at} y1={start} x2={at} y2={end} />
      <line x1={at - tick} y1={start + tick} x2={at + tick} y2={start - tick} />
      <line x1={at - tick} y1={end + tick} x2={at + tick} y2={end - tick} />
      <text x={at - 10} y={mid} textAnchor="middle" dominantBaseline="middle" className="dim" transform={`rotate(-90 ${at - 10} ${mid})`}>{label}</text>
    </g>
  )
}

function stops(values: number[]): number[] {
  const sorted = values.map((value) => Math.round(value)).sort((left, right) => left - right)
  const unique: number[] = []
  for (const value of sorted) {
    if (unique.length === 0 || value - unique[unique.length - 1]! > 1) unique.push(value)
  }
  return unique
}

function OpeningNode({
  cx,
  cy,
  kind,
  zoom,
  label,
  onPointerDown,
}: {
  cx: number
  cy: number
  kind: OpeningKind
  zoom: number
  label: string
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  const radius = 4.5 / zoom
  return (
    <circle
      className={kind === 'window' ? 'opening-node window' : 'opening-node'}
      cx={cx}
      cy={cy}
      r={radius}
      strokeWidth={1.15 / zoom}
      onPointerDown={onPointerDown}
    >
      <title>{label}. 끌어서 위치와 폭을 바꿉니다.</title>
    </circle>
  )
}

function clientToCm(svg: SVGSVGElement, clientX: number, clientY: number, padLeft: number, padTop: number, scale: number, depth: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: (local.x - padLeft) / scale, y: depth - (local.y - padTop) / scale }
}

function Sunlight({
  width,
  depth,
  scale,
  X,
  Y,
}: {
  width: number
  depth: number
  scale: number
  X: (value: number) => number
  Y: (value: number) => number
}) {
  const reach = Math.min(110, depth * 0.16)
  return (
    <g pointerEvents="none">
      <g className="sunlight">
        <rect x={X(0)} y={Y(reach)} width={width * scale} height={reach * scale} />
      </g>
      <g className="compass" transform={`translate(${X(width / 2)} 6)`}>
        <text y="12" textAnchor="middle">N</text>
        <path d="M0 16 L-12 44 L0 50 L12 44 Z" />
        <path d="M0 16 L12 44 L0 50 Z" />
      </g>
    </g>
  )
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
