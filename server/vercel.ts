import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "./app";

// Vercel function entry: the whole API as one function. The frontend is served as static files.
// The app is built once per function instance and reused across requests.
// A failed start (e.g. the database was briefly unreachable) is retried on the next request
// instead of being cached for the life of the instance.
let appPromise: ReturnType<typeof start> | undefined;
function start() {
  return createApp().then(({ app }) => app);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  appPromise ??= start();
  let app;
  try {
    app = await appPromise;
  } catch (error) {
    appPromise = undefined;
    console.error("[vercel] app failed to start:", error);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Service temporarily unavailable. Try again shortly." }));
    return;
  }
  app(req as any, res as any);
}
