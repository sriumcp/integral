/**
 * Atoms — surface-agnostic primitives that compose into surfaces.
 *
 * Every atom:
 * - Is typed against the v0.1 schema (`@/schema`) where applicable.
 * - Owns its CSS via co-located CSS Modules.
 * - Has co-located behavioral tests under the same directory.
 */

export { StatusDot } from './StatusDot/StatusDot'
export type { StatusDotProps } from './StatusDot/StatusDot'

export { Chip } from './Chip/Chip'
export type { ChipProps, ChipTone } from './Chip/Chip'

export { FilterChip } from './FilterChip/FilterChip'
export type { FilterChipProps } from './FilterChip/FilterChip'

export { IdPill } from './IdPill/IdPill'
export type { IdPillProps } from './IdPill/IdPill'

export { KindBadge, KIND_GLYPHS } from './KindBadge/KindBadge'
export type { KindBadgeProps } from './KindBadge/KindBadge'

export { PartyChip } from './PartyChip/PartyChip'
export type { PartyChipProps } from './PartyChip/PartyChip'

export { Tag } from './Tag/Tag'
export type { TagProps } from './Tag/Tag'

export { SectionLabel } from './SectionLabel/SectionLabel'
export type { SectionLabelProps } from './SectionLabel/SectionLabel'

export { Sparkline } from './Sparkline/Sparkline'
export type { SparklineProps } from './Sparkline/Sparkline'

export { HypothesisBars } from './HypothesisBars/HypothesisBars'
export type {
  HypothesisBarsProps,
  HypothesisCounts,
} from './HypothesisBars/HypothesisBars'

export { ScoreGauge } from './ScoreGauge/ScoreGauge'
export type { ScoreGaugeProps } from './ScoreGauge/ScoreGauge'

export { PrinciplesTempo } from './PrinciplesTempo/PrinciplesTempo'
export type {
  PrinciplesTempoDatum,
  PrinciplesTempoProps,
} from './PrinciplesTempo/PrinciplesTempo'

export { HypothesisGrid } from './HypothesisGrid/HypothesisGrid'
export type {
  HypothesisGridDatum,
  HypothesisGridIteration,
  HypothesisGridProps,
  HypothesisResult,
} from './HypothesisGrid/HypothesisGrid'

export { HMainTimeline } from './HMainTimeline/HMainTimeline'
export type {
  HMainTimelineDatum,
  HMainTimelineProps,
} from './HMainTimeline/HMainTimeline'

export { ZoomToggle } from './ZoomToggle/ZoomToggle'
export type { ZoomToggleProps } from './ZoomToggle/ZoomToggle'
