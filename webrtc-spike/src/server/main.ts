import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 3000);
const staticDir = fileURLToPath(new URL("../../dist", import.meta.url));

createApp(staticDir).listen(port, () => {
  console.log(`signaling + page on http://localhost:${port}`);
});
