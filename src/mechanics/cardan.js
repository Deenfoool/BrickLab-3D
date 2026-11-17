import { Matrix4, Quaternion, Vector3 } from 'three'

const tau = 2 * Math.PI
const vector = value => new Vector3().fromArray(value)

// The two cross trunnions must stay perpendicular as the yokes turn about their own axes.
export function cardanCoupling(cross, endA, endB) {
  const makeEnd = ({ part, shaftLine, pinLine }) => ({
    part, line: shaftLine, axis: vector(shaftLine.axis), pin: vector(pinLine.axis), center: vector(pinLine.start),
  })
  const a = makeEnd(endA)
  const b = makeEnd(endB)
  const center = a.center
  const shaftSeparation = (end, point) => vector(end.line.start).sub(point).cross(end.axis).length()
  if (center.distanceTo(b.center) > .01 || shaftSeparation(a, center) > .01 || shaftSeparation(b, center) > .01 ||
      Math.abs(a.pin.dot(b.pin)) > .001 || Math.abs(a.pin.dot(a.axis)) > .001 ||
      Math.abs(b.pin.dot(b.axis)) > .001 || Math.abs(a.axis.dot(b.axis)) < .05) return null

  const transfer = (from, to) => {
    const sign = Math.sign(from.axis.dot(to.axis))
    const orientation = Math.sign(to.axis.clone().cross(from.pin).dot(to.pin))
    return angle => {
      const drivenPin = from.pin.clone().applyAxisAngle(from.axis, angle)
      const next = to.axis.clone().cross(drivenPin).normalize().multiplyScalar(orientation)
      const principal = Math.atan2(to.axis.dot(to.pin.clone().cross(next)), to.pin.dot(next))
      return principal + tau * Math.round((sign * angle - principal) / tau)
    }
  }
  const basis = (first, second) => new Matrix4().makeBasis(first, second, first.clone().cross(second))
  const previous = basis(a.pin, b.pin).invert()
  return {
    cross, a: a.part, b: b.part, lineA: a.line, lineB: b.line, forward: transfer(a, b), reverse: transfer(b, a),
    crossPose(angleA, angleB) {
      const pinA = a.pin.clone().applyAxisAngle(a.axis, angleA)
      const pinB = b.pin.clone().applyAxisAngle(b.axis, angleB)
      const rotation = new Quaternion().setFromRotationMatrix(basis(pinA, pinB).multiply(previous)).normalize()
      return { rotation, center }
    },
  }
}
