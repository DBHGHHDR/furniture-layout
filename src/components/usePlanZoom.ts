import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_ZOOM = 0.45
const MAX_ZOOM = 8

export function usePlanZoom(viewW: number, viewH: number) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const state = useRef({ zoom: 1, origin: { x: 0, y: 0 }, viewW, viewH })
  state.current = { zoom, origin, viewW, viewH }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let drag: {
      pointerId: number
      x: number
      y: number
      originX: number
      originY: number
      inv: DOMMatrix
      moved: boolean
    } | null = null

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || svg.dataset.pan === 'off') return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.opening-node, .vertex, input, textarea, .plan-name-input')) return
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        originX: state.current.origin.x,
        originY: state.current.origin.y,
        inv: ctm.inverse(),
        moved: false,
      }
    }
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y)
      if (!drag.moved && distance < 4) return
      drag.moved = true
      svg.classList.add('panning')
      const start = new DOMPoint(drag.x, drag.y).matrixTransform(drag.inv)
      const now = new DOMPoint(event.clientX, event.clientY).matrixTransform(drag.inv)
      setOrigin({ x: drag.originX - (now.x - start.x), y: drag.originY - (now.y - start.y) })
    }
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const moved = drag.moved
      drag = null
      svg.classList.remove('panning')
      if (!moved) return
      const stop = (click: Event) => {
        click.preventDefault()
        click.stopPropagation()
        svg.removeEventListener('click', stop, true)
        svg.removeEventListener('dblclick', stop, true)
      }
      svg.addEventListener('click', stop, true)
      svg.addEventListener('dblclick', stop, true)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const { zoom: current, origin: currentOrigin, viewW: width, viewH: height } = state.current
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const local = point.matrixTransform(ctm.inverse())
      const next = clamp(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
      const spanW = width / current
      const spanH = height / current
      const nextW = width / next
      const nextH = height / next
      const relX = spanW === 0 ? 0.5 : (local.x - currentOrigin.x) / spanW
      const relY = spanH === 0 ? 0.5 : (local.y - currentOrigin.y) / spanH
      setZoom(next)
      setOrigin({ x: local.x - relX * nextW, y: local.y - relY * nextH })
    }
    svg.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      svg.removeEventListener('wheel', onWheel)
    }
  }, [])

  const zoomBy = useCallback((factor: number) => {
    const { zoom: current, origin: currentOrigin, viewW: width, viewH: height } = state.current
    const next = clamp(current * factor)
    const centerX = currentOrigin.x + width / current / 2
    const centerY = currentOrigin.y + height / current / 2
    setZoom(next)
    setOrigin({ x: centerX - width / next / 2, y: centerY - height / next / 2 })
  }, [])

  const viewBox = `${origin.x} ${origin.y} ${viewW / zoom} ${viewH / zoom}`
  return { svgRef, viewBox, zoom, zoomBy }
}

function clamp(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}
