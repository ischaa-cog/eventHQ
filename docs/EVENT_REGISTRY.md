# Event Registry: how event numbers are computed

The Event Registry lives inside eventHQ, on the **Event Results** page of each workspace. It replaces the Google Sheet described in the original SOP: the same fields, rules and Monday check, without copy-paste. Product names and page links are picked from what was actually synced.

## What an event holds

| Field | Used for |
| --- | --- |
| Size: Main or Mini, and the Main a Mini feeds into | Main totals include their Minis |
| Ads start, event start/end, cart open, cart close, post-cart end | Date windows (New York time) |
| Page links (the page people see) | Matching ad spend and opt-ins |
| VIP, Platinum, main offer, post-cart products | Matching sales; empty means the client's usual product |
| Ad campaign IDs (only when two events run at once) | Ad spend matches these instead of page links |
| Event offers: product names and our share % | Extra things sold at the event |

**Fill dates from ads** suggests the windows from data (server/registry/dates.ts). Ads start and cart open are the first day ads spent on the event's pages within 60 days before it, so ticket sales during the ad run count. If no ads are found, cart open is the first event day. Cart close is the last event day plus 7 days, the open/close cart sequence. Post-cart end is cart close plus 30 days, for sales team follow-up. Event results show the revenue split as "During launch" (cart open to cart close) and "Sales team follow-up" (after cart close). Each workspace can change the 7, 30 and 60 in settings.

Each workspace also has a **client code** (used in Event IDs like `CA-2611-MINI`; a second Mini in the same month becomes `CA-2611-MINI-2`), **usual products** per tier, and **full plan values** for payment-plan products.

## Matching rules (server/registry/match.ts)

Nothing is matched by guessing from names.

| Data | Belongs to an event when |
| --- | --- |
| Ad spend, impressions, clicks | The ad's landing page is one of the event's page links (or its campaign is listed), and the day is between Ads Start and Cart Close |
| Opt-ins (HighLevel form submissions) | Submitted on one of the event's page links between Ads Start and Cart Close |
| Sales | Product name is in the event's tier products or offers (exact, case-insensitive), paid between Cart Open and Post-Cart End |
| Plan installments | A later payment of the same product by a buyer who bought it during the event stays with that event |
| Refunds | Follow their original payment |
| Overlaps | Go to the event with the latest Cart Open on or before the date, and are flagged as conflicts |

URLs are compared after removing `https://`, `www.`, query strings (UTMs), `#` fragments and trailing slashes. Every sync and every registry change re-runs the matcher for that workspace.

## Numbers per event (server/registry/metrics.ts)

Ad spend, impressions, clicks, CPM, CPC, opt-ins, opt-in rate (opt-ins per ad click), cost per opt-in, sales by tier (count and $), each offer's sales and our share, contracted revenue (full plan value once per buyer and product), collected revenue, refunds, net revenue, ROAS (net ÷ ad spend), cart-open vs post-cart split, and buyers counted once by email across platforms. Main events show their own numbers and the total with their Minis.

Anything that matches no event, or more than one, appears on **Unmatched** (Event Results → Unmatched), grouped by raw product name, page link or campaign. One tap adds the missing name or link to an event.

Neo answers event questions from these computed tables only, names the Event ID and dates it used, and asks when more than one event fits.

## Data sources

| Source | What it gives | Connection |
| --- | --- | --- |
| Meta Ads | Daily spend per ad, with each ad's landing page | Integrations → Meta Ads (token + ad account ID) |
| Whop | Payments and refunds | Company API key with payment read permission |
| Stripe | Charges and refunds, product names from Stripe products | Restricted key (read charges, refunds, checkout sessions, invoices, products) |
| Fanbasis | Transactions and refunds | API key |
| HighLevel | Opt-ins with the page they came from | Private integration token + location ID |

Meta and HighLevel can also use one agency login for every workspace, and clients can connect Stripe, Whop and Fanbasis themselves from a connect link. See [CONNECTING_ACCOUNTS.md](CONNECTING_ACCOUNTS.md).

`script/connect-partners.ts` connects many workspaces at once from a credentials file and a mapping file (see the comment at the top of the script).

## Settings

| Variable | Needed | What for |
| --- | --- | --- |
| `DATABASE_URL`, `SESSION_SECRET` | Yes | Database and sign-in. Integration keys are encrypted with a key derived from `SESSION_SECRET` until `CREDENTIALS_KEY` is set |
| `CREDENTIALS_KEY` | Recommended | Dedicated key for encrypting integration secrets |
| `REGISTRY_TIMEZONE` | No | Time zone for event date windows (default `America/New_York`) |
| `CRON_SECRET` | Recommended | Protects the daily sync endpoint |
| `APP_URL` | No | Public address, if not the Vercel production domain |
| `RESEND_API_KEY`, `MAIL_FROM` | For email | Invite and password-reset emails |
