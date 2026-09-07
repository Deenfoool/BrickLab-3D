import type { Object3D } from 'three'

export type PartCategory = 'Bricks' | 'Beams' | 'Axles' | 'Gears' | 'Wheels' | 'Power'
export type EditorMode = 'build' | 'simulate' | 'test'
export type TransformMode = 'translate' | 'rotate'

export type PartDefinition = {
  id: string
  name: string
  category: PartCategory
  icon: string
  description: string
  defaultColor: number
  create: (color: number) => Object3D
}

export type SavedPart = {
  instanceId: string
  partId: string
  color: number
  position: [number, number, number]
  rotation: [number, number, number]
}

export type SavedProject = {
  version: 1
  name: string
  savedAt: string
  parts: SavedPart[]
}
