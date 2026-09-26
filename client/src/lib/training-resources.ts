export function vimeoPlayerUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash) return null;
    const match = u.hostname === "player.vimeo.com"
      ? /^\/video\/([0-9]+)\/?$/.exec(u.pathname)
      : u.hostname === "vimeo.com" ? /^\/([0-9]+)\/?$/.exec(u.pathname) : null;
    if (!match || Array.from(u.searchParams.keys()).some(key => key !== "h")) return null;
    const hash = u.searchParams.get("h");
    if (hash !== null && !/^[a-f0-9]+$/i.test(hash)) return null;
    return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}`;
  } catch {
    return null;
  }
}

// Shared items always precede client-specific items, so reordering one scope
// cannot unexpectedly shift lessons belonging to the other scope.
export function sortTrainingResources<T extends { isGlobal?: boolean; orderIndex?: number; id: string | number }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    Number(!!b.isGlobal) - Number(!!a.isGlobal) ||
    (a.orderIndex || 0) - (b.orderIndex || 0) ||
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
}