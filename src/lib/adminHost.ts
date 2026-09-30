// The admin portal lives on its own host, admin.zarketplace.com, served by the
// same app. On that host the app renders the console as its home, in dark
// mode, with the shop reachable only as a preview; on the shop's host, /admin
// sends an operator across to it.
//
// The shop's host keeps /admin working until VITE_ADMIN_ORIGIN is set, which
// is done once the admin subdomain resolves. Setting it before then would send
// every operator to a host that does not exist yet.
//
// Locally, http://admin.localhost:<port> is the admin host (browsers resolve
// *.localhost to this machine).

export const ADMIN_ORIGIN: string | null = (import.meta.env.VITE_ADMIN_ORIGIN as string | undefined)?.replace(/\/$/, '') || null;

export const isAdminHost: boolean =
  typeof window !== 'undefined' && /^admin\./i.test(window.location.hostname);

/** Where "Admin" links go: the admin host when it exists, this host's /admin otherwise. */
export function adminHref(path = '/admin'): string {
  return ADMIN_ORIGIN && !isAdminHost ? `${ADMIN_ORIGIN}${path}` : path;
}
