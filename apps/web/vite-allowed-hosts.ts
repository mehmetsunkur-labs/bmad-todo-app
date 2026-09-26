/**
 * Extra host names the Vite dev server accepts, from DEV_ALLOWED_HOSTS
 * (comma-separated). Entries are trimmed, lowercased (browsers send host
 * names in lowercase, and Vite compares them as given) and empties dropped. An empty list
 * means Vite's defaults (localhost and IP addresses only); never `true`, which
 * would turn off Vite's DNS-rebinding guard.
 */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}
