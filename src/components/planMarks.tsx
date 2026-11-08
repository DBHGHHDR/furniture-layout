export function WindowStroke({
  a,
  b,
  X,
  Y,
}: {
  a: { x: number; y: number }
  b: { x: number; y: number }
  X: (value: number) => number
  Y: (value: number) => number
}) {
  return <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke="#9ec9e2" strokeWidth={11} />
}

export function DoorSwing({
  hinge,
  closed,
  open,
  X,
  Y,
}: {
  hinge: { x: number; y: number }
  closed: { x: number; y: number }
  open: { x: number; y: number }
  X: (value: number) => number
  Y: (value: number) => number
}) {
  return (
    <g>
      <line x1={X(hinge.x)} y1={Y(hinge.y)} x2={X(closed.x)} y2={Y(closed.y)} stroke="#f4ecdf" strokeWidth={8} />
      <path d={swingPath(hinge, closed, open, X, Y)} fill="none" stroke="#8a6232" strokeWidth={1.2} />
      <line x1={X(hinge.x)} y1={Y(hinge.y)} x2={X(open.x)} y2={Y(open.y)} stroke="#1c1c1c" strokeWidth={1.6} />
    </g>
  )
}

function swingPath(
  hinge: { x: number; y: number },
  closed: { x: number; y: number },
  open: { x: number; y: number },
  X: (value: number) => number,
  Y: (value: number) => number,
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
