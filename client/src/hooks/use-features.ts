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

// Neo AI is out of the menus and chat bubble for everyone until it passes its test set
// (NEO_FOR_CLIENTS=1 brings it back). The server also blocks client and demo logins; the agency
// team can still open the Neo pages by their address to test it.
export function useNeoVisible(user: { role?: string | null; id?: string | null } | null | undefined): boolean {
  const { neoForClients } = useFeatures();
  return !!user && neoForClients;
}
