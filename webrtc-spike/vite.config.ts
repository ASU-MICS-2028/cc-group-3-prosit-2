import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, the page runs on Vite and the signaling server on :3000; proxy the
// WebSocket so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/ws": { target: "ws://localhost:3000", ws: true } } },
});
