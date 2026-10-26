# Lab 7 Part C: real call stats (26 Oct 2026)

Calls on `https://call-hc.agroconnect.space` (Perfect's call page, hosted by Eugene). Stats are read live by the page
from `RTCPeerConnection.getStats()` and shown under "Live stats". The full screenshots (with our faces) are in the
team Drive, `prosit 2/Labs/lab7/screenshots/`; this repo keeps only the stats panels (`*-stats.png`), because it is public.

| Time (GMT) | Test | Path (candidate pair) | Round trip | Video packet loss | Jitter | FPS |
|---|---|---|---|---|---|---|
| 08:11:17 | C3 cross-network: Joseph (Oyibi, Greater Accra) ↔ Eugene (Ho, Volta), room `joegene` | srflx ↔ srflx | 192 ms | 0.00 % (0/416) | 15 ms | 25 |
| 08:11:36 | C3 cross-network | srflx ↔ srflx | 176 ms | 0.00 % (0/918) | 52 ms | 23 |
| 08:11:58 | C3 cross-network (bad moment) | srflx ↔ srflx | **679 ms** | 0.00 % (0/1080) | 81 ms | **1** |
| 08:12:37 | C3 cross-network | srflx ↔ srflx | 144 ms | 0.00 % (0/2420) | 88 ms | 14 |
| 08:13:26 | C3 cross-network | srflx ↔ srflx | 138 ms | 0.03 % (2/6166) | 29 ms | 25 |
| 08:18:40 | C3 cross-network (bad moment) | srflx ↔ srflx | **373 ms** | 0.02 % (4/21627) | **172 ms** | **2** |
| 08:29:04 | Joseph ↔ Perfect, room `perseph` (different homes; locations not recorded) | srflx ↔ srflx | 247 ms | 2.04 % (47/2259) | 44 ms | 30 |
| 08:32:27 | Joseph ↔ Perfect | srflx ↔ srflx | 63 ms | 1.39 % (274/19375) | 9 ms | 30 |
| 08:34:45 | C2 same network: Joseph's laptop ↔ his phone, same Wi-Fi, room `test` | srflx ↔ prflx | 157 ms | 0.00 % (0/2222) | 18 ms | 30 |
| 08:34:54 | C2 same network | srflx ↔ prflx | 78 ms | 0.00 % (0/3707) | 11 ms | 30 |

## What it shows

- **No relay was needed, even between two homes ~120 km apart on different ISPs.** Every call connected directly:
  `srflx` means each side's public address, found through the public STUN server. Lab 7 warns most mobile carrier NATs
  block this; ours didn't. It may on other networks, so production still needs a TURN relay as a fallback (cost: L7-H3).
- **Same network still went out through the router.** A purely local call shows `host ↔ host`. Ours showed
  `srflx ↔ prflx`: Chrome hides local IP addresses (mDNS), so the two devices met through the router's public
  address. That's why the same-room call (78–157 ms) was barely faster than Oyibi ↔ Ho (138–192 ms on good moments).
- **When the connection got worse, WebRTC dropped frames, not packets.** At 08:11:58 and 08:18:40 the round trip
  rose to 679 and 373 ms and frames fell to 1–2 per second, while packet loss stayed near 0 %. That's adaptive bitrate
  doing its job: sacrifice smoothness, keep the call alive. Audio wasn't measured.

## What this does NOT show

- **Slow 3G throttling (C4) is unproven.** Chrome DevTools network throttling only slows normal web traffic (page loads,
  the signaling WebSocket), **not** WebRTC's media stream, and DevTools isn't visible in the screenshots. The two bad
  moments above were most likely real network dips. To re-run C4 properly: throttle the whole computer with macOS
  Network Link Conditioner (Apple's "Additional Tools for Xcode", profile "3G"), or put a phone on 3G/2G in its mobile
  settings, and keep that setting visible in the screenshot.
