import type { GoalId, LayoutResult, Scene } from './types.ts'
import type { UnitPlan, UnitProgram } from './layout/unitPlan.ts'

const KEY = 'furniture-layout.inventory'
const MAX = 30

export type FurnitureRecord = {
  id: string
  name: string
  createdAt: number
  kind: 'furniture'
  scene: Scene
  goal: GoalId
  results: LayoutResult[]
}

export type UnitRecord = {
  id: string
  name: string
  createdAt: number
  kind: 'unit'
  program: UnitProgram
  plan: UnitPlan
}

export type InventoryEntry = FurnitureRecord | UnitRecord

function isEntry(value: unknown): value is InventoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as InventoryEntry
  return (entry.kind === 'furniture' || entry.kind === 'unit') && typeof entry.id === 'string' && typeof entry.name === 'string'
}

export function loadInventory(): InventoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, MAX)
  } catch {
    return []
  }
}

export function writeInventory(entries: InventoryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
}

export function addInventory(entries: InventoryEntry[], entry: InventoryEntry): InventoryEntry[] {
  return [entry, ...entries.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX)
}
