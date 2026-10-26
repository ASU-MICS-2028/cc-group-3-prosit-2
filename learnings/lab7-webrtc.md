# WebRTC video call spike (Lab 7 Part C)

**Owner:** Perfect · **Last updated:** 2026-10-23 · **Status:** partly working (builds, tests pass, signaling checked locally; HTTPS/phone and the real call tests are not done yet)

> Write this for a teammate who will never open your code. Plain words.

## 1. In one sentence

A small web page plus a small server that lets two people see each other on video, so we can test whether a doctor and a patient could do a telemedicine call over real networks.

## 2. What I did, step by step

Everything is in `webrtc-spike/`, written in TypeScript (strict mode, like `backend/`) with React 19 + Vite (like the Prosit 1 PWA).
1. `src/shared/signaling.ts`: the list of messages the two browsers send each other, and a checker that rejects anything unexpected.
2. `src/server/`: the **signaling server** (Express + `ws`). It puts two people in a named room and passes their messages along. It never sees the video. `rooms.ts` holds the room rules (max 2 people) with no networking, so it is easy to test. It also serves the built page, so one address (and one tunnel) covers both `https://` and `wss://`.
3. `src/client/hooks/useCall.ts`: the React hook that asks for the camera, joins the room, sets up the call, reads stats every second, and releases the camera when you leave.
4. `src/client/lib/stats.ts`: turns the browser's raw stats into the numbers Lab 7 asks for (packet loss %, jitter, round-trip time, and whether the path is direct or relayed).
5. `src/client/components/` and `App.tsx`: the page (two video tiles, a stats panel, join/leave).
6. 16 automated tests (room rules, message checking, stats maths, call codes, heartbeat).
7. **Screen changes after team feedback (26 Oct):**
   - **Your own video is mirrored, the other person's is not**, like Zoom and Teams. Mirroring is only how *you* see yourself, done in CSS on your preview tile; the video that is sent is not flipped. Left and right matter in a health call ("the wound is on my left arm"), so the other person must see you as you really are. A "Mirror my video" checkbox turns it off.
   - **"Room name" is now "Call code"**, empty at the start, with a **Generate code** button (gives e.g. `hc-4821`) and a line explaining it. Capitals and spaces are ignored, so `Clinic 1` and `clinic-1` meet.
   - **Names:** you type "Your name" and the other tile shows their name instead of "Other person". Each browser puts its name in the offer/answer message it already sends, so the server did not change. Names are checked as untrusted input (text, at most 40 characters). Use a first name or role, never a real patient's name.

## 3. Why we did it this way

The handout's starter code is not in the repo, so I wrote the same shape: a Node WebSocket signaling server and a browser client with only a public STUN server. **No TURN on purpose**: if the cross-network call fails, that is the finding the lab wants. TypeScript and React match the rest of the project, so the call screen can later move into the PWA as a component.

## 4. How to check it works

```bash
cd webrtc-spike
npm install
npm run typecheck && npm test      # 10 tests pass
npm run build && npm start         # page + signaling on http://localhost:3000
```

Open `http://localhost:3000` in two browser tabs, same room name, press Join in both. Both videos should appear (`localhost` may use the camera without HTTPS). For development with hot reload, run `npm run dev:server` and `npm run dev:client` in two terminals and open the Vite address.

For a phone or another network you need HTTPS in front (phones refuse the camera on plain http), for example a Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3000   # prints an https://....trycloudflare.com address
```

**Or skip the tunnel: it's hosted** (added by Eugene, 2026-10-23, D-023). Open
**`https://call-hc.agroconnect.space`** on two phones or laptops, same room name, Join on both. It's the same code,
built with `webrtc-spike/Dockerfile` and run on one AWS server behind our load balancer, with a real certificate, so
phones allow the camera. Signaling checks against it (rooms, `wss://`, staying connected while idle) passed:
`evidence/lab7/outputs_C_signaling_hosted.txt`. Its infrastructure side is explained in `learnings/infra.md`.

Evidence goes in `evidence/lab7/` (file names are in PLAN.md).

## 5. What is NOT done, or is faked

- Not yet tried on a phone, through a tunnel, or across two networks (L7-C1 to C4). The camera path itself has not been exercised end to end by a human yet.
- No real numbers yet. Do not quote anything from this note in the report until section 8 is filled.
- Max two people per room, no login. Test use only, never real patient data.
- Not connected to appointments or the PWA.

## 6. What will bite us

- The camera needs `https://` (or `localhost`).
- Quick-tunnel addresses change every time you restart the tunnel. (The hosted address above doesn't.)
- **Idle connections:** load balancers and tunnels close a connection that's silent for ~60 s, and the signaling
  socket is silent while someone waits for the other person. The server now pings every socket every 25 s and closes
  any that stop answering (added by Eugene, tested in `src/server/heartbeat.test.ts`; 10 tests now).
- **The name, call-code and mirror changes are not live until Eugene rebuilds and redeploys the call image.** Until then `call-hc.agroconnect.space` still shows the old "Room name" screen.
- **The hosted page runs the image that was pushed, not the latest commit.** Merging a PR does **not** change the
  page. After a merge, ask Eugene to redeploy ("Shipping a change" in `infra/README.md`, about 2 minutes of downtime).
  To see which version is live, compare the page's script name: `curl -s https://call-hc.agroconnect.space/ | grep -o 'index-[^"]*js'`.
  Live since 26 Oct 12:56 UTC: `main` at `248ea83` (PR #15: mirrored self-view, call code, display names).
- `.npmrc` sets `legacy-peer-deps=true` because Vite 8 and `tsx` disagree about the esbuild version; without it `npm install` crashes.
- Without TURN, calls between some mobile carriers will probably fail. That is expected and reportable.

## 6b. Real call results (added by Joseph, 26 Oct)

Joseph ran the calls on the hosted page: Oyibi (Greater Accra) ↔ Ho (Volta) with Eugene, a call with Perfect, and his
own laptop ↔ phone on one Wi-Fi. Every reading is in [`evidence/lab7/outputs_C_call_stats.md`](../evidence/lab7/outputs_C_call_stats.md). In short:

- **Every call connected directly** (`srflx`, via the public STUN server). **No TURN relay was needed**, even across two
  ISPs ~120 km apart. Keep TURN in the production plan anyway: other carriers' NATs may block direct paths.
- **Same Wi-Fi still went out through the router** (`srflx ↔ prflx`, not `host ↔ host`), because Chrome hides local
  addresses. So "same network" wasn't much faster.
- **Under a bad connection WebRTC dropped frames (to 1–2 per second), not packets** (loss stayed ~0 %): adaptive bitrate.
- **Chrome DevTools "Slow 3G" doesn't throttle WebRTC media**, only web requests. So C4 throttled the whole Mac
  with macOS's built-in shaper (no install needed):
  `sudo dnctl pipe 1 config bw 400Kbit/s delay 150 plr 0.01`, then
  `printf 'dummynet in all pipe 1\ndummynet out all pipe 1\n' | sudo pfctl -f -` and `sudo pfctl -E`.
  **Undo:** `sudo pfctl -f /etc/pf.conf; sudo pfctl -d; sudo dnctl -q flush`. Check with `ping 1.1.1.1` before and after.
- **Throttled to ~3G (Joseph ↔ Elise):** round trip 157 → 735–947 ms, jitter 16 → 409–827 ms, video 31 → 5–7 fps then
  frozen, **call never dropped**. Over 3G, telemedicine should be audio-first.

## 7. Terms used

| Term | Plain meaning |
|---|---|
| WebRTC | Browser feature for live video/audio between two devices |
| Signaling | The "phone book" step where two browsers swap connection details before the call |
| STUN | A public server that tells your browser its public address |
| TURN | A relay server that carries the video when a direct connection is impossible (costs money) |
| Jitter | How uneven packet arrival times are (high jitter = choppy) |
| Packet loss | Share of video data that never arrived |
| RTT | Round-trip time: how long a message takes to go and come back |
| Heartbeat | A tiny "are you there?" message every 25 s that keeps an idle connection from being cut |

## 8. Lines ready for the report

_To fill in after the tests (L7-C3, L7-C4), with the real numbers._
