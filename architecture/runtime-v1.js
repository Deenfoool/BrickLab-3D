import { PARTS, findPart } from '../parts.js'
import { PhysicsSession } from '../physics.js'
import { analyzeDrivetrain } from '../drivetrain.js'
import { interactionGroupMembers, isEditorGroup } from '../editor-groups-v1.js'
import { createBrickLabSubsystemApi } from './subsystem-api-v1.js'

export const BrickLabSubsystems = createBrickLabSubsystemApi({
  listParts:() => PARTS,
  findPart,
  createPhysicsSession:(objects, connections, ...rest) => PhysicsSession.create(objects, connections, ...rest),
  analyzeDrivetrain,
  groupMembers:interactionGroupMembers,
  isGroup:isEditorGroup,
})

globalThis.BrickLabSubsystems = BrickLabSubsystems
globalThis.dispatchEvent?.(new CustomEvent('bricklab:subsystemsready', {
  detail:{ version:BrickLabSubsystems.version, status:BrickLabSubsystems.status() },
}))
