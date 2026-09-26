---
name: GitHub publication history
description: Why the public repository does not share the local Git ancestry
---

The public GitHub repository was initialized as a clean source snapshot rather than pushing the existing local Git history. Future GitHub updates should preserve its current branch and avoid force-pushing the local history.

**Why:** The local tracked legacy archive includes a nested old Git directory with extensive historical objects. A normal push of local ancestry would publish that archive and its history even if a later commit deletes the file. The snapshot excludes the archive but includes current source and required assets.

**How to apply:** Before future uploads, compare current local files to the GitHub tree and update the GitHub branch without replacing its ancestry. If transitioning to ordinary Git pushes, explicitly reconcile the two unrelated histories in a safe branch; never force-push the local branch into the public repository without reviewing its past objects.