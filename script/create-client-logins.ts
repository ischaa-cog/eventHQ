// Creates one client-portal login per workspace, with a generated password.
// Dry run by default; pass --apply to create. Emails that already have a login are skipped.
// Run: npx tsx --env-file=.env script/create-client-logins.ts <logins.json> --agency <id> --out <credentials.csv> [--apply]
//
// <logins.json>: [{ "client": "<workspace name>", "aliases"?: [...], "email": "...", "firstName"?: "...", "lastName"?: "..." }]
// The CSV holds plain passwords: keep it out of the repo and share each login privately.
import { randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { storage } from "../server/storage";
import { passwordProblem } from "../server/passwords";

type LoginRow = { client: string; aliases?: string[]; email: string; firstName?: string; lastName?: string };

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--agency" && args[args.indexOf(a) - 1] !== "--out");
const apply = args.includes("--apply");
const agencyId = Number(args[args.indexOf("--agency") + 1]);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
if (!file || !out || !Number.isSafeInteger(agencyId) || agencyId <= 0) {
  console.error("Usage: npx tsx --env-file=.env script/create-client-logins.ts <logins.json> --agency <id> --out <credentials.csv> [--apply]");
  process.exit(1);
}

// Readable but strong: four groups of four from an alphabet without look-alike characters.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const generatePassword = () => Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("")).join("-");

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clients = await storage.getClients(agencyId);
const rows: LoginRow[] = JSON.parse(await readFile(file, "utf8"));
const credentials: string[][] = [["Client", "Email", "Password", "Login link", "Workspace status"]];
const loginUrl = "https://event-hq-steel.vercel.app/client-login";

for (const row of rows) {
  const email = row.email.trim().toLowerCase();
  const names = [row.client, ...(row.aliases ?? [])].map(normalize);
  const client = clients.find(c => names.includes(normalize(c.name)) ||
    (c.businessName && names.includes(normalize(c.businessName))));
  if (!client) { console.log(`SKIP ${row.client}: no workspace with that name in agency ${agencyId}`); continue; }
  if (await storage.getUserByEmail(email)) { console.log(`SKIP ${row.client}: ${email} already has a login`); continue; }
  const password = generatePassword();
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const status = client.isActive ? "active" : "inactive - login blocked until reactivated";
  console.log(`${apply ? "CREATE" : "[dry run] would create"} ${row.client} (#${client.id}): ${email} (${status})`);
  if (!apply) continue;
  await storage.createUserWithPassword({
    email,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    role: "agency_client",
    agencyId: client.agencyId,
    clientAccess: [client.id],
  }, password);
  credentials.push([client.name, email, password, loginUrl, status]);
}

if (apply && credentials.length > 1) {
  const csv = credentials.map(cols => cols.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  await writeFile(out, `${csv}\n`, { mode: 0o600 });
  console.log(`\nWrote ${credentials.length - 1} login(s) to ${out}. Passwords cannot be shown again, only reset.`);
} else if (!apply) {
  console.log("\nDry run only. Re-run with --apply to create these logins.");
}
process.exit(0);
