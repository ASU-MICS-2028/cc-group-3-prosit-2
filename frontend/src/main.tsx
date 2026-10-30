import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// Offline start: only in the real build (in development the dev server and a saved copy would fight).
// Browsers allow a service worker only on https or localhost.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* the app still works online */ }); });
}
