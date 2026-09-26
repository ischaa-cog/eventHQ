import { serveStatic } from "./static";
import { seedTrainingCatalog } from "./training-catalog";
import { createApp, log } from "./app";

// Long-running server for local development and non-serverless hosting. Vercel uses server/vercel.ts instead.
(async () => {
  await seedTrainingCatalog();
  const { app, httpServer } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: process.platform !== "win32", // not supported on Windows
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
