// Admins have the same full access as the original owner account. The shared demo admin
// (id "demo-client:…") is excluded so a public demo login never reaches real client data.
export function hasFullAccess(user: { role?: string | null; id?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user.role === "agency_admin" && !String(user.id ?? "").startsWith("demo-client:");
}
