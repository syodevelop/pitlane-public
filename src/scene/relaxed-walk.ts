import * as T from "three";

// Approved Lower steps gait shared by all three characters (2026-10-21).
// Same two .65-unit leg bones and sole height as the existing character rig.
export function createRelaxedWalk() {
  const duration = 1.08;
  // Match stance-foot travel to 92px/s at the existing 216px / 3.5-unit scale.
  // Cadence is 26% lower than the first Lower steps version.
  // Simply stretching time would make the feet slide under the moving avatar.
  const halfStride = 92 * duration * 3.5 / (4 * 216);
  const legHeight = 1.226; // Longer stride still fits the two .65-unit leg bones.
  const tracks: T.KeyframeTrack[] = [];
  const bob = (p: number) => .006 * Math.cos(2 * p);
  const leg = (p: number) => {
    const t = ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const stance = t < Math.PI;
    const u = (stance ? t : t - Math.PI) / Math.PI;
    const z = stance ? halfStride * (1 - 2 * u) : -halfStride + 2 * halfStride * u * u * (3 - 2 * u);
    const y = legHeight + bob(p) - (stance ? 0 : Math.sin(Math.PI * u) * .075);
    const knee = Math.acos(T.MathUtils.clamp((y*y + z*z - .845) / .845, -1, 1));
    const hip = Math.atan2(-z, y) - knee / 2;
    return { hip, knee, ankle: -hip-knee };
  };
  const rotation = (name: string, pose: (p: number) => [number,number,number]) => {
    const times: number[] = [], values: number[] = [];
    for(let i=0;i<=64;i++) {
      times.push(i/64*duration);
      values.push(...new T.Quaternion().setFromEuler(new T.Euler(...pose(i/64*Math.PI*2))).toArray());
    }
    tracks.push(new T.QuaternionKeyframeTrack(name+".quaternion",times,values));
  };
  for (const [sign,side] of [[-1,"L"],[1,"R"]] as const) {
    const offset=sign<0?0:Math.PI;
    rotation("Thigh"+side,p=>[leg(p+offset).hip,0,0]);
    rotation("Shin"+side,p=>[leg(p+offset).knee,0,0]);
    rotation("Foot"+side,p=>[leg(p+offset).ankle,0,0]);
    rotation("Arm"+side,p=>[-Math.cos(p)*.20*sign,0,sign*.09]);
    rotation("Forearm"+side,p=>[-.12-Math.max(0,Math.cos(p)*sign)*.10,0,0]);
  }
  rotation("Spine",p=>[.015,Math.sin(p)*.022,Math.sin(p)*.009]);
  rotation("Head",p=>[-.015,-Math.sin(p)*.018,0]);
  const times: number[] = [], positions: number[] = [];
  for(let i=0;i<=64;i++) {
    times.push(i/64*duration);positions.push(0,legHeight+.16+bob(i/64*Math.PI*2),0);
  }
  tracks.push(new T.VectorKeyframeTrack("Hips.position",times,positions));
  return new T.AnimationClip("WalkRelaxed",duration,tracks);
}
