/** Keeps a value usable as a single key segment; '@' stays readable. */
function segment(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const keys = {
  user: (userId: string) => `users/${segment(userId)}.json`,
  userOrgs: (userId: string) => `users/${segment(userId)}/orgs.json`,
  oauth: (provider: string, providerUserId: string) => `idx/oauth/${segment(provider)}/${segment(providerUserId)}`,
  email: (email: string) => `idx/email/${segment(normalizeEmail(email))}`,
  invite: (email: string) => `idx/invite/${segment(normalizeEmail(email))}.json`,
  session: (tokenHash: string) => `auth/session/${segment(tokenHash)}.json`,
  refresh: (tokenHash: string) => `auth/refresh/${segment(tokenHash)}.json`,
  org: (orgId: string) => `orgs/${segment(orgId)}.json`,
  voice: (scope: { orgId: string; userId?: string }, month: string) =>
    scope.userId
      ? `voice/${segment(scope.orgId)}/u/${segment(scope.userId)}/${month}.json`
      : `voice/${segment(scope.orgId)}/${month}.json`,
  voicePrefix: (orgId: string) => `voice/${segment(orgId)}/`,
  usage: (orgId: string, day: string, userId: string) => `usage/${segment(orgId)}/${day}/${segment(userId)}.json`,
  usagePrefix: (orgId: string) => `usage/${segment(orgId)}/`,
};
