import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import localRelease from "./config/local.json" with { type: "json" };
import {
  publicRelease,
  RELEASE_ELEMENT_ID,
  serializePublicRelease,
} from "./shared/public-release.ts";
import { applyHead, DOCUMENT_PATHS, documentAsset } from "./shared/site.ts";
import type { ReleaseConfig } from "./shared/release.ts";
const releaseData = () =>
  `<script type="application/json" id="${RELEASE_ELEMENT_ID}">${serializePublicRelease(publicRelease(localRelease as ReleaseConfig))}</script>`;
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    {
      name: "public-documents",
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = new URL(req.url || "/", "http://localhost").pathname;
          if (
            req.method !== "GET" ||
            path.startsWith("/api/") ||
            /\.[a-z0-9]+$/i.test(path)
          )
            return next();
          try {
            const html = readFileSync(
              resolve(
                server.config.root,
                server.config.build.outDir,
                "." + documentAsset(path),
              ),
              "utf8",
            );
            res.statusCode = DOCUMENT_PATHS.includes(path)
              ? path === "/unavailable"
                ? 503
                : 200
              : 404;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(html.replace("</head>", releaseData() + "</head>"));
          } catch (error) {
            next(error);
          }
        });
      },
      transformIndexHtml(html, context) {
        if (!context.server) return html;
        return applyHead(
          html,
          context.originalUrl?.split("?")[0] || context.path,
        ).replace("</head>", releaseData() + "</head>");
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  preview: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    copyPublicDir: !isSsrBuild,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("/phaser/") ? "phaser" : undefined),
      },
    },
  },
}));
