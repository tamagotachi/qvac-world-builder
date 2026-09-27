// World Builder - an AI on YOUR machine (QVAC) invents a fictional world for your story or game.
// Rewrite any single section without losing the rest. Open http://localhost:3068 after starting.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The QVAC worker can be slow to start on some computers. Wait up to 3 minutes for it.
process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= "180000";
const { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } = await import("@qvac/sdk");

const PORT = 3068;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Step 1: load the AI model (downloads the first time, then it's cached) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };
async function startModel() {
  try {
    status.message = "Loading the AI model (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      onProgress: (p) => { const v = typeof p === "number" ? p : p?.percentage; if (typeof v === "number") status.percent = Math.round(v); },
    });
    status.ready = true; status.message = "AI world builder ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) { status.error = String(err?.message || err); console.error("Could not load model:", err); }
}

// One AI job at a time
let chain = Promise.resolve();
const enqueue = (job) => { const p = chain.then(job); chain = p.catch(() => {}); return p; };

function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > limit) { reject(new Error("Too big")); req.destroy(); } });
    req.on("end", () => resolve(data)); req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const clean = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

const TEXT_FIELDS = ["tagline", "geography", "climate", "peoples", "power", "conflict", "secret"];
const PLACE = { type: "object", properties: { name: { type: "string" }, about: { type: "string" } }, required: ["name", "about"], additionalProperties: false };
// QVAC "structured output": every world has the same sections.
const WORLD_SCHEMA = { type: "object", properties: { name: { type: "string" }, ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, { type: "string" }])), places: { type: "array", items: PLACE } }, required: ["name", ...TEXT_FIELDS, "places"], additionalProperties: false };
const GUIDE = `name: the world's name. tagline: one intriguing line. geography: 2 sentences about the land. climate: 1 or 2 sentences.
peoples: 2 sentences about who lives there. power: 2 sentences about its magic or technology. conflict: 2 sentences about the big problem or tension.
secret: 1 sentence that most inhabitants don't know. places: 3 memorable locations, each with a name and one sentence.`;
const SYSTEM_PROMPT = `You are a creative world builder for stories and games. Invent original, vivid, consistent worlds suitable for all ages. Reply with JSON only.\n${GUIDE}`;

async function ask(schemaName, schema, system, user) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // This is the QVAC call that runs the AI on-device
      const run = completion({ modelId, stream: true, history: [{ role: "system", content: system }, { role: "user", content: user }], responseFormat: { type: "json_schema", json_schema: { name: schemaName, schema } } });
      let out = "";
      for await (const event of run.events) if (event.type === "contentDelta") out += event.text;
      return JSON.parse(out);
    } catch (err) { console.error("World attempt failed:", err.message); }
  }
  return null;
}
const tidyPlaces = (p) => (Array.isArray(p) ? p : []).map((x) => ({ name: clean(x.name, 60), about: clean(x.about, 300) })).filter((x) => x.name).slice(0, 5);
function tidyWorld(r) { if (!r) return null; const w = { name: clean(r.name, 60), places: tidyPlaces(r.places) }; TEXT_FIELDS.forEach((f) => (w[f] = clean(r[f], 500))); return w.name && w.geography ? w : null; }

// ---- Step 2: the web server ----
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(path.join(__dirname, "public", "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, status);
    if (req.method === "POST" && req.url === "/api/world") {
      if (!status.ready) return json(res, 503, { error: "The AI world builder is not ready yet." });
      const b = JSON.parse(await readBody(req)), genre = clean(b.genre, 40) || "fantasy", seed = clean(b.seed, 200);
      const w = await enqueue(async () => tidyWorld(await ask("World", WORLD_SCHEMA, SYSTEM_PROMPT, `Genre: ${genre}.` + (seed ? `\nStarting idea: ${seed}` : ""))));
      return w ? json(res, 200, w) : json(res, 502, { error: "The AI couldn't build a world. Try again." });
    }
    // Rewrite ONE section, keeping it consistent with the rest of the world
    if (req.method === "POST" && req.url === "/api/section") {
      if (!status.ready) return json(res, 503, { error: "The AI world builder is not ready yet." });
      const b = JSON.parse(await readBody(req, 30000)), field = b.field, world = b.world || {}, genre = clean(b.genre, 40) || "fantasy";
      if (![...TEXT_FIELDS, "places"].includes(field)) return json(res, 400, { error: "Unknown section." });
      const summary = [`Name: ${clean(world.name, 60)}`, ...TEXT_FIELDS.filter((f) => f !== field).map((f) => `${f}: ${clean(world[f], 300)}`), field !== "places" ? `places: ${tidyPlaces(world.places).map((p) => p.name).join(", ")}` : ""].filter(Boolean).join("\n");
      const schema = field === "places" ? { type: "object", properties: { places: { type: "array", items: PLACE } }, required: ["places"], additionalProperties: false } : { type: "object", properties: { [field]: { type: "string" } }, required: [field], additionalProperties: false };
      const r = await enqueue(() => ask("Section", schema, `You are a creative world builder. Rewrite only the "${field}" section of this ${genre} world with a fresh idea that still fits everything else. Reply with JSON only.\n${GUIDE}`, `The world so far:\n${summary}\n\nOld ${field}: ${field === "places" ? tidyPlaces(world.places).map((p) => p.name).join(", ") : clean(world[field], 300)}\nWrite a new, different ${field}.`));
      const value = r && (field === "places" ? tidyPlaces(r.places) : clean(r[field], 500));
      return value && value.length ? json(res, 200, { value }) : json(res, 502, { error: "The AI couldn't rewrite that section. Try again." });
    }
    res.writeHead(404); res.end("Not found");
  } catch (err) { console.error(err); json(res, 500, { error: String(err?.message || err) }); }
});

// "127.0.0.1" means only YOUR computer can reach this app
server.listen(PORT, "127.0.0.1", () => console.log("Server running at http://localhost:" + PORT));
startModel();
