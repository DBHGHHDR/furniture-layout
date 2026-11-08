import { rectangleOutline } from './layout/polygon.ts'
import type { Scene } from './types.ts'

export function createSample(): Scene {
  return {
    room: { height: 250, outline: rectangleOutline(400, 350) },
    openings: [
      { id: 'door-1', kind: 'door', edge: 0, offset: 40, width: 90, sill: 0, height: 200 },
      { id: 'window-1', kind: 'window', edge: 2, offset: 160, width: 160, sill: 90, height: 120 },
    ],
    furniture: [
      { id: 'bed-1', type: 'bed', width: 160, depth: 200, height: 50 },
      { id: 'desk-1', type: 'desk', width: 120, depth: 60, height: 74 },
      { id: 'chair-1', type: 'chair', width: 50, depth: 50, height: 90 },
      { id: 'wardrobe-1', type: 'wardrobe', width: 100, depth: 60, height: 200 },
    ],
  }
}

export function copyScene(scene: Scene): Scene {
  return structuredClone(scene)
}
