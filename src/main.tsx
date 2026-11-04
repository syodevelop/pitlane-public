import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { SiteErrorBoundary } from "./SiteError";
import {
  readPublicRelease,
  RELEASE_ELEMENT_ID,
} from "../shared/public-release";
const root = document.getElementById("root")!;
const tree = (
  <React.StrictMode>
    <SiteErrorBoundary>
      <App
        initialPath={window.location.pathname}
        release={readPublicRelease(
          document.getElementById(RELEASE_ELEMENT_ID)?.textContent,
        )}
      />
    </SiteErrorBoundary>
  </React.StrictMode>
);
if (root.hasAttribute("data-prerendered")) hydrateRoot(root, tree);
else createRoot(root).render(tree);
document.documentElement.dataset.appReady = "true";
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
