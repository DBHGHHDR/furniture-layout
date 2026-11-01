import type { LayoutResult, Opening, Placed, Room } from '../types.ts'
import { FURNITURE_LABEL } from '../types.ts'
import type { FurnitureType } from '../types.ts'

const FILL: Record<FurnitureType, string> = {
  bed: '#e6e1d6',
  desk: '#e2c48f',
  chair: '#d7b07a',
  sofa: '#d7dbd6',
  table: '#edd8b6',
  wardrobe: '#f6f3ec',
  bookshelf: '#c9a36b',
  dresser: '#f0e4d0',
  nightstand: '#f7f4ee',
}

type FloorPlanProps = {
  room: Room
  openings: Opening[]
  layout: LayoutResult | null
}

export function FloorPlan2D({ room, openings, layout }: FloorPlanProps) {
  const pad = 42
  const maxW = 680
  const maxH = 520
  const scale = Math.min((maxW - pad * 2) / room.width, (maxH - pad * 2) / room.depth)
  const width = room.width * scale + pad * 2
  const height = room.depth * scale + pad * 2
  const X = (x: number) => pad + x * scale
  const Y = (y: number) => pad + (room.depth - y) * scale
  const placed = layout?.ok ? layout.placed : []

  return (
    <figure className="plan">
      <figcaption>2D 평면도</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="가구 배치 평면도">
        <rect x={X(0)} y={Y(room.depth)} width={room.width * scale} height={room.depth * scale} fill="#f4ecdf" stroke="#1c1c1c" strokeWidth={7} />
        {layout?.openRect && (
          <rect
            x={X(layout.openRect.x)}
            y={Y(layout.openRect.y + layout.openRect.d)}
            width={layout.openRect.w * scale}
            height={layout.openRect.d * scale}
            fill="rgba(33, 92, 73, 0.14)"
            stroke="#215c49"
            strokeDasharray="6 4"
          />
        )}
        {openings.filter((opening) => opening.kind === 'door').map((door) => (
          <DoorMark key={door.id} door={door} room={room} scale={scale} X={X} Y={Y} />
        ))}
        {openings.filter((opening) => opening.kind === 'window').map((win) => (
          <WindowMark key={win.id} win={win} room={room} scale={scale} X={X} Y={Y} />
        ))}
        {placed.map((item) => (
          <FurnitureMark key={item.id} item={item} placed={placed} scale={scale} X={X} Y={Y} />
        ))}
        <text x={width / 2} y={height - 14} textAnchor="middle" className="dim">{room.width}cm</text>
        <text x={16} y={height / 2} textAnchor="middle" className="dim" transform={`rotate(-90 16 ${height / 2})`}>{room.depth}cm</text>
      </svg>
      {layout && !layout.ok && <p className="problem">{layout.message}</p>}
    </figure>
  )
}

function FurnitureMark({
  item,
  placed,
  scale,
  X,
  Y,
}: {
  item: Placed
  placed: Placed[]
  scale: number
  X: (x: number) => number
  Y: (y: number) => number
}) {
  const same = placed.filter((other) => other.type === item.type)
  const name = same.length === 1 ? FURNITURE_LABEL[item.type] : `${FURNITURE_LABEL[item.type]} ${same.findIndex((other) => other.id === item.id) + 1}`
  const edge = backEdge(item)
  return (
    <g>
      <rect
        x={X(item.x)}
        y={Y(item.y + item.d)}
        width={item.w * scale}
        height={item.d * scale}
        fill={FILL[item.type]}
        stroke="#1c1c1c"
        strokeWidth={1.4}
      />
      <line
        x1={X(edge.x1)}
        y1={Y(edge.y1)}
        x2={X(edge.x2)}
        y2={Y(edge.y2)}
        stroke="#215c49"
        strokeWidth={4}
      />
      {item.w * scale > 34 && item.d * scale > 28 && (
        <text x={X(item.x + item.w / 2)} y={Y(item.y + item.d / 2)} textAnchor="middle" className="piece-label">
          <tspan x={X(item.x + item.w / 2)} dy={item.d * scale > 46 ? '-0.35em' : '0.35em'}>{name}</tspan>
          {item.d * scale > 46 && (
            <tspan x={X(item.x + item.w / 2)} dy="1.25em" className="piece-size">
              {Math.round(item.w)}×{Math.round(item.d)}cm
            </tspan>
          )}
        </text>
      )}
    </g>
  )
}

function backEdge(item: Placed): { x1: number; y1: number; x2: number; y2: number } {
  if (item.rotation === 0) return { x1: item.x, y1: item.y + item.d, x2: item.x + item.w, y2: item.y + item.d }
  if (item.rotation === 180) return { x1: item.x, y1: item.y, x2: item.x + item.w, y2: item.y }
  if (item.rotation === 90) return { x1: item.x + item.w, y1: item.y, x2: item.x + item.w, y2: item.y + item.d }
  return { x1: item.x, y1: item.y, x2: item.x, y2: item.y + item.d }
}

function WindowMark({
  win,
  room,
  scale,
  X,
  Y,
}: {
  win: Opening
  room: Room
  scale: number
  X: (x: number) => number
  Y: (y: number) => number
}) {
  const px = 11
  if (win.wall === 'north' || win.wall === 'south') {
    const y = win.wall === 'north' ? Y(room.depth) - px / 2 : Y(0) - px / 2
    return <rect x={X(win.offset)} y={y} width={win.width * scale} height={px} fill="#9ec9e2" stroke="#1c1c1c" strokeWidth={1.2} />
  }
  const x = win.wall === 'west' ? X(0) - px / 2 : X(room.width) - px / 2
  return <rect x={x} y={Y(win.offset + win.width)} width={px} height={win.width * scale} fill="#9ec9e2" stroke="#1c1c1c" strokeWidth={1.2} />
}

function DoorMark({
  door,
  room,
  scale,
  X,
  Y,
}: {
  door: Opening
  room: Room
  scale: number
  X: (x: number) => number
  Y: (y: number) => number
}) {
  const leaf = doorLeaf(door, room)
  const cut = openingRect(door, room, 10)
  const path = swingPath(leaf.hinge, leaf.closed, leaf.open, X, Y)
  return (
    <g>
      <rect x={X(cut.x)} y={Y(cut.y + cut.d)} width={cut.w * scale} height={cut.d * scale} fill="#f4ecdf" />
      <path d={path} fill="none" stroke="#8a6232" strokeWidth={1.2} />
      <line x1={X(leaf.hinge.x)} y1={Y(leaf.hinge.y)} x2={X(leaf.open.x)} y2={Y(leaf.open.y)} stroke="#1c1c1c" strokeWidth={1.6} />
    </g>
  )
}

function openingRect(opening: Opening, room: Room, thickness: number): { x: number; y: number; w: number; d: number } {
  if (opening.wall === 'south') return { x: opening.offset, y: -thickness / 2, w: opening.width, d: thickness }
  if (opening.wall === 'north') return { x: opening.offset, y: room.depth - thickness / 2, w: opening.width, d: thickness }
  if (opening.wall === 'west') return { x: -thickness / 2, y: opening.offset, w: thickness, d: opening.width }
  return { x: room.width - thickness / 2, y: opening.offset, w: thickness, d: opening.width }
}

function doorLeaf(door: Opening, room: Room): {
  hinge: { x: number; y: number }
  closed: { x: number; y: number }
  open: { x: number; y: number }
} {
  const width = door.width
  if (door.wall === 'south') {
    return {
      hinge: { x: door.offset, y: 0 },
      closed: { x: door.offset + width, y: 0 },
      open: { x: door.offset, y: width },
    }
  }
  if (door.wall === 'north') {
    return {
      hinge: { x: door.offset, y: room.depth },
      closed: { x: door.offset + width, y: room.depth },
      open: { x: door.offset, y: room.depth - width },
    }
  }
  if (door.wall === 'west') {
    return {
      hinge: { x: 0, y: door.offset },
      closed: { x: 0, y: door.offset + width },
      open: { x: width, y: door.offset },
    }
  }
  return {
    hinge: { x: room.width, y: door.offset },
    closed: { x: room.width, y: door.offset + width },
    open: { x: room.width - width, y: door.offset },
  }
}

function swingPath(
  hinge: { x: number; y: number },
  closed: { x: number; y: number },
  open: { x: number; y: number },
  X: (x: number) => number,
  Y: (y: number) => number,
): string {
  const a0 = Math.atan2(closed.y - hinge.y, closed.x - hinge.x)
  const a1 = Math.atan2(open.y - hinge.y, open.x - hinge.x)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const radius = Math.hypot(closed.x - hinge.x, closed.y - hinge.y)
  let path = `M ${X(closed.x)} ${Y(closed.y)}`
  for (let step = 1; step <= 12; step++) {
    const angle = a0 + (delta * step) / 12
    path += ` L ${X(hinge.x + Math.cos(angle) * radius)} ${Y(hinge.y + Math.sin(angle) * radius)}`
  }
  return path
}
