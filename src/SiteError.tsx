import { Component, type ReactNode } from "react";
import { errorPageMarkup, errorPageStyles } from "../shared/error-page";
export function SiteError({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <>
      <style>{errorPageStyles}</style>
      <div
        dangerouslySetInnerHTML={{
          __html: errorPageMarkup(unavailable ? "unavailable" : "not-found"),
        }}
      />
    </>
  );
}
export class SiteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <SiteError unavailable /> : this.props.children;
  }
}
