import type { Intent } from '@/schema'
import type { DraftShape } from '@/fixtures/shaping'
import { Chip, KindBadge, SectionLabel, Tag } from '@/components/atoms'
import styles from './IntentDraftPane.module.css'

export interface IntentDraftPaneProps {
  intent: Intent
  shape: DraftShape
}

/**
 * IntentDraftPane — right pane of the Shaping surface.
 *
 * Renders the live typed draft. Each field the surface tracks is checked
 * against `shape.resolvedFields`; unresolved fields surface a `⚠ pending`
 * Chip so the human can see at a glance which conversational threads
 * still need closing before commit unblocks.
 */
export function IntentDraftPane({ intent, shape }: IntentDraftPaneProps) {
  const resolved = (path: string) => shape.resolvedFields.has(path)

  return (
    <section className={styles.pane} data-kind={intent.kind}>
      <SectionLabel hint="live">intent draft</SectionLabel>

      <div className={styles.statusRow}>
        <Chip mono tone="amber" dot>
          DRAFT (shaping)
        </Chip>
        <KindBadge kind={intent.kind} label={intent.kind} />
      </div>

      <Field label="title" path="declaration.title" resolved={resolved('declaration.title')}>
        <span className={styles.title}>{intent.declaration.title}</span>
      </Field>

      <Field
        label="summary"
        path="declaration.summary"
        resolved={resolved('declaration.summary')}
      >
        {intent.declaration.summary === '' ? (
          <span className={styles.emptyValue}>no summary yet</span>
        ) : (
          <p className={styles.summary}>{intent.declaration.summary}</p>
        )}
      </Field>

      <Field
        label="success criterion"
        path="declaration.success_criterion"
        resolved={resolved('declaration.success_criterion')}
      >
        {intent.declaration.success_criterion === '' ? (
          <span className={styles.emptyValue}>no success criterion yet</span>
        ) : (
          <p className={styles.successText}>{intent.declaration.success_criterion}</p>
        )}
      </Field>

      <ExtensionFields intent={intent} resolved={resolved} />

      {intent.tags && intent.tags.length > 0 && (
        <div className={styles.tags}>
          {intent.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
    </section>
  )
}

function Field({
  label,
  path,
  resolved,
  children,
}: {
  label: string
  path: string
  resolved: boolean
  children: React.ReactNode
}) {
  return (
    <div className={styles.field} data-field={path} data-resolved={resolved ? 'true' : undefined}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>{label}</span>
        {!resolved && (
          <Chip mono tone="amber">
            ⚠ pending
          </Chip>
        )}
      </div>
      <div className={styles.fieldBody}>{children}</div>
    </div>
  )
}

function ExtensionFields({
  intent,
  resolved,
}: {
  intent: Intent
  resolved: (path: string) => boolean
}) {
  const ext = intent.extension

  if (ext.kind === 'nous-campaign') {
    return (
      <Field
        label="research question"
        path="extension.research_question"
        resolved={resolved('extension.research_question')}
      >
        <p className={styles.summary}>{ext.research_question}</p>
      </Field>
    )
  }

  if (ext.kind === 'coral-optimization') {
    const scoringResolved = resolved('extension.scoring_function_ref')
    return (
      <>
        <Field
          label="scoring function"
          path="extension.scoring_function_ref"
          resolved={scoringResolved}
        >
          {scoringResolved ? (
            <code className={styles.codeValue}>{ext.scoring_function_ref}</code>
          ) : (
            <span className={styles.emptyValue}>not chosen yet</span>
          )}
        </Field>
        <Field
          label="search algorithm"
          path="extension.search_algorithm"
          resolved={resolved('extension.search_algorithm')}
        >
          <Chip mono tone="mute">
            {ext.search_algorithm}
          </Chip>
        </Field>
        <Field
          label="population size"
          path="extension.population_size"
          resolved={resolved('extension.population_size')}
        >
          <Chip mono tone="mute">{ext.population_size}</Chip>
        </Field>
      </>
    )
  }

  // Other kinds aren't drafted in v0.1; ShapingSurface only routes the
  // four root kinds. Returning null is a deliberate non-render rather
  // than a bug: a v0.2 kind that lands here would silently miss extension
  // editing and the schema-exhaustive test in the surface flags it.
  return null
}
