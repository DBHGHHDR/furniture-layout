import { useLayoutEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { DoubleSide, NoToneMapping, Shape, type OrthographicCamera } from 'three'
import type { FurnitureType, Opening, Placed, Room } from '../types.ts'
import { boundsOf, getEdge, signedArea } from '../layout/polygon.ts'

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
          <Floor room={room} />
          <Walls room={room} openings={openings} />
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

function Floor({ room }: { room: Room }) {
  const box = boundsOf(room.outline)
  const shape = useMemo(() => {
    const next = new Shape()
    const outline = signedArea(room.outline) >= 0 ? room.outline : [...room.outline].reverse()
    outline.forEach((point, index) => {
      const x = point.x / 100
      const y = -point.y / 100
      if (index === 0) next.moveTo(x, y)
      else next.lineTo(x, y)
    })
    next.closePath()
    return next
  }, [room.outline])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(box.minX + box.maxX) / 200, -0.08, (box.minY + box.maxY) / 200]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#d5e6d8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#e8d5b6" roughness={0.92} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function CameraRig({ room, resetKey }: { room: Room; resetKey: number }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls) as {
    target: { set: (x: number, y: number, z: number) => void }
    update: () => void
  } | null
  const box = boundsOf(room.outline)

  useLayoutEffect(() => {
    if (size.height < 20) return
    const frame = requestAnimationFrame(() => {
      const cx = (box.minX + box.maxX) / 200
      const cy = room.height / 500
      const cz = (box.minY + box.maxY) / 200
      const span = Math.max(box.width, box.depth) / 100
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
  }, [box.depth, box.maxX, box.maxY, box.minX, box.minY, box.width, camera, controls, resetKey, room.height, size.height, size.width])

  return null
}

function Walls({ room, openings }: { room: Room; openings: Opening[] }) {
  const ccw = signedArea(room.outline) >= 0
  return (
    <group>
      {room.outline.map((_, index) => (
        <EdgeWall key={index} room={room} edgeIndex={index} openings={openings.filter((opening) => opening.edge === index)} ccw={ccw} />
      ))}
    </group>
  )
}

type LocalBox = {
  key: string
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  color: string
  glass?: boolean
}

function EdgeWall({
  room,
  edgeIndex,
  openings,
  ccw,
}: {
  room: Room
  edgeIndex: number
  openings: Opening[]
  ccw: boolean
}) {
  const edge = getEdge(room.outline, edgeIndex)
  if (!edge || edge.length < 1) return null
  const angle = Math.atan2(edge.dy, edge.dx)
  const boxes = buildEdgeBoxes(room, edge.length, openings, ccw, `e${edgeIndex}`)
  return (
    <group position={[edge.a.x / 100, 0, edge.a.y / 100]} rotation={[0, -angle, 0]}>
      {boxes.map((box) => (
        <mesh
          key={box.key}
          position={[((box.x0 + box.x1) / 2) / 100, ((box.y0 + box.y1) / 2) / 100, ((box.z0 + box.z1) / 2) / 100]}
          castShadow={!box.glass}
          receiveShadow
        >
          <boxGeometry args={[(box.x1 - box.x0) / 100, (box.y1 - box.y0) / 100, (box.z1 - box.z0) / 100]} />
          <meshStandardMaterial color={box.color} transparent={Boolean(box.glass)} opacity={box.glass ? 0.38 : 1} roughness={box.glass ? 0.05 : 0.78} />
          {!box.glass && <Edges color="#1a1a1a" threshold={15} />}
        </mesh>
      ))}
      {openings.filter((opening) => opening.kind === 'door').map((door) => (
        <group key={door.id} position={[door.offset / 100, 0, 0]} rotation={[0, ccw ? -0.55 : 0.55, 0]}>
          <mesh position={[door.width / 200, Math.min(200, room.height) / 200, 0.02]} castShadow>
            <boxGeometry args={[door.width / 100, Math.min(200, room.height) / 100, 0.04]} />
            <meshStandardMaterial color="#fbfbfa" roughness={0.7} />
            <Edges color="#1a1a1a" threshold={15} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function buildEdgeBoxes(room: Room, length: number, openings: Opening[], ccw: boolean, prefix: string): LocalBox[] {
  const boxes: LocalBox[] = []
  const z0 = ccw ? -THICK : 0
  const z1 = ccw ? 0 : THICK
  const holes = openings
    .map((opening) => ({
      start: opening.offset,
      end: opening.offset + opening.width,
      bottom: opening.kind === 'door' ? 0 : opening.sill,
      top: opening.kind === 'door' ? Math.min(200, room.height) : Math.min(room.height, opening.sill + opening.height),
      kind: opening.kind,
    }))
    .filter((gap) => gap.end > gap.start)
    .sort((a, b) => a.start - b.start)
  let cursor = 0
  holes.forEach((gap, index) => {
    addLocal(boxes, `${prefix}-pier-${index}`, cursor, 0, z0, gap.start, room.height, z1, WALL)
    if (gap.bottom > 0.4) addLocal(boxes, `${prefix}-sill-${index}`, gap.start, 0, z0, gap.end, gap.bottom, z1, WALL)
    if (room.height - gap.top > 0.4) addLocal(boxes, `${prefix}-head-${index}`, gap.start, gap.top, z0, gap.end, room.height, z1, WALL)
    if (gap.kind === 'window') addWindow(boxes, `${prefix}-win-${index}`, gap, z0, z1)
    cursor = gap.end
  })
  addLocal(boxes, `${prefix}-end`, cursor, 0, z0, length, room.height, z1, WALL)
  return boxes
}

function addWindow(
  out: LocalBox[],
  key: string,
  gap: { start: number; end: number; bottom: number; top: number },
  z0: number,
  z1: number,
) {
  const inset = 3.5
  const mid = (z0 + z1) / 2
  const bar = (part: string, x0: number, y0: number, x1: number, y1: number) => {
    addLocal(out, `${key}-${part}`, x0, y0, mid - 2, x1, y1, mid + 2, FRAME)
  }
  bar('left', gap.start, gap.bottom, gap.start + inset, gap.top)
  bar('right', gap.end - inset, gap.bottom, gap.end, gap.top)
  bar('bottom', gap.start + inset, gap.bottom, gap.end - inset, gap.bottom + inset)
  bar('top', gap.start + inset, gap.top - inset, gap.end - inset, gap.top)
  const center = (gap.start + gap.end) / 2
  bar('mullion', center - 1.1, gap.bottom + inset, center + 1.1, gap.top - inset)
  addLocal(out, `${key}-glass`, gap.start + inset, gap.bottom + inset, mid - 0.8, gap.end - inset, gap.top - inset, mid + 0.8, '#c5dced', true)
}

function addLocal(
  out: LocalBox[],
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
  if (x1 - x0 < 0.3 || y1 - y0 < 0.3 || Math.abs(z1 - z0) < 0.3) return
  out.push({ key, x0, y0, z0, x1, y1, z1, color, glass })
}

function FurniturePiece({ item }: { item: Placed }) {
  return (
    <group
      position={[(item.x + item.w / 2) / 100, 0, (item.y + item.d / 2) / 100]}
      rotation={[0, (item.rotation * Math.PI) / 180, 0]}
    >
      <Model type={item.type} w={item.nominalWidth / 100} d={item.nominalDepth / 100} h={item.h / 100} />
    </group>
  )
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
