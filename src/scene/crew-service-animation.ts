import * as T from "three";

export type ServiceKind =
  "wipe" | "repair" | "collect" | "wheel" | "diagnose" | "bench" | "install";
export type ServicePose = {
  kind: ServiceKind;
  heading: number;
  target: T.Vector3;
  progress?: number;
};

/** Planted feet and distinct body language. Hands are placed against the car
 * after the base pose is mixed, rather than waving at a fixed height. */
export function createServiceAnimation(kind: ServiceKind) {
  const wipe = kind === "wipe",
    duration = wipe
      ? 2.8
      : kind === "diagnose"
        ? 4.8
        : kind === "bench"
          ? 3.6
          : 3.2;
  const tracks: T.KeyframeTrack[] = [];
  const rotation = (
    name: string,
    pose: (p: number) => [number, number, number],
  ) => {
    const times: number[] = [],
      values: number[] = [];
    for (let i = 0; i <= 48; i++) {
      times.push((i / 48) * duration);
      values.push(
        ...new T.Quaternion()
          .setFromEuler(new T.Euler(...pose((i / 48) * Math.PI * 2)))
          .toArray(),
      );
    }
    tracks.push(
      new T.QuaternionKeyframeTrack(name + ".quaternion", times, values),
    );
  };
  const knee = kind === "wheel" ? 2.0 : wipe ? 1.1 : 0.24,
    hip = -knee / 2;
  for (const side of ["L", "R"]) {
    rotation("Thigh" + side, () => [hip, 0, 0]);
    rotation("Shin" + side, () => [knee, 0, 0]);
    rotation("Foot" + side, () => [hip, 0, 0]);
  }
  // Hip height follows bent legs to keep soles planted.
  const height = 0.16 + 1.3 * Math.cos(hip);
  tracks.push(
    new T.VectorKeyframeTrack(
      "Hips.position",
      [0, duration],
      [0, height, 0, 0, height, 0],
    ),
  );
  rotation("Spine", (p) => [
    kind === "diagnose"
      ? 0.28
      : kind === "bench"
        ? 0.4
        : kind === "install"
          ? 0.52
          : kind === "collect"
            ? 0.22
            : kind === "wheel"
              ? 0.8
              : wipe
                ? 0.82
                : 0.74,
    Math.sin(p) * 0.018,
    0,
  ]);
  rotation("Head", (p) => [
    kind === "diagnose" ? 0.22 + Math.sin(p) * 0.06 : 0.16,
    kind === "diagnose"
      ? Math.sin(p) * 0.1
      : kind === "bench"
        ? Math.sin(p) * 0.025
        : 0,
    0,
  ]);
  rotation("ArmR", () => [-0.7, 0, 0.13]);
  rotation("ForearmR", () => [-0.72, 0, 0]);
  rotation("HandR", () => [0, 0, 0]);
  rotation("ArmL", () => [wipe ? 0.12 : -0.65, 0, -0.08]);
  rotation("ForearmL", () => [wipe ? -0.18 : -0.65, 0, 0]);
  rotation("HandL", () => [0, 0, 0]);
  return new T.AnimationClip("Service_" + kind, duration, tracks);
}

/** A long, low-amplitude idle cycle. Legs retain their authored planted pose. */
export function createCrewIdle(base: T.AnimationClip) {
  const duration = 8,
    clip = base.clone();
  for (const track of clip.tracks)
    for (let i = 0; i < track.times.length; i++)
      track.times[i] *= duration / base.duration;
  clip.duration = duration;
  clip.name = "Workshop_Idle";
  const poses: Record<string, (p: number) => [number, number, number]> = {
    Spine: (p) => [
      Math.sin(p * 2) * 0.015,
      Math.sin(p) * 0.018,
      Math.sin(p) * 0.012,
    ],
    Head: (p) => [
      Math.sin(p * 2) * 0.018,
      Math.sin(p) * 0.095 * Math.pow(Math.sin(p / 2), 2),
      Math.sin(p) * 0.012,
    ],
    ArmL: (p) => [Math.sin(p * 2) * 0.017, 0, -0.09 - Math.sin(p) * 0.012],
    ArmR: (p) => [Math.sin(p * 2 + 0.4) * 0.017, 0, 0.09 + Math.sin(p) * 0.012],
  };
  for (const [bone, pose] of Object.entries(poses)) {
    const times: number[] = [],
      values: number[] = [];
    for (let i = 0; i <= 64; i++) {
      times.push((i / 64) * duration);
      values.push(
        ...new T.Quaternion()
          .setFromEuler(new T.Euler(...pose((i / 64) * Math.PI * 2)))
          .toArray(),
      );
    }
    clip.tracks = clip.tracks.filter((t) => t.name !== bone + ".quaternion");
    clip.tracks.push(
      new T.QuaternionKeyframeTrack(bone + ".quaternion", times, values),
    );
  }
  return clip;
}

/** Contact motion is cyclic and pauses between strokes, without sliding a
 * socket over the engine or moving a wiping hand through the lamp. */
export function serviceHandMotion(kind: ServiceKind, phase: number) {
  const cycle = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const stroke =
    T.MathUtils.smoothstep(cycle, 0.08, 0.38) -
    T.MathUtils.smoothstep(cycle, 0.56, 0.82);
  if (kind === "wipe")
    return {
      across: Math.sin(phase * 2) * 0.075,
      up: Math.sin(phase * 4) * 0.018,
      turn: Math.sin(phase * 2) * 0.07,
    };
  if (kind === "diagnose")
    return {
      across: Math.sin(phase) * 0.035,
      up: 0.06 + Math.sin(phase) * 0.018,
      turn: Math.sin(phase) * 0.08,
    };
  return { across: 0, up: 0, turn: (kind === "bench" ? 0.34 : 0.28) * stroke };
}

// Calls are synchronous and sequential across actors. Reuse solver scratch
// storage; no temporary vectors/quaternions are retained by a character.
const reachScratch = {
  original: [new T.Quaternion(), new T.Quaternion(), new T.Quaternion()],
  wrist: new T.Vector3(), grip: new T.Vector3(), origin: new T.Vector3(),
  from: new T.Vector3(), to: new T.Vector3(),
  turn: new T.Quaternion(), world: new T.Quaternion(), parent: new T.Quaternion(),
};

/** Aim a two-bone chain without stretching its bones. The grip, rather than
 * the wrist pivot, touches the work surface. */
export function reachServicePoint(
  arm: T.Object3D,
  forearm: T.Object3D,
  hand: T.Object3D,
  target: T.Vector3,
  handRotation: T.Quaternion,
  grip: T.Vector3,
  blend: number,
) {
  if (blend <= 0) return;
  const { original, wrist, origin, from, to, turn, world, parent } = reachScratch;
  original[0].copy(arm.quaternion);
  original[1].copy(forearm.quaternion);
  original[2].copy(hand.quaternion);
  wrist.copy(target).sub(reachScratch.grip.copy(grip).applyQuaternion(handRotation));
  for (let iteration = 0; iteration < 12; iteration++) {
    for (let joint = 0; joint < 2; joint++) {
      const bone = joint === 0 ? forearm : arm;
      bone.updateWorldMatrix(true, true);
      bone.getWorldPosition(origin);
      hand.getWorldPosition(from).sub(origin).normalize();
      to.copy(wrist).sub(origin).normalize();
      turn.setFromUnitVectors(from, to);
      bone.getWorldQuaternion(world).premultiply(turn);
      bone.parent!.getWorldQuaternion(parent).invert();
      bone.quaternion.copy(parent.multiply(world));
    }
  }
  hand.quaternion.copy(
    hand
      .parent!.getWorldQuaternion(parent)
      .invert()
      .multiply(handRotation),
  );
  for (let i = 0; i < 3; i++) {
    const bone = i === 0 ? arm : i === 1 ? forearm : hand;
    bone.quaternion.slerpQuaternions(original[i], world.copy(bone.quaternion), blend);
  }
  arm.updateWorldMatrix(true, true);
}
