// Fit a bounding sphere into both vertical and horizontal fields of view.
export function viewerFitDistance(radius,fovDegrees,aspect){
 if(![radius,fovDegrees,aspect].every(Number.isFinite)||radius<=0||aspect<=0||fovDegrees<=0||fovDegrees>=180)throw new RangeError('Invalid camera bounds')
 const vertical=fovDegrees*Math.PI/360
 const horizontal=Math.atan(Math.tan(vertical)*aspect)
 return radius/Math.sin(Math.min(vertical,horizontal))*1.18
}
