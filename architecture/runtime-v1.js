import { PARTS, findPart } from '../parts.js'
import { PhysicsSession } from '../physics.js'
import '../technic/runtime-v1.js?v=technic-family-20260915-v1'
import { analyzeTechnicAwareDrivetrain } from '../technic/drivetrain-v1.js?v=technic-family-20260915-v1'
import { interactionGroupMembers, isEditorGroup } from '../editor-groups-v1.js'
import { createBrickLabSubsystemApi } from './subsystem-api-v1.js'

export const BrickLabSubsystems = createBrickLabSubsystemApi({
  listParts:() => PARTS,
  findPart,
  createPhysicsSession:(objects, connections, ...rest) => PhysicsSession.create(objects, connections, ...rest),
  analyzeDrivetrain:analyzeTechnicAwareDrivetrain,
  groupMembers:interactionGroupMembers,
  isGroup:isEditorGroup,
})

globalThis.BrickLabSubsystems = BrickLabSubsystems
globalThis.dispatchEvent?.(new CustomEvent('bricklab:subsystemsready', {
  detail:{ version:BrickLabSubsystems.version, status:BrickLabSubsystems.status() },
}))
