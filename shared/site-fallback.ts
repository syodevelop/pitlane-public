import {
  errorPageMarkup,
  errorPageStyles,
  type ErrorPageKind,
  type StatusPageKind,
} from "./error-page.ts";

function statusDocumentHtml(kind: StatusPageKind, metadata: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata}<meta name="theme-color" content="#222126"><link rel="icon" href="/favicon.ico?v=transparent-2"><style>${errorPageStyles}</style></head><body>${errorPageMarkup(kind)}</body></html>`;
}

export function errorDocumentHtml(kind: ErrorPageKind) {
  return statusDocumentHtml(
    kind,
    '<meta name="robots" content="noindex,nofollow"><title>Pitlane</title>',
  );
}

export function fallbackHtml(offline = false) {
  return errorDocumentHtml(offline ? "offline" : "unavailable");
}
