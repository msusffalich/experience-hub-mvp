import { createServer } from "node:http";
import { createVibeApiV2, validateVibeApiV2Runtime } from "./src/app.mjs";

const config = validateVibeApiV2Runtime();
const api = createVibeApiV2({ config });
const host = process.env.HOST || "0.0.0.0";

const server = createServer(async (req, res) => {
  const handled = await api.handle(req, res);
  if (!handled && !res.writableEnded) {
    res.writeHead(404, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ error: "not_found" }));
  }
});

server.listen(config.port, host, () => {
  console.log(`Vibe API 2 listening on http://${host}:${config.port}/api/v2/health/live`);
});
