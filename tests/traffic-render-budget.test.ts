import { expect, it, vi } from "vitest";
import { FleetCar } from "../src/scene/fleet-car";
import { ServiceTraffic } from "../src/scene/service-traffic";

it("animates each ambient car once while retaining distance across simulation substeps", () => {
  const traffic = new ServiceTraffic();
  traffic.beginService("rustback:standard", "service");
  const animate = vi.spyOn(FleetCar.prototype, "animate");
  try {
    traffic.update(.1);
    const backgroundCalls = animate.mock.calls.filter((_, i) => animate.mock.instances[i] !== traffic.client);
    expect(backgroundCalls).toHaveLength(3);
    expect(backgroundCalls.map(c => c[0])).toEqual([.54, .54, .44000000000000006]);
    const ambient = () => traffic.root.children.filter(car => car !== traffic.client.root);
    const positions = ambient().map(car => car.position.clone());
    traffic.reset();
    for (let i = 0; i < 6; i++) traffic.update(1 / 60);
    ambient().forEach((car, i) => expect(car.position.distanceTo(positions[i])).toBeLessThan(1e-8));
  } finally { animate.mockRestore(); traffic.dispose(); }
});
