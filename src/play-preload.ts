import { WALK_ASSETS } from "./scene/interior-character";
import { useEffect, useState } from "react";
import { loadGarageImage } from "./scene/garage-assets";
import { preloadCrew } from "./scene/gus-model";
import { preloadGarageSurface } from "./scene/garage-surface-asset";

import { PLAY_CITY } from "./play-art";
export { PLAY_CITY } from "./play-art";
const urls = [
  ...new Set([
    PLAY_CITY,
    "/art/garage-interior-v4.png",
    ...WALK_ASSETS.map((asset) => asset.url),
    ...["gus", "dash", "juno"].map(
      (name) => `/art/launch-${name}-portrait.webp`,
    ),
  ]),
];
export function usePlayPreload() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    done: 0,
    total: urls.length + 3,
    ready: false,
    error: "",
  });
  useEffect(() => {
    let cancelled = false,
      done = 0,
      next = 0;
    setState({ done: 0, total: urls.length + 3, ready: false, error: "" });
    const complete = () => {
      done++;
      if (!cancelled)
        setState({ done, total: urls.length + 3, ready: false, error: "" });
    };
    const worker = async () => {
      while (!cancelled && next < urls.length) {
        const url = urls[next++];
        await loadGarageImage(url);
        complete();
      }
    };
    void Promise.all([
      ...Array.from({ length: 6 }, worker),
      Promise.all([preloadCrew(), preloadGarageSurface()]).then(complete),
      import("./Garage3D").then(complete),
      Promise.all([
        document.fonts.load('800 italic 24px "Exo 2"'),
        document.fonts.load('500 24px "Barlow Condensed"'),
        document.fonts.load('400 24px "Barlow Condensed"'),
        document.fonts.load('900 italic 24px "Barlow Condensed"'),
      ]).then(complete),
    ]).then(
      () => {
        if (!cancelled)
          setState({ done, total: urls.length + 3, ready: true, error: "" });
      },
      () => {
        if (cancelled) return;
        cancelled = true;
        setState((prior) => ({
          ...prior,
          ready: false,
          error:
            "The garage could not finish loading. Check your connection and retry.",
        }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
