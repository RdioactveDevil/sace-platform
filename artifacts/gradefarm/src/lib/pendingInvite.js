// A tutor invite the student is signing up or signing in to accept. The invite
// page remembers it before sending them to /auth; once they're signed in, the
// app takes them back to it and it accepts itself (InviteScreen).

const KEY = 'gf-pending-invite'

/** Where to send someone to accept this invite: the invite page, accepting on arrival. */
export function inviteAcceptPath(token) {
  return `/invite/${encodeURIComponent(token)}?accept=1`
}

export function rememberPendingInvite(token) {
  try { localStorage.setItem(KEY, token) } catch {}
}

/** The remembered invite token, or null. */
export function pendingInvite() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(KEY) } catch {}
}
