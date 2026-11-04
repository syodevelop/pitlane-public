import GarageBackdrop from "./GarageBackdrop";
import Home from "./Home";
import Whitelist from "./Whitelist";

export default function Landing({
  whitelist,
  whitelistVisited,
}: {
  whitelist: boolean;
  whitelistVisited: boolean;
}) {
  return (
    <div className="landing-scene">
      <GarageBackdrop />
      <div className="launch-shade" aria-hidden="true" />
      <div
        className="landing-view landing-home"
        data-active={!whitelist}
        aria-hidden={whitelist || undefined}
        inert={whitelist}
      >
        <Home />
      </div>
      {whitelistVisited && (
        <div
          className="landing-view landing-whitelist"
          data-active={whitelist}
          aria-hidden={!whitelist || undefined}
          inert={!whitelist}
        >
          <Whitelist />
        </div>
      )}
    </div>
  );
}
