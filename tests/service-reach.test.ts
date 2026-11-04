import { expect, it, vi } from "vitest";
import * as T from "three";
import { reachServicePoint } from "../src/scene/crew-service-animation";

function rig() {
  const root=new T.Group(), arm=new T.Bone(), forearm=new T.Bone(), hand=new T.Bone();
  root.add(arm); arm.add(forearm); forearm.add(hand);
  forearm.position.y=1; hand.position.y=1;
  root.updateMatrixWorld(true);
  return {root,arm,forearm,hand};
}
it("reaches the service target without stretching bones or cloning solver vectors", () => {
  const a=rig(), target=new T.Vector3(1.1,1.2,0), orientation=new T.Quaternion(), grip=new T.Vector3();
  const clone=vi.spyOn(T.Vector3.prototype,"clone");
  try {
    reachServicePoint(a.arm,a.forearm,a.hand,target,orientation,grip,1);
    expect(a.hand.getWorldPosition(new T.Vector3()).distanceTo(target)).toBeLessThan(.02);
    expect(a.forearm.position.length()).toBe(1);
    expect(a.hand.position.length()).toBe(1);
    expect(clone).not.toHaveBeenCalled();
  } finally {clone.mockRestore();}
});
it("keeps independent actors isolated and leaves a zero-weight pose untouched", () => {
  const a=rig(), b=rig(), expected=rig(), target=new T.Vector3(-1,1,0), orientation=new T.Quaternion(), grip=new T.Vector3();
  reachServicePoint(a.arm,a.forearm,a.hand,new T.Vector3(.5,1.5,.3),orientation,grip,1);
  reachServicePoint(b.arm,b.forearm,b.hand,target,orientation,grip,.5);
  reachServicePoint(expected.arm,expected.forearm,expected.hand,target,orientation,grip,.5);
  expect(b.arm.quaternion.angleTo(expected.arm.quaternion)).toBeLessThan(1e-7);
  const before=a.arm.quaternion.clone();
  reachServicePoint(a.arm,a.forearm,a.hand,target,orientation,grip,0);
  expect(a.arm.quaternion.equals(before)).toBe(true);
});
