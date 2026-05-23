import type { Party } from '@/schema'
import styles from './PartyChip.module.css'

export interface PartyChipProps {
  party: Party
  /** When true, drop the chip's background and border so the chip blends into
   *  surrounding text. Useful when listing several parties inline. */
  dim?: boolean
}

/**
 * PartyChip — identifies a `Party` (human / agent / system) by a kind-colored
 * dot and display name.
 *
 * Coloring lives entirely in CSS via `data-party-kind` attribute selectors.
 * The dot is decorative; the display name is the accessible content.
 */
export function PartyChip({ party, dim = false }: PartyChipProps) {
  return (
    <span
      className={styles.chip}
      data-party-kind={party.kind}
      data-dim={dim ? 'true' : undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {party.display_name}
    </span>
  )
}
