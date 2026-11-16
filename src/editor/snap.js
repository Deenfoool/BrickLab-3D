import { portLength } from '../mechanics/axial.js?v=mechanics-audit'
import { technic } from '../mechanics/catalog.js?v=mechanics-audit'
import { candidateOffsets, joinedPose, worldPort } from './placement.js?v=mechanics-audit'

export function nearbyConnections({ scene, assembly, parts, moving, event, depth, roll, acceptPose }) {
  const candidates = []
  const ownPorts = technic[moving.design].filter(port => port.role !== 'gear')
  for (const fixed of parts) {
    if (fixed.id === moving.id) continue
    for (const fixedPort of technic[fixed.design]) {
      if (fixedPort.role === 'gear') continue
      const { start, axis } = worldPort(fixed, fixedPort)
      const span = portLength(fixedPort)
      for (const side of fixedPort.openings) {
        const point = start.clone().addScaledVector(axis, side === 'end' ? span : 0)
        const distance = scene.pixelDistance(point, event)
        if (distance > 31) continue
        for (const own of ownPorts) {
          if (own.gender === fixedPort.gender) continue
          const movingShaft = own.gender === 'M'
          const male = movingShaft ? own : fixedPort
          const female = movingShaft ? fixedPort : own
          const shaft = { part: movingShaft ? moving.id : fixed.id, port: male.id }
          const socket = { part: movingShaft ? fixed.id : moving.id, port: female.id }
          const key = JSON.stringify([fixed.id, fixedPort.id, own.id, side])
          const directions = movingShaft ? [1, -1] : [side === 'start' ? -1 : 1, side === 'start' ? 1 : -1]
          const entries = movingShaft ? [side] : female.openings
          let best
          let failure
          for (const direction of directions) {
            for (const entry of entries) {
              const entersAtShaftEnd = (entry === 'start') === (direction > 0)
              if (!movingShaft && entersAtShaftEnd !== (side === 'end')) continue
              const signedDepth = movingShaft ? (entry === 'start' ? depth : -depth) : (side === 'start' ? -direction : direction) * depth
              const offsets = candidateOffsets(male, female, direction, entry, signedDepth)
              if (acceptPose) {
                const ownWorld = worldPort(moving, own)
                const fixedAxis = movingShaft ? axis : axis.clone().multiplyScalar(direction)
                const offset = ownWorld.start.clone().sub(start).dot(fixedAxis)
                offsets.push(movingShaft ? offset : -offset)
              }
              for (const offset of offsets) {
                const placement = { direction, side: entry, offset, roll }
                const fit = assembly.previewInsertion(shaft, socket, placement)
                if (!fit.ok) {
                  if (!failure || fit.reason.includes('occupied')) failure = fit.reason
                  continue
                }
                let pose = joinedPose(moving, own, fixed, fixedPort, fit.placement)
                if (acceptPose && !acceptPose(pose)) {
                  if (!fit.placement.keyStep) continue
                  const matchingKey = [1, 2, 3].find(step => {
                    const placement = { ...fit.placement, roll: roll + step * fit.placement.keyStep }
                    pose = joinedPose(moving, own, fixed, fixedPort, placement)
                    return acceptPose(pose)
                  })
                  if (!matchingKey) continue
                  fit.placement.roll = roll + matchingKey * fit.placement.keyStep
                }
                const bounds = fit.occupancy.shaft
                const endpoint = side === 'end' ? span : 0
                const reach = movingShaft ? 0 : Math.abs((bounds[0] + bounds[1]) / 2 - endpoint)
                const score = acceptPose ? pose.position.reduce((sum, value, index) =>
                  sum + (value - moving.position[index]) ** 2, 0) : reach + (movingShaft && direction < 0 ? .01 : 0)
                if (!best || score < best.score) best = { key, point, distance, fit, pose, shaft, socket, score }
                if (movingShaft && !acceptPose) break
              }
            }
          }
          if (best) candidates.push(best)
          else if (failure && failure !== 'incompatible-family') candidates.push({ key, point, distance, failure })
        }
      }
    }
  }
  return candidates.sort((a, b) =>
    Number(Boolean(b.fit)) - Number(Boolean(a.fit)) || a.distance - b.distance || a.key.localeCompare(b.key))
}
