// Signs in to the live eventHQ app once and remembers the session, for the scripts that work
// through its API (connect-partners.ts --api, verify-partners.ts).
import { homedir } from "os";

export async function ask(question: string, hidden = false): Promise<string> {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = (rl as any).output;
    (rl as any)._writeToOutput = (text: string) => { out.write(text.startsWith(question) ? question : text.includes("\n") ? "\n" : "*"); };
  }
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); }));
}

// Signs in once and keeps the session cookie in ~/.eventhq/session.json (readable only by you), so
// later runs (and script/verify-partners.ts) do not ask again until the session expires.
export async function apiSession(base: string): Promise<string> {
  const { existsSync, mkdirSync, readFileSync: read, writeFileSync, chmodSync } = await import("fs");
  const dir = `${homedir()}/.eventhq`;
  const file = `${dir}/session.json`;
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(read(file, "utf8"));
      if (saved.base === base && saved.cookie) {
        const check = await fetch(`${base}/api/clients`, { headers: { Cookie: saved.cookie, Accept: "application/json" } });
        if (check.ok) { console.log("Using your saved eventHQ sign-in."); return saved.cookie; }
      }
    } catch { /* sign in again */ }
  }
  const email = process.env.EVENTHQ_EMAIL || await ask("eventHQ admin email: ");
  const password = process.env.EVENTHQ_PASSWORD || await ask("Password: ", true);
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, portal: "admin" }) });
  if (!login.ok) throw new Error(`Login failed (${login.status}): ${(await login.text()).slice(0, 200)}`);
  const cookies = ((login.headers as any).getSetCookie?.() ?? [login.headers.get("set-cookie") ?? ""]) as string[];
  const cookie = cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ base, cookie, savedAt: new Date().toISOString() }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return cookie;
}


export function apiClient(base: string, cookie: string) {
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${json?.error ?? json?.message ?? text.slice(0, 200)}`);
    return json;
  };
}
