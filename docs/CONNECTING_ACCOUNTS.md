# Connecting client accounts

There are three ways to connect a workspace's Meta, HighLevel, Stripe, Whop and Fanbasis accounts.
They live on **Integrations** for each workspace.

| Way | Covers | Who does it |
| --- | --- | --- |
| Agency login | Meta ad accounts and HighLevel sub-accounts | An admin, once for the whole agency. Then each workspace picks its account from a list. |
| Connect link | Stripe (sign in), Whop and Fanbasis (paste a key with step-by-step help) | The client, from a link the admin sends. No eventHQ login needed. The link works for 14 days. |
| Enter a key | Everything | An admin, on the Integrations page. |

The connect script (`script/connect-partners.ts`) still connects many workspaces at once from a credentials file.

## Agency logins

**Meta.** Choose one:
- Paste a system user token under Agency logins, then "Paste a system user token instead". This needs no Meta app here. The token must have `ads_read` and be assigned to the ad accounts.
- Or "Log in with Facebook". This needs `META_APP_ID` and `META_APP_SECRET` from a Meta app. In that app, add Facebook Login for Business and set the valid OAuth redirect URI to `https://<your domain>/api/oauth/meta/callback`. A personal login lasts about 60 days, and the page shows the date to log in again by.

**HighLevel.** "Log in with HighLevel" needs a HighLevel Marketplace app:
1. In the HighLevel developer portal, create an app. Choose a private app, target user Agency, and distribution Agency and Sub-account.
2. Add the scopes `forms.readonly`, `locations.readonly`, `oauth.readonly` and `oauth.write`.
3. Set the redirect URL to `https://<your domain>/api/oauth/highlevel/callback`.
4. Copy the client ID and secret into `HIGHLEVEL_CLIENT_ID` and `HIGHLEVEL_CLIENT_SECRET` in Vercel.
5. Log in with HighLevel, and install the app on the sub-accounts you want. Each workspace then picks its sub-account.

HighLevel tokens refresh by themselves. If the app is uninstalled, the login shows an error and the page asks you to log in again.

## Stripe sign-in through Composio

Composio runs the Stripe sign-in with its own Stripe app, so there is nothing to register with Stripe.
1. Create a Composio account and copy the project API key into `COMPOSIO_API_KEY` in Vercel.
2. That's it. The first sign-in creates the Stripe auth config in Composio automatically.

Composio keeps the Stripe token, and eventHQ never sees it. Stripe requests during sync go through Composio's proxy, and each request counts as a Composio tool call. A few thousand calls a month covers a handful of clients on the $29 plan.

## Settings

| Variable | Needed for |
| --- | --- |
| `COMPOSIO_API_KEY` | "Connect with Stripe" |
| `COMPOSIO_STRIPE_AUTH_CONFIG_ID` | Optional. Use a specific Composio auth config instead of the automatic one |
| `HIGHLEVEL_CLIENT_ID`, `HIGHLEVEL_CLIENT_SECRET` | "Log in with HighLevel" |
| `HIGHLEVEL_APP_ID` | Optional. The marketplace app id, if it is not the part of the client ID before the dash |
| `META_APP_ID`, `META_APP_SECRET` | "Log in with Facebook". Not needed when pasting a system user token |
| `META_OAUTH_SCOPES` | Optional. Defaults to `ads_read` |
