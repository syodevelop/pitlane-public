import { expect, it } from "vitest";
import { project, unproject } from "../src/scene/coordinates";
import { STATIONS } from "../shared/game";
it("maps every server station and obstacle edge back from the angled screen", () => {
  for (const point of [
    ...Object.values(STATIONS),
    { x: 355, y: 200 },
    { x: 445, y: 255 },
    { x: 25, y: 35 },
    { x: 735, y: 425 },
  ]) {
    const roundTrip = unproject(project(point));
    expect(roundTrip.x).toBeCloseTo(point.x, 8);
    expect(roundTrip.y).toBeCloseTo(point.y, 8);
  }
});
