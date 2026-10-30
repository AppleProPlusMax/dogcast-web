export function shouldRefreshOnUnauthorized(options: { allowRefresh: boolean; auth: boolean; guest: boolean }) {
  return options.allowRefresh && options.auth && !options.guest
}
