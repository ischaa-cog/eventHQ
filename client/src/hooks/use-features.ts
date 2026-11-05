import { useQuery } from "@tanstack/react-query";

export type Features = {
  aiGeneration: boolean;
  neoChat: boolean;
  neoForClients: boolean;
  email: boolean;
  googleDrive: boolean;
  metaOAuth: boolean;
};

// Optional features this deployment can run. Until loaded, everything counts as off,
// so a broken control never flashes on screen.
export function useFeatures(): Features {
  const { data } = useQuery<Features>({ queryKey: ["/api/features"], staleTime: 10 * 60_000 });
  return data ?? { aiGeneration: false, neoChat: false, neoForClients: false, email: false, googleDrive: false, metaOAuth: false };
}

// Neo AI is hidden from client (and demo) logins until it passes its test set; the agency team
// always sees it. The server enforces the same rule.
export function useNeoVisible(user: { role?: string | null; id?: string | null } | null | undefined): boolean {
  const { neoForClients } = useFeatures();
  if (!user) return false;
  const clientSide = user.role === "agency_client" || String(user.id ?? "").startsWith("demo-client:");
  return clientSide ? neoForClients : true;
}
