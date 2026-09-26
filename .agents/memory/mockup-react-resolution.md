---
name: Mockup React resolution
description: An environment-specific cause of invalid React hooks in canvas component previews.
---

The mockup sandbox can resolve React from both its own dependency root and the main workspace root. Keep the sandbox renderer and preview components on one React/ReactDOM instance; use Vite dependency deduplication when resolution paths diverge.

**Why:** A preview can type-check but fail at runtime with a null hook dispatcher in its own renderer when the two roots have different React releases. The failure may appear unrelated to the component being previewed.

**How to apply:** If a sandbox preview reports invalid hooks or a null `useState` dispatcher, inspect resolved package roots before rewriting the component. Verify through the sandbox's own port, not the main app's port.