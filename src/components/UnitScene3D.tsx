import { useLayoutEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { NoToneMapping, type OrthographicCamera } from 'three'
import type { UnitPlan, UnitRoom, UnitRoomKind } from '../layout/unitPlan.ts'
import type { FurnitureType, Wall } from '../types.ts'
import { DEFAULT_SIZE } from '../types.ts'
import { FurnitureModel } from './RoomScene3D.tsx'

const HEIGHT = 2.5
const THICK = 0.12
const DOOR_HEIGHT = 2

const FLOOR: Record<UnitRoomKind, string> = {
  bedroom: '#e6e1d6',
  bathroom: '#d5e4ef',
  living: '#e7efe4',
  entrance: '#f3e6cf',
  corridor: '#f7f4ee',
  kitchen: '#f4ead4',
  utility: '#efe4d4',
  dress: '#e7e1d8',
}

type Hole = {
  a: number
  b: number
  y0: number
  y1: number
  kind: 'door' | 'window'
}

type Interval = {
  from: number
  to: number
  holes: Hole[]
}

type Piece = {
  axis: 'x' | 'z'
  fixed: number
  from: number
  to: number
  hole: Hole | null
}

type PieceModel = {
  type: FurnitureType
  w: number
  d: number
  h: number
  rot: number
  x: number
  z: number
}

function quant(value: number): number {
  return Math.round(value * 1000) / 1000
}

function pushInterval(map: Map<number, Interval[]>, fixed: number, from: number, to: number, holes: Hole[]) {
  const key = quant(fixed)
  const list = map.get(key) ?? []
  list.push({ from, to, holes })
  map.set(key, list)
}

function piecesOf(axis: 'x' | 'z', fixed: number, intervals: Interval[]): Piece[] {
  const cuts = new Set<number>()
  for (const item of intervals) {
    cuts.add(quant(item.from))
    cuts.add(quant(item.to))
    for (const hole of item.holes) {
      cuts.add(quant(Math.max(item.from, hole.a)))
      cuts.add(quant(Math.min(item.to, hole.b)))
    }
  }
  const points = [...cuts].sort((left, right) => left - right)
  const pieces: Piece[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]!
    const to = points[index + 1]!
    if (to - from < 0.015) continue
    const mid = (from + to) / 2
    const covering = intervals.filter((item) => item.from < mid - 0.001 && item.to > mid + 0.001)
    if (covering.length === 0) continue
    const hole = covering.flatMap((item) => item.holes).find((item) => item.a < mid && item.b > mid) ?? null
    pieces.push({ axis, fixed, from, to, hole })
  }
  return pieces
}

function buildPieces(plan: UnitPlan): Piece[] {
  const horizontal = new Map<number, Interval[]>()
  const vertical = new Map<number, Interval[]>()
  for (const room of plan.rooms) {
    const edges: { wall: Wall; axis: 'x' | 'z'; fixed: number; from: number; to: number }[] = [
      { wall: 'south', axis: 'x', fixed: room.y, from: room.x, to: room.x + room.w },
      { wall: 'north', axis: 'x', fixed: room.y + room.d, from: room.x, to: room.x + room.w },
      { wall: 'west', axis: 'z', fixed: room.x, from: room.y, to: room.y + room.d },
      { wall: 'east', axis: 'z', fixed: room.x + room.w, from: room.y, to: room.y + room.d },
    ]
    for (const edge of edges) {
      const holes: Hole[] = []
      const origin = edge.axis === 'x' ? room.x : room.y
      if (room.door?.wall === edge.wall) {
        holes.push({
          a: (origin + room.door.offset) / 100,
          b: (origin + room.door.offset + room.door.width) / 100,
          y0: 0,
          y1: DOOR_HEIGHT,
          kind: 'door',
        })
      }
      if (room.window?.wall === edge.wall) {
        holes.push({
          a: (origin + room.window.offset) / 100,
          b: (origin + room.window.offset + room.window.width) / 100,
          y0: room.window.sill / 100,
          y1: Math.min(HEIGHT, (room.window.sill + room.window.height) / 100),
          kind: 'window',
        })
      }
      const target = edge.axis === 'x' ? horizontal : vertical
      pushInterval(target, edge.fixed / 100, edge.from / 100, edge.to / 100, holes)
    }
  }
  return [
    ...[...horizontal.entries()].flatMap(([fixed, intervals]) => piecesOf('x', fixed, intervals)),
    ...[...vertical.entries()].flatMap(([fixed, intervals]) => piecesOf('z', fixed, intervals)),
  ]
}

function furnitureFor(room: UnitRoom): PieceModel | null {
  const source = room.kind === 'bedroom' ? DEFAULT_SIZE.bed : room.kind === 'living' ? DEFAULT_SIZE.sofa : null
  if (!source) return null
  const type: FurnitureType = room.kind === 'bedroom' ? 'bed' : 'sofa'
  let w = source.width / 100
  let d = source.depth / 100
  const h = source.height / 100
  let rot = 0
  const maxW = Math.max(0.4, room.w / 100 - 0.35)
  const maxD = Math.max(0.4, room.d / 100 - 0.35)
  if (w > maxW || d > maxD) {
    if (d <= maxW && w <= maxD) {
      rot = 90
      const swap = w
      w = d
      d = swap
    } else {
      const scale = Math.min(maxW / w, maxD / d)
      w *= scale
      d *= scale
    }
  }
  return { type, w, d, h, rot, x: (room.x + room.w / 2) / 100, z: (room.y + room.d / 2) / 100 }
}

function Solid({
  axis,
  fixed,
  from,
  to,
  y0,
  y1,
  color,
  glass = false,
}: {
  axis: 'x' | 'z'
  fixed: number
  from: number
  to: number
  y0: number
  y1: number
  color: string
  glass?: boolean
}) {
  const length = to - from
  const height = y1 - y0
  if (length < 0.02 || height < 0.02) return null
  const position: [number, number, number] = axis === 'x'
    ? [(from + to) / 2, (y0 + y1) / 2, fixed]
    : [fixed, (y0 + y1) / 2, (from + to) / 2]
  const depth = glass ? 0.02 : THICK
  const size: [number, number, number] = axis === 'x' ? [length, height, depth] : [depth, height, length]
  return (
    <mesh position={position} castShadow={!glass} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent={glass} opacity={glass ? 0.42 : 1} roughness={glass ? 0.05 : 0.78} />
      {!glass && <Edges color="#1a1a1a" threshold={15} />}
    </mesh>
  )
}

function DoorLeaf({ axis, fixed, from, to }: { axis: 'x' | 'z'; fixed: number; from: number; to: number }) {
  const span = to - from
  const hinge: [number, number, number] = axis === 'x' ? [from, 0, fixed] : [fixed, 0, from]
  return (
    <group position={hinge} rotation={[0, axis === 'x' ? -0.65 : 0.65, 0]}>
      <mesh position={axis === 'x' ? [span / 2, DOOR_HEIGHT / 2, 0.03] : [0.03, DOOR_HEIGHT / 2, span / 2]} castShadow>
        <boxGeometry args={axis === 'x' ? [span * 0.96, DOOR_HEIGHT, 0.04] : [0.04, DOOR_HEIGHT, span * 0.96]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.7} />
        <Edges color="#1a1a1a" threshold={15} />
      </mesh>
    </group>
  )
}

function WallPiece({ piece }: { piece: Piece }) {
  const { axis, fixed, from, to, hole } = piece
  if (!hole) return <Solid axis={axis} fixed={fixed} from={from} to={to} y0={0} y1={HEIGHT} color="#fbfbfa" />
  return (
    <group>
      {hole.y0 > 0.03 && <Solid axis={axis} fixed={fixed} from={from} to={to} y0={0} y1={hole.y0} color="#fbfbfa" />}
      {HEIGHT - hole.y1 > 0.03 && <Solid axis={axis} fixed={fixed} from={from} to={to} y0={hole.y1} y1={HEIGHT} color="#fbfbfa" />}
      {hole.kind === 'window' && <Solid axis={axis} fixed={fixed} from={from} to={to} y0={hole.y0} y1={hole.y1} color="#c5dced" glass />}
      {hole.kind === 'door' && <DoorLeaf axis={axis} fixed={fixed} from={from} to={to} />}
    </group>
  )
}

function CameraRig({
  width,
  depth,
  resetKey,
}: {
  width: number
  depth: number
  resetKey: string
}) {
  const camera = useThree((state) => state.camera) as OrthographicCamera
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls) as {
    target: { set: (x: number, y: number, z: number) => void }
    update: () => void
  } | null

  useLayoutEffect(() => {
    if (size.height < 20) return
    const frame = requestAnimationFrame(() => {
      const cx = width / 200
      const cz = depth / 200
      const span = Math.max(width, depth) / 100
      const dist = span * 0.82
      camera.position.set(cx - dist, span * 1.7, cz - dist)
      camera.near = -80
      camera.far = 80
      camera.zoom = Math.min(size.width, size.height) / (span * 1.55)
      camera.updateProjectionMatrix()
      camera.lookAt(cx, 0.8, cz)
      if (controls) {
        controls.target.set(cx, 0.8, cz)
        controls.update()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [camera, controls, depth, resetKey, size.height, size.width, width])

  return null
}

export function UnitScene3D({
  plan,
  width,
  depth,
  resetKey,
  onReset,
}: {
  plan: UnitPlan
  width: number
  depth: number
  resetKey: string
  onReset: () => void
}) {
  const pieces = useMemo(() => buildPieces(plan), [plan])
  const furniture = useMemo(() => plan.rooms.flatMap((room) => {
    const piece = furnitureFor(room)
    return piece ? [piece] : []
  }), [plan])
  const span = Math.max(width, depth) / 100
  const cx = width / 200
  const cz = depth / 200

  return (
    <figure className="scene">
      <figcaption>
        3D 보기
        <button type="button" onClick={onReset}>기본 각도</button>
      </figcaption>
      <div className="canvas-wrap">
        <Canvas orthographic shadows gl={{ antialias: true, toneMapping: NoToneMapping }} dpr={[1, 1.75]}>
          <color attach="background" args={['#d7e6f1']} />
          <hemisphereLight args={['#ffffff', '#f3e6d0', 1.15]} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[cx + span * 0.45, span * 1.5, cz + span * 0.3]}
            intensity={1.15}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.5}
            shadow-camera-far={span * 5}
            shadow-camera-left={-span}
            shadow-camera-right={span}
            shadow-camera-top={span}
            shadow-camera-bottom={-span}
            shadow-bias={-0.0004}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.04, cz]} receiveShadow>
            <planeGeometry args={[span + 6, span + 6]} />
            <meshStandardMaterial color="#d5e6d8" />
          </mesh>
          {plan.rooms.map((room) => (
            <mesh
              key={room.id}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[(room.x + room.w / 2) / 100, 0.004, (room.y + room.d / 2) / 100]}
              receiveShadow
            >
              <planeGeometry args={[room.w / 100, room.d / 100]} />
              <meshStandardMaterial color={FLOOR[room.kind]} roughness={0.92} />
            </mesh>
          ))}
          {pieces.map((piece) => (
            <WallPiece key={`${piece.axis}-${piece.fixed}-${piece.from}`} piece={piece} />
          ))}
          {furniture.map((item) => (
            <group key={`${item.type}-${item.x}-${item.z}`} position={[item.x, 0, item.z]} rotation={[0, (item.rot * Math.PI) / 180, 0]}>
              <FurnitureModel type={item.type} w={item.w} d={item.d} h={item.h} />
            </group>
          ))}
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minPolarAngle={0.18} maxPolarAngle={Math.PI / 2.05} />
          <CameraRig width={width} depth={depth} resetKey={resetKey} />
        </Canvas>
      </div>
      <p className="hint">드래그로 회전, 우클릭으로 이동, 휠로 확대합니다.</p>
    </figure>
  )
}
