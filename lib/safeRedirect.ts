/**
 * Validates client-controlled redirect targets (e.g. ?next=).
 * Only same-origin relative paths are allowed — never external URLs.
 */
export function getSafeInternalPath(
  candidate: string | null | undefined,
  fallback = "/app"
): string {
  if (!candidate) return fallback;

  const value = candidate.trim();
  if (!value) return fallback;

  // Protocol-relative and absolute URLs
  if (value.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;

  // Must be an absolute path on this origin
  if (!value.startsWith("/")) return fallback;

  // Block path tricks that can escape to another host in some browsers
  if (value.includes("\\") || value.includes("@")) return fallback;

  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    if (url.username || url.password) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
