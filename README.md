# Sheep'll Be Right (양으로 살아보기)

Live as a cloud-shaped sheep on a New Zealand farm. Grow wool, roll to the woolshed, get shorn, and grow the national export total together.

## Run locally
```bash
cd server && npm install && npm run dev      # http://localhost:3001
cd client && npm install && npm run dev      # http://localhost:5173
```
Fast timers for testing: `GROW_MS=45000 MILK_MS=20000 HERD_MS=30000 TALLY_MS=40000 npm run dev` in `server` (wool, milk, sheepdog interval, vote count interval).

## Structure
- `server/src/index.ts` — farms and channels (30 sheep each), movement batching, shearing queue, wool/milk timers, export totals, farm fund and daily vote, sheepdog herding
- `server/src/shared.ts` — world size, farm list, build catalogue (imported by the client too)
- `server/src/store.ts` — saves state to Upstash Redis when configured, otherwise to a file
- `server/src/protocol.ts` — shared event types
- `client/src/main.ts` — game loop, networking, queue, milking
- `client/src/shear.ts` — swipe-to-shear minigame
- `client/src/sheepkit.js` — the cloud sheep model and wool growth
- `client/src/land.ts`, `moods.js` — the big farm (hills, woolshed, milking shed, pond, meadow, bush, lookout, port) and lighting
- `client/src/mapui.ts`, `dog.ts` — minimap, NZ map and voting panel; Bess the sheepdog
- `client/src/input.ts`, `hud.ts` — joystick/keyboard, HUD and speech bubbles

## Deploy
- Client (Vercel): root `client`, set `VITE_SERVER_URL` to the server URL.
- Server (Render, Singapore): root `server`, start `npm start`, set `CLIENT_ORIGIN` to the client URL.
- State (totals, fund, buildings, votes) is saved to Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set on the server. Without them it falls back to `server/data/state.json`, which Render's free disk wipes on redeploy.
- Vercel must keep "Include files outside the Root Directory" on, because the client imports `server/src/shared.ts`.

## Controls
Joystick or WASD/arrows to move, Space jump, B baa, N nuzzle, G graze, R rest. Add `?debug` to the URL for test hooks.
