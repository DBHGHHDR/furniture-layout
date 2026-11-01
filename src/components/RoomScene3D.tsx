import { useLayoutEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { NoToneMapping, type OrthographicCamera } from 'three'
import type { FurnitureType, Opening, Placed, Room, Rotation } from '../types.ts'

type SceneProps = {
  room: Room
  openings: Opening[]
  placed: Placed[]
  resetKey: number
  onReset: () => void
}

const WALL = '#fbfbfa'
const FRAME = '#fbfbfa'
const THICK = 12

export function RoomScene3D({ room, openings, placed, resetKey, onReset }: SceneProps) {
  return (
    <figure className="scene">
      <figcaption>
        3D 보기
        <button type="button" onClick={onReset}>기본 각도</button>
      </figcaption>
      <div className="canvas-wrap">
        <Canvas orthographic shadows gl={{ antialias: true, toneMapping: NoToneMapping }} dpr={[1, 1.75]}>
          <color attach="background" args={['#d7e6f1']} />
          <hemisphereLight args={['#ffffff', '#f3e6d0', 1.2]} />
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[6, 11, 4]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.5}
            shadow-camera-far={40}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
            shadow-bias={-0.0006}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 200, -0.08, room.depth / 200]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#d5e6d8" />
          </mesh>
          <mesh position={[room.width / 200, -0.03, room.depth / 200]} receiveShadow>
            <boxGeometry args={[room.width / 100 + 0.28, 0.06, room.depth / 100 + 0.28]} />
            <meshStandardMaterial color="#e8d5b6" roughness={0.92} />
          </mesh>
          <Walls room={room} openings={openings} />
          <Doors room={room} openings={openings} />
          {placed.map((item) => (
            <FurniturePiece key={item.id} item={item} />
          ))}
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minPolarAngle={0.18} maxPolarAngle={Math.PI / 2.05} />
          <CameraRig room={room} resetKey={resetKey} />
        </Canvas>
      </div>
      <p className="hint">드래그로 회전, 우클릭으로 이동, 휠로 확대합니다.</p>
    </figure>
  )
}

function CameraRig({ room, resetKey }: { room: Room; resetKey: number }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls) as {
    target: { set: (x: number, y: number, z: number) => void }
    update: () => void
  } | null

  useLayoutEffect(() => {
    if (size.height < 20) return
    const frame = requestAnimationFrame(() => {
    const cx = room.width / 200
    const cy = room.height / 500
    const cz = room.depth / 200
    const span = Math.max(room.width, room.depth) / 100
    const dist = span * 0.78
    camera.position.set(cx - dist, span * 1.85, cz - dist)
    camera.near = -80
    camera.far = 80
    camera.zoom = Math.min(size.width, size.height) / (span * 1.72)
    camera.updateProjectionMatrix()
    camera.lookAt(cx, cy, cz)
    if (controls) {
      controls.target.set(cx, cy, cz)
      controls.update()
    }
    })
    return () => cancelAnimationFrame(frame)
  }, [camera, controls, resetKey, room.depth, room.height, room.width, size.height, size.width])

  return null
}

type Spec = {
  key: string
  position: [number, number, number]
  size: [number, number, number]
  color: string
  glass?: boolean
}

function Walls({ room, openings }: { room: Room; openings: Opening[] }) {
  const specs = buildWalls(room, openings)
  return (
    <group>
      {specs.map((spec) => (
        <mesh key={spec.key} position={spec.position} castShadow={!spec.glass} receiveShadow>
          <boxGeometry args={spec.size} />
          <meshStandardMaterial
            color={spec.color}
            transparent={Boolean(spec.glass)}
            opacity={spec.glass ? 0.38 : 1}
            roughness={spec.glass ? 0.05 : 0.78}
          />
          {!spec.glass && <Edges color="#1a1a1a" threshold={15} />}
        </mesh>
      ))}
    </group>
  )
}

function buildWalls(room: Room, openings: Opening[]): Spec[] {
  const specs: Spec[] = []
  const south = gaps(room, openings, 'south')
  const north = gaps(room, openings, 'north')
  const west = gaps(room, openings, 'west')
  const east = gaps(room, openings, 'east')
  fillX(specs, 'south', -THICK, 0, -THICK, room.width + THICK, room.height, south)
  fillX(specs, 'north', room.depth, room.depth + THICK, -THICK, room.width + THICK, room.height, north)
  fillZ(specs, 'west', -THICK, 0, 0.4, room.depth - 0.4, room.height, west)
  fillZ(specs, 'east', room.width, room.width + THICK, 0.4, room.depth - 0.4, room.height, east)
  return specs
}

type Gap = { start: number; end: number; bottom: number; top: number; kind: 'door' | 'window' }

function gaps(room: Room, openings: Opening[], wall: Opening['wall']): Gap[] {
  return openings
    .filter((opening) => opening.wall === wall)
    .map((opening) => ({
      start: opening.offset,
      end: opening.offset + opening.width,
      bottom: opening.kind === 'door' ? 0 : opening.sill,
      top: opening.kind === 'door' ? Math.min(200, room.height) : opening.sill + opening.height,
      kind: opening.kind,
    }))
    .sort((a, b) => a.start - b.start)
}

function fillX(
  out: Spec[],
  prefix: string,
  z0: number,
  z1: number,
  xMin: number,
  xMax: number,
  height: number,
  holes: Gap[],
) {
  let cursor = xMin
  holes.forEach((gap, index) => {
    addBox(out, `${prefix}-pier-${index}`, cursor, 0, z0, gap.start, height, z1, WALL)
    if (gap.bottom > 0.4) addBox(out, `${prefix}-sill-${index}`, gap.start, 0, z0, gap.end, gap.bottom, z1, WALL)
    if (height - gap.top > 0.4) addBox(out, `${prefix}-head-${index}`, gap.start, gap.top, z0, gap.end, height, z1, WALL)
    if (gap.kind === 'window') addWindow(out, `${prefix}-win-${index}`, gap, z0, z1, 'x')
    cursor = gap.end
  })
  addBox(out, `${prefix}-end`, cursor, 0, z0, xMax, height, z1, WALL)
}

function fillZ(
  out: Spec[],
  prefix: string,
  x0: number,
  x1: number,
  zMin: number,
  zMax: number,
  height: number,
  holes: Gap[],
) {
  let cursor = zMin
  holes.forEach((gap, index) => {
    addBox(out, `${prefix}-pier-${index}`, x0, 0, cursor, x1, height, gap.start, WALL)
    if (gap.bottom > 0.4) addBox(out, `${prefix}-sill-${index}`, x0, 0, gap.start, x1, gap.bottom, gap.end, WALL)
    if (height - gap.top > 0.4) addBox(out, `${prefix}-head-${index}`, x0, gap.top, gap.start, x1, height, gap.end, WALL)
    if (gap.kind === 'window') addWindow(out, `${prefix}-win-${index}`, gap, x0, x1, 'z')
    cursor = gap.end
  })
  addBox(out, `${prefix}-end`, x0, 0, cursor, x1, height, zMax, WALL)
}

function addWindow(out: Spec[], key: string, gap: Gap, a0: number, a1: number, along: 'x' | 'z') {
  const inset = 3.5
  const mid = (a0 + a1) / 2
  const glass = 1.6
  const bar = (part: string, u0: number, v0: number, u1: number, v1: number) => {
    if (along === 'x') addBox(out, `${key}-${part}`, u0, v0, mid - 2, u1, v1, mid + 2, FRAME)
    else addBox(out, `${key}-${part}`, mid - 2, v0, u0, mid + 2, v1, u1, FRAME)
  }
  bar('left', gap.start, gap.bottom, gap.start + inset, gap.top)
  bar('right', gap.end - inset, gap.bottom, gap.end, gap.top)
  bar('bottom', gap.start + inset, gap.bottom, gap.end - inset, gap.bottom + inset)
  bar('top', gap.start + inset, gap.top - inset, gap.end - inset, gap.top)
  const center = (gap.start + gap.end) / 2
  bar('mullion', center - 1.1, gap.bottom + inset, center + 1.1, gap.top - inset)
  if (along === 'x') {
    addBox(out, `${key}-glass`, gap.start + inset, gap.bottom + inset, mid - glass / 2, gap.end - inset, gap.top - inset, mid + glass / 2, '#c5dced', true)
  } else {
    addBox(out, `${key}-glass`, mid - glass / 2, gap.bottom + inset, gap.start + inset, mid + glass / 2, gap.top - inset, gap.end - inset, '#c5dced', true)
  }
}

function addBox(
  out: Spec[],
  key: string,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: string,
  glass = false,
) {
  const sx = x1 - x0
  const sy = y1 - y0
  const sz = z1 - z0
  if (sx < 0.3 || sy < 0.3 || sz < 0.3) return
  out.push({
    key,
    position: [((x0 + x1) / 2) / 100, ((y0 + y1) / 2) / 100, ((z0 + z1) / 2) / 100],
    size: [sx / 100, sy / 100, sz / 100],
    color,
    glass,
  })
}

function Doors({ room, openings }: { room: Room; openings: Opening[] }) {
  return (
    <group>
      {openings.filter((opening) => opening.kind === 'door').map((door) => (
        <DoorLeaf key={door.id} room={room} door={door} />
      ))}
    </group>
  )
}

function DoorLeaf({ room, door }: { room: Room; door: Opening }) {
  const height = Math.min(200, room.height) / 100
  const width = door.width / 100
  const hingeX = door.wall === 'east' ? room.width / 100 : door.wall === 'west' ? 0 : door.offset / 100
  const hingeZ = door.wall === 'north' ? room.depth / 100 : door.wall === 'south' ? 0 : door.offset / 100
  const rotation =
    door.wall === 'south' ? -0.55
      : door.wall === 'north' ? 0.55
        : door.wall === 'west' ? -Math.PI / 2 + 0.5
          : -Math.PI / 2 - 0.5
  return (
    <group position={[hingeX, 0, hingeZ]} rotation={[0, rotation, 0]}>
      <mesh position={[width / 2, height / 2, 0.02]} castShadow>
        <boxGeometry args={[width, height, 0.04]} />
        <meshStandardMaterial color="#fbfbfa" roughness={0.7} />
        <Edges color="#1a1a1a" threshold={15} />
      </mesh>
    </group>
  )
}

function FurniturePiece({ item }: { item: Placed }) {
  return (
    <group
      position={[(item.x + item.w / 2) / 100, 0, (item.y + item.d / 2) / 100]}
      rotation={[0, rotationY(item.rotation), 0]}
    >
      <Model type={item.type} w={item.nominalWidth / 100} d={item.nominalDepth / 100} h={item.h / 100} />
    </group>
  )
}

function rotationY(rotation: Rotation): number {
  if (rotation === 90) return Math.PI / 2
  if (rotation === 180) return Math.PI
  if (rotation === 270) return -Math.PI / 2
  return 0
}

function Model({ type, w, d, h }: { type: FurnitureType; w: number; d: number; h: number }) {
  if (type === 'bed') return <Bed w={w} d={d} h={h} />
  if (type === 'desk') return <Desk w={w} d={d} h={h} />
  if (type === 'chair') return <Chair w={w} d={d} h={h} />
  if (type === 'sofa') return <Sofa w={w} d={d} h={h} />
  if (type === 'table') return <Table w={w} d={d} h={h} />
  if (type === 'wardrobe') return <Cabinet w={w} d={d} h={h} doors />
  if (type === 'bookshelf') return <Shelf w={w} d={d} h={h} />
  if (type === 'dresser') return <Cabinet w={w} d={d} h={h} doors={false} />
  return <Cabinet w={w} d={d} h={Math.max(h, 0.2)} doors={false} />
}

function Box({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.74} />
      <Edges color="#1a1a1a" threshold={15} />
    </mesh>
  )
}

function Bed({ w, d, h }: { w: number; d: number; h: number }) {
  const mattress = Math.min(h * 0.72, 0.38)
  return (
    <group>
      <Box position={[0, mattress / 2, -d * 0.03]} size={[w * 0.96, mattress, d * 0.86]} color="#e7e4dc" />
      <Box position={[0, h / 2, d / 2 - 0.035]} size={[w, h, 0.07]} color="#f7f7f5" />
      <Box position={[0, mattress + 0.04, d * 0.28]} size={[w * 0.42, 0.07, d * 0.16]} color="#f4f7fb" />
    </group>
  )
}

function Desk({ w, d, h }: { w: number; d: number; h: number }) {
  const top = 0.04
  return (
    <group>
      <Box position={[0, h - top / 2, 0]} size={[w, top, d]} color="#e2c48f" />
      <Leg x={-w / 2 + 0.04} z={-d / 2 + 0.04} h={h - top} />
      <Leg x={w / 2 - 0.04} z={-d / 2 + 0.04} h={h - top} />
      <Leg x={-w / 2 + 0.04} z={d / 2 - 0.04} h={h - top} />
      <Leg x={w / 2 - 0.04} z={d / 2 - 0.04} h={h - top} />
    </group>
  )
}

function Leg({ x, z, h }: { x: number; z: number; h: number }) {
  return <Box position={[x, h / 2, z]} size={[0.04, h, 0.04]} color="#c9a36b" />
}

function Chair({ w, d, h }: { w: number; d: number; h: number }) {
  const seat = Math.min(h * 0.48, 0.46)
  return (
    <group>
      <Box position={[0, seat, 0]} size={[w * 0.86, 0.05, d * 0.86]} color="#d7b07a" />
      <Box position={[0, (seat + h) / 2, d / 2 - 0.03]} size={[w * 0.86, h - seat, 0.045]} color="#efd8b4" />
      <Leg x={-w / 2 + 0.05} z={-d / 2 + 0.05} h={seat} />
      <Leg x={w / 2 - 0.05} z={-d / 2 + 0.05} h={seat} />
      <Leg x={-w / 2 + 0.05} z={d / 2 - 0.05} h={seat} />
      <Leg x={w / 2 - 0.05} z={d / 2 - 0.05} h={seat} />
    </group>
  )
}

function Sofa({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <group>
      <Box position={[0, h * 0.22, -d * 0.06]} size={[w * 0.92, h * 0.4, d * 0.62]} color="#d9ddd8" />
      <Box position={[0, h * 0.48, d / 2 - d * 0.1]} size={[w, h * 0.9, d * 0.18]} color="#ecefeb" />
      <Box position={[-w / 2 + w * 0.08, h * 0.32, -d * 0.02]} size={[w * 0.12, h * 0.55, d * 0.7]} color="#f4f5f2" />
      <Box position={[w / 2 - w * 0.08, h * 0.32, -d * 0.02]} size={[w * 0.12, h * 0.55, d * 0.7]} color="#f4f5f2" />
    </group>
  )
}

function Table({ w, d, h }: { w: number; d: number; h: number }) {
  const top = Math.min(0.04, h * 0.2)
  return (
    <group>
      <Box position={[0, h - top / 2, 0]} size={[w, top, d]} color="#edd8b6" />
      <Leg x={-w / 2 + 0.05} z={-d / 2 + 0.05} h={h - top} />
      <Leg x={w / 2 - 0.05} z={-d / 2 + 0.05} h={h - top} />
      <Leg x={-w / 2 + 0.05} z={d / 2 - 0.05} h={h - top} />
      <Leg x={w / 2 - 0.05} z={d / 2 - 0.05} h={h - top} />
    </group>
  )
}

function Cabinet({ w, d, h, doors }: { w: number; d: number; h: number; doors: boolean }) {
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color={doors ? '#f4f1ea' : '#f0e4d0'} />
      {doors && <Box position={[0, h / 2, -d / 2 + 0.01]} size={[0.012, h * 0.86, 0.012]} color="#1a1a1a" />}
      {!doors && (
        <>
          <Box position={[0, h * 0.66, -d / 2 + 0.008]} size={[w * 0.84, 0.012, 0.012]} color="#1a1a1a" />
          <Box position={[0, h * 0.33, -d / 2 + 0.008]} size={[w * 0.84, 0.012, 0.012]} color="#1a1a1a" />
        </>
      )}
    </group>
  )
}

function Shelf({ w, d, h }: { w: number; d: number; h: number }) {
  const shelves = [0.08, 0.32, 0.56, 0.8]
  return (
    <group>
      <Box position={[0, h / 2, d / 2 - 0.02]} size={[w, h, 0.04]} color="#c9a36b" />
      <Box position={[-w / 2 + 0.02, h / 2, 0]} size={[0.04, h, d]} color="#e2c48f" />
      <Box position={[w / 2 - 0.02, h / 2, 0]} size={[0.04, h, d]} color="#e2c48f" />
      {shelves.map((ratio) => (
        <Box key={ratio} position={[0, h * ratio, 0]} size={[w - 0.06, 0.025, d * 0.9]} color="#f3e6cf" />
      ))}
    </group>
  )
}
