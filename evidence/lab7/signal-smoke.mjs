// Usage: node signal-smoke.mjs <ws-url>   (run from webrtc-spike/ so `ws` resolves)
import { createRequire } from "node:module";
const { WebSocket } = createRequire(process.cwd() + "/")("ws");
const url = process.argv[2];
const room = "smoke-" + Date.now();
const open = (name) => new Promise((res, rej) => {
  const s = new WebSocket(url); s.msgs = [];
  s.on("message", (d) => s.msgs.push(JSON.parse(d)));
  s.on("open", () => res(s)); s.on("error", rej); s.name = name;
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const a = await open("a"), b = await open("b"), c = await open("c");
a.send("not json"); a.send(JSON.stringify({ type: "bogus" }));
a.send(JSON.stringify({ type: "join", room })); await wait(300);
b.send(JSON.stringify({ type: "join", room })); await wait(300);
c.send(JSON.stringify({ type: "join", room })); await wait(300);
b.close(); await wait(500);
const ok = (cond, label) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) process.exitCode = 1; };
ok(JSON.stringify(a.msgs[0]) === '{"type":"joined","initiator":false}', "first joiner waits (initiator=false)");
ok(JSON.stringify(b.msgs[0]) === '{"type":"joined","initiator":true}', "second joiner starts the call (initiator=true)");
ok(JSON.stringify(c.msgs[0]) === '{"type":"full"}', "third joiner refused (full)");
ok(a.msgs.some((m) => m.type === "peer-left"), "first is told when the second leaves (peer-left)");
ok(a.readyState === WebSocket.OPEN, "garbage messages ignored, socket still open");
a.close(); c.close();
