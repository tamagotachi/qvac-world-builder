# World Builder (QVAC)

Pick a genre (fantasy, sci-fi, steampunk, underwater, cozy village...), add an optional starting idea, and an **on-device AI** invents a whole fictional world: its name, tagline, geography, climate, peoples, magic or technology, the big conflict, a secret, and three places to visit. **Rewrite any single section** with ↻ while the rest stays the same, edit anything by typing on the map, and save or download your worlds.

It runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source AI SDK.
No API key, no cloud service, and what you type never leaves your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `completion` (with structured output via `responseFormat`), with the `LLAMA_3_2_1B_INST_Q4_0` model.

## Install

You need [Node.js](https://nodejs.org) 22 or newer and some free disk space for the model.

```bash
git clone https://github.com/misaki-codex/qvac-world-builder.git
cd qvac-world-builder
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3068** (the address, not the HTML file). The first start downloads the model.
While it loads, worlds are mixed from a built-in idea bank instead.

## How it works

- `/api/world` calls `completion` with a JSON schema for the whole world.
- `/api/section` sends the rest of the world as context and asks for just one new section, so rewrites stay consistent. The schema is built for that section alone.
- Downloads are Markdown (`.md`), ready for notes apps. Up to 30 saved worlds stay in your browser.
- The server listens on `127.0.0.1`, so only your own computer can reach it.

## Troubleshooting

If you see `RPC_INIT_TIMEOUT`, the QVAC worker was slow to start. `server.js` already waits 3 minutes.
Set `QVAC_RPC_INIT_TIMEOUT_MS` (milliseconds) before `npm start` to wait longer, and make sure no other
QVAC app is running at the same time. If you see `ERR_MODULE_NOT_FOUND`, delete the `node_modules` folder
and run `npm install` again (this usually means an install was interrupted, for example by a full disk).

## License

MIT
