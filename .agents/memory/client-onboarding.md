---
name: Client onboarding ownership
description: Why EventHQ uses its own onboarding form and a completed setup view
---

Use a first-party onboarding experience tied to the client profile, then show the saved details in a read-only completion view with an edit path.

**Why:** The former embedded survey returned a 404 and did not sync answers into EventHQ. The user chose a built-in form so the application can save and show the answers after onboarding.

**How to apply:** When expanding intake questions, store and validate them in EventHQ before showing them in the completion summary. Do not silently switch back to an external survey that cannot populate the profile.