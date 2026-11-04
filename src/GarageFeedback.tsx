import { useEffect, useRef, useState } from "react";
import type { Garage } from "../packages/game-core";
import {
  CompletionCursor,
  type CompletionFeedback,
} from "./scene/completion-feedback";

export default function GarageFeedback({ state }: { state: Garage }) {
  const cursor = useRef(new CompletionCursor());
  const generation = useRef(state.progress.generation);
  const [notices, setNotices] = useState<
    (CompletionFeedback & { expires: number })[]
  >([]);
  useEffect(() => {
    if (generation.current !== state.progress.generation) {
      generation.current = state.progress.generation;
      setNotices([]);
    }
    const fresh = cursor.current.consume(state, !document.hidden);
    if (fresh.length)
      setNotices((old) =>
        [
          ...old,
          ...fresh.map((item) => ({ ...item, expires: Date.now() + 5000 })),
        ].slice(-3),
      );
  }, [state]);
  useEffect(() => {
    if (!notices.length) return;
    const timer = window.setTimeout(
      () =>
        setNotices((old) => old.filter((item) => item.expires > Date.now())),
      Math.max(
        0,
        Math.min(...notices.map((item) => item.expires)) - Date.now(),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [notices]);
  useEffect(() => {
    const clear = () => {
      if (document.hidden) setNotices([]);
    };
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  return (
    <div
      className="garage-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {notices.map((item) => (
        <p key={item.id} className={item.reward ? "reward" : ""}>
          {item.text}
        </p>
      ))}
    </div>
  );
}
