import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // lets a Cloudflare quick tunnel (https) reach the dev server, so the phone can test fingerprint unlock
  server: { allowedHosts: [".trycloudflare.com"] },
  test: { environment: "jsdom", globals: true, css: false },
});
