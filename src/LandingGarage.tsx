import { useEffect, useRef, useState } from "react";

// Promotional choreography only. No game module, session, wallet or API imports.
function Sprite({
  name,
  x,
  y,
  width,
  height = width,
  frame = 0,
  columns = 1,
  cellWidth = 256,
  cellHeight = 256,
  className,
}: {
  name: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  frame?: number;
  columns?: number;
  cellWidth?: number;
  cellHeight?: number;
  className?: string;
}) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`${frame * cellWidth} 0 ${cellWidth} ${cellHeight}`}
      overflow="hidden"
      className={className}
    >
      <image
        href={`/art/${name}.webp`}
        width={columns * cellWidth}
        height={cellHeight}
      />
    </svg>
  );
}

export default function LandingGarage() {
  const figure = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let inView = true;
    const visibility = () => setHidden(document.hidden || !inView);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      visibility();
    });
    if (figure.current) observer.observe(figure.current);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);
  return (
    <figure
      ref={figure}
      className="landing-garage"
      data-paused={paused || hidden}
    >
      <svg
        className="landing-world"
        viewBox="0 0 900 620"
        role="img"
        aria-label="Pitlane garage: a customer arrives for service while the team's restored Rustback leaves for the circuit and returns."
      >
        <defs>
          {[
            ["grass", "grass-material"],
            ["concrete", "concrete-material"],
            ["asphalt", "asphalt-material"],
          ].map(([id, name]) => (
            <pattern
              key={id}
              id={`landing-${id}`}
              width="256"
              height="256"
              patternUnits="userSpaceOnUse"
            >
              <image href={`/art/${name}.webp`} width="256" height="256" />
            </pattern>
          ))}
        </defs>
        <rect width="900" height="620" fill="url(#landing-grass)" />
        <rect width="900" height="620" fill="#596e5e" opacity=".32" />
        <g transform="matrix(.86 .32 -.58 .56 260 135)">
          <path
            d="M800 -90H-100V480H700"
            fill="none"
            stroke="url(#landing-concrete)"
            strokeWidth="140"
            strokeLinejoin="round"
          />
          <path
            d="M800 -90H-100V480H700"
            fill="none"
            stroke="url(#landing-asphalt)"
            strokeWidth="126"
            strokeLinejoin="round"
          />
          <path
            d="M800 -90H-100V480H700"
            fill="none"
            stroke="#dfd9c4"
            strokeWidth="3"
            strokeDasharray="28 35"
          />
          <rect
            x="332"
            y="330"
            width="136"
            height="150"
            fill="url(#landing-asphalt)"
          />
          <rect y="7" width="640" height="350" fill="#4a5148" />
          <rect
            width="640"
            height="350"
            fill="url(#landing-concrete)"
            stroke="#e6e0ca"
            strokeWidth="3"
          />
          <path
            d="M160 0V350M320 0V350M480 0V350M0 175H640"
            stroke="#74796b"
            opacity=".4"
          />
          <path
            d="M150 45H290V122H150ZM330 230H470V307H330Z"
            fill="none"
            stroke="#ece6d2"
            strokeWidth="3"
          />
        </g>
        <g transform="matrix(.86 .32 0 1 260 65)">
          {[0, 160, 320, 480].map((x) => (
            <image
              key={x}
              x={x}
              width="160"
              height="70"
              href="/art/garage-wall-panel.webp"
              preserveAspectRatio="none"
            />
          ))}
        </g>
        <Sprite name="stock-rack" x={244} y={105} width={100} />
        <Sprite name="service-station" x={438} y={215} width={85} />
        <Sprite name="engine-stand" x={607} y={262} width={85} columns={2} />
        <g className="landing-customer">
          <ellipse
            cx="391"
            cy="261"
            rx="65"
            ry="17"
            fill="#34453d"
            opacity=".25"
          />
          <Sprite
            name="rustback"
            x={304}
            y={131}
            width={174}
            height={145}
            frame={1}
            columns={2}
            cellWidth={384}
            cellHeight={320}
          />
        </g>
        <g className="landing-worker">
          <ellipse
            cx="374"
            cy="292"
            rx="22"
            ry="8"
            fill="#34453d"
            opacity=".25"
          />
          <Sprite
            name="gus-work-front"
            x={326}
            y={201}
            width={96}
            columns={2}
            cellWidth={192}
            cellHeight={192}
            className="landing-work-a"
          />
          <Sprite
            name="gus-work-front"
            x={326}
            y={201}
            width={96}
            frame={1}
            columns={2}
            cellWidth={192}
            cellHeight={192}
            className="landing-work-b"
          />
        </g>
        <Sprite name="reception" x={142} y={253} width={95} />
        <Sprite name="workbench" x={344} y={296} width={100} />
        <Sprite name="team-trolley" x={508} y={374} width={80} columns={2} />
        <g className="landing-team-car">
          <ellipse
            cx="442"
            cy="407"
            rx="65"
            ry="17"
            fill="#34453d"
            opacity=".25"
          />
          <Sprite
            name="rustback"
            x={355}
            y={284}
            width={174}
            height={145}
            frame={1}
            columns={2}
            cellWidth={384}
            cellHeight={320}
          />
        </g>
        <Sprite name="circuit-desk" x={619} y={384} width={96} />
        <text
          x="48"
          y="581"
          fill="#f0eddf"
          fontSize="17"
          fontFamily="monospace"
        >
          PITLANE / THE FIRST GARAGE
        </text>
      </svg>
      <figcaption>
        <span>Scripted scene · shared game art</span>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
        >
          {paused ? "Resume animation" : "Pause animation"}
        </button>
      </figcaption>
    </figure>
  );
}
