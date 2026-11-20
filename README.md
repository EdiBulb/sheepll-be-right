# Sheep'll Be Right (양으로 살아보기)

Live as a cloud-shaped sheep on a New Zealand farm. Grow wool, roll to the woolshed, get shorn, and grow the national export total together.

## Run locally
```bash
cd server && npm install && npm run dev      # http://localhost:3001
cd client && npm install && npm run dev      # http://localhost:5173
```
Fast wool for testing: `GROW_MS=45000 MILK_MS=20000 npm run dev` in `server`.

## Structure
- `server/src/index.ts` — channels (30 sheep each), movement batching, shearing queue, wool/milk timers, export totals
- `server/src/protocol.ts` — shared event types
- `client/src/main.ts` — game loop, networking, queue, milking
- `client/src/shear.ts` — swipe-to-shear minigame
- `client/src/sheepkit.js` — the cloud sheep model and wool growth
- `client/src/world.js`, `moods.js` — farm scene and lighting
- `client/src/input.ts`, `hud.ts` — joystick/keyboard, HUD and speech bubbles

## Deploy
- Client (Vercel): root `client`, set `VITE_SERVER_URL` to the server URL.
- Server (Render, Singapore): root `server`, start `npm start`, set `CLIENT_ORIGIN` to the client URL.
- Export totals are saved to `server/data/state.json`. Render's free disk is wiped on redeploy, so move this to Redis (e.g. Upstash) before public launch.

## Controls
Joystick or WASD/arrows to move, Space jump, B baa, N nuzzle. Add `?debug` to the URL for test hooks.
