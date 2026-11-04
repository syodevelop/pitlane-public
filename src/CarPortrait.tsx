import type { Car } from "../packages/game-core/model";
import { carAppearance } from "./scene/car-appearance";

export default function CarPortrait({
  car,
  compact = false,
}: {
  car: Pick<Car, "tier" | "restored" | "engine" | "reliability">;
  compact?: boolean;
}) {
  const art = carAppearance(car);
  return (
    <div
      className={"car-art" + (compact ? " compact" : "")}
      role="img"
      aria-label={art.label}
      style={{
        backgroundImage: `url(/art/${art.texture}.webp)`,
        backgroundPosition: art.frame ? "100% 0" : "0 0",
      }}
    />
  );
}
