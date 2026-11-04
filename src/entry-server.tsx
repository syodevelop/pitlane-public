import { renderToString } from "react-dom/server";
import App from "./App";
export function render(path: string) {
  return renderToString(<App initialPath={path} />);
}
