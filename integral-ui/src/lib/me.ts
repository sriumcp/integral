import type { Party } from '@/schema'

/**
 * Current-user identity, fetched from `/api/me` at app mount.
 *
 * The substrate carries identity in two shapes:
 *  - `MeIdentity` — narrow `{id, display_name}` form returned by the
 *    server. The wire payload doesn't carry `kind` because v0.1 has no
 *    agent-as-self use case.
 *  - `Party` — the schema's full `{id, kind, display_name}` form
 *    consumed by the AppHeader / lifecycle transitions / holder records.
 *
 * `meAsParty` is the boundary helper that lifts narrow → full by
 * baking in `kind: 'human'`. Keeping the lift at one site means
 * downstream code never has to specify `kind` — and a future v0.2
 * "agent-as-self" mode would change exactly one helper.
 */
export interface MeIdentity {
  id: string
  display_name: string
}

/**
 * Last-resort fallback when the server is unreachable (offline tests,
 * preview environments, transient errors). The server itself falls back
 * to the OS username before this is reached, so this generic literal
 * only surfaces when the browser can't get a response at all.
 */
export const FALLBACK_ME: MeIdentity = { id: 'user', display_name: 'user' }

export function meAsParty(me: MeIdentity): Party {
  return { id: me.id, kind: 'human', display_name: me.display_name }
}

/**
 * Fetch `/api/me`. Returns `FALLBACK_ME` on any failure (non-OK status,
 * malformed body, network error) so the app renders something legible
 * even when the server is down — the chip is decorative; failing to
 * resolve identity must not block surface render.
 */
export async function fetchMe(): Promise<MeIdentity> {
  try {
    const res = await fetch('/api/me')
    if (!res.ok) return FALLBACK_ME
    const body = (await res.json()) as { id?: unknown; display_name?: unknown }
    if (
      body &&
      typeof body.id === 'string' &&
      body.id.length > 0 &&
      typeof body.display_name === 'string' &&
      body.display_name.length > 0
    ) {
      return { id: body.id, display_name: body.display_name }
    }
    return FALLBACK_ME
  } catch {
    return FALLBACK_ME
  }
}
