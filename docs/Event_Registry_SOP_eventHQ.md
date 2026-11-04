# Event Registry SOP (eventHQ version)

This replaces the Google Sheet SOP. Same idea: every event needs its dates, its page link and its product names. You now fill them in eventHQ, picking names and links from a list instead of copying them.

## Who does what

| Who | What | When | How long |
| --- | --- | --- | --- |
| Person who books the event | Posts it in #new-events | When it's booked | 30 sec |
| VA | Adds the event in eventHQ | Within 1 day | 3 min |
| VA | Monday check | Every Monday | 15 min |

Copy this into #new-events:

```
Client:
Event name:
Small or big event (if small, which big event is it for):
Ads start / Event dates / Cart open / Cart close / Post-cart end:
Page link(s):
What we're selling:
```

## Set up a client (once)

1. Open the client's workspace → **Event Results** → the settings button (top right).
2. Enter the **client code** (2–3 letters, e.g. `CA`).
3. Pick the client's usual **VIP, Platinum, main offer and post-cart products** from the list.
4. For payment plans, add the **full plan value** (e.g. AI Agents 6-Pay = 5000).

## Add a new event

1. **Event Results** → **Add event**.
2. Name, **Main** or **Mini**. For a Mini, pick the Main it feeds into.
3. Fill the event start and end dates.
4. **Page links:** pick from the list, or paste the page people see (not the editor). UTMs don't matter.
5. Tap **Fill dates from ads**. It sets the other four dates from when the ads ran:
   - **Ads start** and **cart open:** the first day ads spent on those pages, so ticket and VIP sales during the ad run count.
   - **Cart close:** 7 days after the last event day (the open/close cart sequence).
   - **Post-cart end:** 30 more days, for sales team follow-up calls.
   Check them, and change any that are wrong. The 7 and 30 can be changed per client in settings.
6. **Products:** leave a tier empty to use the client's usual product. Only fill it if this event sells something different.
7. Two events running ads at the same time to the same page? Add their **campaign IDs**.
8. Save. The event gets its ID (like `CA-2611-MINI`) and its numbers fill in.
9. Selling extra things? Open the event → **Event offers** → add each offer, its exact product names and our share %.

## Keep it up to date

- **The day after cart closes:** check the dates and offers on the event.
- **Every Monday:** Event Results → **Unmatched**. Each line is something no event claims. Tap **Add … to an event** and pick the right one. Check **Conflicts** too.
- **When there's time:** the **By date only** tab lists sales, ads and opt-ins that already count toward an event because of its dates, but whose product or page isn't on its list. Adding them to the right tier makes the VIP / Platinum / offer numbers exact. Nothing there is missing from revenue.

| You see | Fix |
| --- | --- |
| Ad spend says $0 | Add the page link the ads go to |
| Sales look too low | Add the product from the Unmatched list |
| Main event total looks small | On the Mini, pick the Main in "Feeds into" |
| Late sales missing | Push Post-cart end later, or raise the follow-up days in settings |

Never rename ads, pages or products to make them match; add them to the event instead.
