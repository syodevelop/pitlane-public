import { useEffect, useRef, useState } from "react";
import {
  CAMERA_RANGES,
  DEFAULT_GARAGE_CAMERA,
  type GarageCameraSettings,
} from "./scene/garage-camera";
import "./garage-camera-controls.css";

const fields = [
  ["tilt", "Tilt", "°"],
  ["yaw", "Rotation", "°"],
  ["zoom", "Zoom", "×"],
  ["offsetX", "Left / right", ""],
  ["offsetZ", "Near / far", ""],
  ["targetHeight", "Target height", ""],
] as const;

export default function GarageCameraControls({
  settings,
  onChange,
  saved,
  getPosition,
  variant,
  open: controlledOpen,
  onOpenChange,
}: {
  settings: GarageCameraSettings;
  onChange: (settings: GarageCameraSettings) => void;
  saved: boolean;
  getPosition: () => { x: number; y: number };
  variant?: "workshop";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false),
    [copied, setCopied] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [showExport, setShowExport] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open && variant === "workshop")
      panel.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
  }, [open, variant]);
  const toggle = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  const change = (next: GarageCameraSettings) => {
    setCopied(false);
    onChange(next);
  };
  const close = () => {
    trigger.current?.focus({ preventScroll: true });
    toggle(false);
  };
  const exported = JSON.stringify(settings, null, 2);
  return (
    <div
      className={`garage-camera-tools${variant === "workshop" ? " workshop-camera" : ""}`}
    >
      <button
        className="garage-camera-trigger"
        ref={trigger}
        aria-label="Camera"
        title="Camera settings"
        aria-expanded={open}
        aria-controls="garage-camera-panel"
        onClick={() => (open ? close() : toggle(true))}
      >
        {variant === "workshop" && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 5 9.5 3h5L16 5h4a1 1 0 0 1 1 1v13H3V6a1 1 0 0 1 1-1h4Z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
        <span>Camera</span>
      </button>
      {open && (
        <section
          ref={panel}
          id="garage-camera-panel"
          className="garage-camera-panel"
          data-camera-controls
          aria-label="Camera settings"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="garage-camera-title">
            <h2>Camera settings</h2>
            <button onClick={close} aria-label="Close camera settings">
              Close
            </button>
          </div>
          <p>
            {variant === "workshop"
              ? "Your shift is paused. Adjust the view, then close to keep playing."
              : "Adjust the view, then walk around to try it."}
          </p>
          <div className="garage-camera-fields">
            {fields.map(([key, label, unit]) => (
              <label key={key} htmlFor={`camera-${key}`}>
                <span>
                  {label}
                  <output htmlFor={`camera-${key}`}>
                    {settings[key].toFixed(
                      key === "tilt" || key === "yaw" ? 0 : 2,
                    )}
                    {unit}
                  </output>
                </span>
                <input
                  id={`camera-${key}`}
                  aria-label={label}
                  type="range"
                  min={CAMERA_RANGES[key][0]}
                  max={CAMERA_RANGES[key][1]}
                  step={CAMERA_RANGES[key][2]}
                  value={settings[key]}
                  onChange={(e) =>
                    change({ ...settings, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <label className="garage-camera-follow">
            <input
              type="checkbox"
              checked={settings.follow}
              onChange={(e) => {
                const p = getPosition();
                change({
                  ...settings,
                  follow: e.target.checked,
                  anchorX: p.x,
                  anchorY: p.y,
                });
              }}
            />{" "}
            Follow player
          </label>
          <div className="garage-camera-actions">
            <button
              onClick={async () => {
                setShowExport(true);
                try {
                  await navigator.clipboard.writeText(exported);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              Copy settings
            </button>
            <button
              onClick={() => {
                change({ ...DEFAULT_GARAGE_CAMERA });
                setShowExport(false);
              }}
            >
              Reset view
            </button>
          </div>
          <p className="garage-camera-status" role="status">
            {copied
              ? "Copied. Paste these settings in the chat."
              : saved
                ? "Saved in this browser."
                : "Browser storage is unavailable. Copy settings to keep them."}
          </p>
          {showExport && (
            <label className="garage-camera-export">
              Camera settings to share
              <textarea
                readOnly
                aria-label="Camera settings to share"
                value={exported}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
