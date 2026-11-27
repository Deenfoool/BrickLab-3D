
const gates=[
 {axis:0,at:-14*20,other:-31*20,direction:1},
 {axis:1,at:0,other:31*20,direction:1},
 {axis:0,at:0,other:31*20,direction:-1},
 {axis:1,at:0,other:-31*20,direction:-1}
];
const crossing=(a,b,g)=>{
 const delta=b[g.axis]-a[g.axis];if(delta*g.direction<=0)return null;
 const t=(g.at-a[g.axis])/delta;
 if(t<=0||t>1)return null;
 const other=a[1-g.axis]+(b[1-g.axis]-a[1-g.axis])*t;
 return Math.abs(other-g.other)<=120?t:null;
};
export function createDriveTelemetry(proving=false){
 let elapsed=0,distance=0,maxSpeed=0,previous=null,lapStart=null,gate=0,laps=[],accelStart=null,acceleration=null,brakeStart=null,braking=null,wasBrake=false;
 return {
  update({position,speed,dt,throttle,brake}){
   if(!Array.isArray(position)||!position.every(Number.isFinite)||!Number.isFinite(speed)||!Number.isFinite(dt))return;
   const step=Math.max(0,Math.min(.1,dt)),velocity=Math.abs(speed)*3.6;
   elapsed+=step;maxSpeed=Math.max(maxSpeed,velocity);
   const p=[position[0],position[2]];
   if(previous){
    const segment=Math.hypot(p[0]-previous[0],p[1]-previous[1])*.01;
    distance+=segment;
    if(proving){
     const t=crossing(previous,p,gates[gate]);
     if(t!==null){
      const time=elapsed-step*(1-t);
      if(gate===0){if(lapStart!==null)laps.push(time-lapStart);lapStart=time}
      gate=(gate+1)%gates.length;
     }
    }
   }
   previous=p;
   if(acceleration===null&&accelStart===null&&throttle>0&&velocity<.5)accelStart=elapsed;
   if(accelStart!==null&&acceleration===null&&velocity>=5)acceleration=elapsed-accelStart;
   if(acceleration===null&&throttle<=0&&velocity<.5)accelStart=null;
   if(brake&&!wasBrake&&velocity>=2)brakeStart={distance,speed:velocity};
   if(brakeStart&&brake&&velocity<.3){braking={distance:distance-brakeStart.distance,from:brakeStart.speed};brakeStart=null}
   if(!brake)brakeStart=null;wasBrake=brake;
  },
  result(){return {elapsed,distance,maxSpeed,laps:[...laps],bestLap:laps.length?Math.min(...laps):null,nextGate:gate,acceleration,braking}}
 };
}
export function downloadDriveResult(result,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify({format:'bricklab-drive-result',version:1,vehicle:name,...result},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='bricklab-drive-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
