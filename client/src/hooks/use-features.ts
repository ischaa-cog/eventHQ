import { useQuery } from "@tanstack/react-query";

export type Features = {
  aiGeneration: boolean;
  neoChat: boolean;
  email: boolean;
  googleDrive: boolean;
  metaOAuth: boolean;
};

// Optional features this deployment can run. Until loaded, everything counts as off,
// so a broken control never flashes on screen.
export function useFeatures(): Features {
  const { data } = useQuery<Features>({ queryKey: ["/api/features"], staleTime: 10 * 60_000 });
  return data ?? { aiGeneration: false, neoChat: false, email: false, googleDrive: false, metaOAuth: false };
}
