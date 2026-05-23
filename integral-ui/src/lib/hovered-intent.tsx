import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { IntentId } from '@/schema'

interface HoveredIntentContextValue {
  hovered: IntentId | null
  setHovered: (id: IntentId | null) => void
}

const HoveredIntentContext = createContext<HoveredIntentContextValue>({
  hovered: null,
  setHovered: () => {},
})

/**
 * Shared "hovered intent ID" — wired from the WorkspaceActivityStrip
 * (writer) to the Map's TreeCards (reader, for preview-pulse).
 *
 * Per goals.md: prop/context, no global store. The provider owns one
 * piece of state; consumers read or write via the hook.
 */
export function HoveredIntentProvider({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState<IntentId | null>(null)
  const value = useMemo(() => ({ hovered, setHovered }), [hovered])
  return (
    <HoveredIntentContext.Provider value={value}>
      {children}
    </HoveredIntentContext.Provider>
  )
}

export function useHoveredIntent(): HoveredIntentContextValue {
  return useContext(HoveredIntentContext)
}
