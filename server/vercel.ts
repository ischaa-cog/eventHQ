import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "./app";

// Vercel function entry: the whole API as one function. The frontend is served as static files.
// The app is built once per function instance and reused across requests.
const appPromise = createApp().then(({ app }) => app);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await appPromise;
  app(req as any, res as any);
}
