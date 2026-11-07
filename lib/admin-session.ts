// Fælles for admin-layout, login-ruten, isAdmin() og middleware.ts.
// Ingen Node-afhængigheder, så den kan køre i middleware (Edge).

export const ADMIN_COOKIE = 'kmb-session'

export function adminPassword(): string {
  return process.env.DASHBOARD_PASSWORD ?? 'KMB3000'
}

export function isAdminCookie(value: string | undefined): boolean {
  return !!value && value === adminPassword()
}
