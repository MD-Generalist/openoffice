/**
 * Shared contract and parser for inline structured question cards (`AiQuestionCard`).
 * Supports both the in-loop `ask_questions` app tool and `<question-form>...</question-form>`
 * text fallback for tool-less models.
 */

import type {
  QuestionAnswerValue,
  QuestionCardAnswer,
  QuestionInput,
  QuestionSurfaceView,
} from '@genoffice/agent-core'
import type { QuestionCardStatus, QuestionCardSubmission } from './AiQuestionCard'

export type { QuestionCardStatus } from './AiQuestionCard'

export type QuestionOption = string | { readonly label: string; readonly value: string }

export type QuestionFieldType = 'radio' | 'checkbox' | 'select' | 'text'

export interface QuestionField {
  readonly id: string
  readonly label: string
  readonly type: QuestionFieldType
  readonly options?: readonly QuestionOption[] | undefined
  readonly default?: string | readonly string[] | undefined
  readonly required?: boolean | undefined
  readonly allowCustom?: boolean | undefined
  readonly maxSelections?: number | undefined
  readonly description?: string | undefined
}

export interface QuestionFormSpec {
  readonly id: string
  readonly title: string
  readonly description?: string | undefined
  readonly questions: readonly QuestionField[]
}

export type QuestionFormAnswers = Record<string, string | string[]>

export interface NormalizedQuestionOption {
  readonly label: string
  readonly value: string
}

export const QUESTION_FORM_MIN_QUESTIONS = 1
export const QUESTION_FORM_MAX_QUESTIONS = 5
export const QUESTION_FORM_MAX_OPTIONS = 7

const VALID_TYPES = new Set<QuestionFieldType>(['radio', 'checkbox', 'select', 'text'])

export function normalizeQuestionOption(opt: QuestionOption): NormalizedQuestionOption {
  if (typeof opt === 'string') return { label: opt, value: opt }
  return { label: opt.label, value: opt.value }
}

/** Validates and normalizes an untrusted value into a `QuestionFormSpec`, or returns null. */
export function validateQuestionFormSpec(raw: unknown): QuestionFormSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'question-form'
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  if (!title) return null
  if (!Array.isArray(obj.questions)) return null
  if (
    obj.questions.length < QUESTION_FORM_MIN_QUESTIONS ||
    obj.questions.length > QUESTION_FORM_MAX_QUESTIONS
  ) {
    return null
  }

  const questions: QuestionField[] = []
  const seenIds = new Set<string>()
  for (let i = 0; i < obj.questions.length; i++) {
    const qRaw = obj.questions[i]
    if (!qRaw || typeof qRaw !== 'object' || Array.isArray(qRaw)) return null
    const q = qRaw as Record<string, unknown>
    const qId = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${i + 1}`
    if (seenIds.has(qId)) return null
    seenIds.add(qId)
    const label = typeof q.label === 'string' ? q.label.trim() : ''
    if (!label) return null
    const type = q.type as QuestionFieldType
    if (!VALID_TYPES.has(type)) return null

    let options: QuestionOption[] | undefined
    if (type !== 'text') {
      if (!Array.isArray(q.options) || q.options.length === 0) return null
      if (q.options.length > QUESTION_FORM_MAX_OPTIONS) return null
      options = []
      for (const opt of q.options) {
        if (typeof opt === 'string' && opt.trim()) {
          options.push(opt.trim())
        } else if (
          opt &&
          typeof opt === 'object' &&
          !Array.isArray(opt) &&
          typeof (opt as { label?: unknown }).label === 'string' &&
          typeof (opt as { value?: unknown }).value === 'string' &&
          (opt as { label: string }).label.trim() &&
          (opt as { value: string }).value.trim()
        ) {
          options.push({
            label: (opt as { label: string }).label.trim(),
            value: (opt as { value: string }).value.trim(),
          })
        } else {
          return null
        }
      }
    }

    let defaultVal: string | string[] | undefined
    if (typeof q.default === 'string') {
      defaultVal = q.default
    } else if (Array.isArray(q.default) && q.default.every((v) => typeof v === 'string')) {
      defaultVal = [...(q.default as string[])]
    }

    questions.push({
      id: qId,
      label,
      type,
      ...(options ? { options } : {}),
      ...(defaultVal !== undefined ? { default: defaultVal } : {}),
      ...(typeof q.required === 'boolean' ? { required: q.required } : {}),
      ...(typeof q.allowCustom === 'boolean' ? { allowCustom: q.allowCustom } : {}),
      ...(typeof q.maxSelections === 'number' &&
      Number.isInteger(q.maxSelections) &&
      q.maxSelections > 0
        ? { maxSelections: q.maxSelections }
        : {}),
      ...(typeof q.description === 'string' && q.description.trim()
        ? { description: q.description.trim() }
        : {}),
    })
  }

  return {
    id,
    title,
    ...(typeof obj.description === 'string' && obj.description.trim()
      ? { description: obj.description.trim() }
      : {}),
    questions,
  }
}

export type QuestionFormSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'form'; readonly spec: QuestionFormSpec }
  | { readonly kind: 'pending' }

const OPEN_TAG = '<question-form>'
const CLOSE_TAG = '</question-form>'

/**
 * Splits assistant text into plain markdown segments and validated inline question forms.
 * An unclosed `<question-form>` block while streaming yields a `pending` segment so the
 * UI can show a clean preparing indicator instead of raw partial JSON. Malformed JSON
 * falls back safely to plain text.
 */
export function parseQuestionFormBlocks(
  text: string,
  isStreaming: boolean = false,
): QuestionFormSegment[] {
  const segments: QuestionFormSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf(OPEN_TAG, cursor)
    if (start === -1) {
      const rest = text.slice(cursor)
      if (rest) segments.push({ kind: 'text', text: rest })
      break
    }

    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) })
    }

    const bodyStart = start + OPEN_TAG.length
    const end = text.indexOf(CLOSE_TAG, bodyStart)
    if (end === -1) {
      if (isStreaming) {
        segments.push({ kind: 'pending' })
      } else {
        segments.push({ kind: 'text', text: text.slice(start) })
      }
      break
    }

    const rawJson = text.slice(bodyStart, end).trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      parsed = null
    }
    const spec = validateQuestionFormSpec(parsed)
    if (spec) {
      segments.push({ kind: 'form', spec })
    } else {
      segments.push({ kind: 'text', text: text.slice(start, end + CLOSE_TAG.length) })
    }
    cursor = end + CLOSE_TAG.length
  }

  return segments
}

/** Builds initial form answers pre-populated with each field's `default`. */
export function initialQuestionFormAnswers(spec: QuestionFormSpec): QuestionFormAnswers {
  const answers: QuestionFormAnswers = {}
  for (const q of spec.questions) {
    if (q.type === 'checkbox') {
      if (Array.isArray(q.default)) answers[q.id] = [...q.default]
      else if (typeof q.default === 'string' && q.default) answers[q.id] = [q.default]
      else answers[q.id] = []
    } else {
      answers[q.id] = typeof q.default === 'string' ? q.default : ''
    }
  }
  return answers
}

/** True when every required question in `spec` has a non-empty answer. */
export function isQuestionFormComplete(
  spec: QuestionFormSpec,
  answers: QuestionFormAnswers,
): boolean {
  for (const q of spec.questions) {
    if (!q.required) continue
    const val = answers[q.id]
    if (q.type === 'checkbox') {
      if (!Array.isArray(val) || val.length === 0) return false
    } else {
      if (typeof val !== 'string' || !val.trim()) return false
    }
  }
  return true
}

/** Formats submitted/skipped answers into a clean structured summary for AI continuation and lock view. */
export function formatQuestionFormAnswers(
  spec: QuestionFormSpec,
  answers: QuestionFormAnswers,
  skipped: boolean,
): string {
  if (skipped) {
    return `[${spec.title}] Skipped — proceed with reasonable defaults.`
  }
  const lines = [`[${spec.title}]`]
  for (const q of spec.questions) {
    const raw = answers[q.id]
    const formatted = Array.isArray(raw) ? raw.join(', ') : (raw ?? '')
    lines.push(`- ${q.label}: ${formatted || '(none)'}`)
  }
  return lines.join('\n')
}

// ── bridge to the A2UI card (kept until the text block moves to `<a2ui-json>`) ──

/** A `<question-form>` spec as the view the shared card draws. */
export function questionFormView(spec: QuestionFormSpec): QuestionSurfaceView {
  const inputs: QuestionInput[] = spec.questions.map((q) => {
    const base = {
      id: q.id,
      label: q.label,
      ...(q.description ? { description: q.description } : {}),
      required: q.required === true,
    }
    if (q.type === 'text') {
      return {
        ...base,
        kind: 'TextField',
        variant: 'shortText',
        initial: typeof q.default === 'string' ? q.default : '',
      }
    }
    const options = (q.options ?? []).map(normalizeQuestionOption)
    const values = new Set(options.map((o) => o.value))
    const defaults = typeof q.default === 'string' ? [q.default] : [...(q.default ?? [])]
    const multi = q.type === 'checkbox'
    const initial = defaults.filter((v) => values.has(v))
    return {
      ...base,
      kind: 'ChoicePicker',
      variant: multi ? 'multipleSelection' : 'mutuallyExclusive',
      options,
      initial: multi ? initial : initial.slice(0, 1),
    }
  })
  return {
    surfaceId: spec.id,
    title: spec.title,
    ...(spec.description ? { description: spec.description } : {}),
    inputs,
  }
}

/** The card's submission in the `<question-form>` answer shape (left to the AI: empty). */
export function questionFormAnswersOf(
  spec: QuestionFormSpec,
  submission: QuestionCardSubmission,
): QuestionFormAnswers {
  const out: QuestionFormAnswers = {}
  for (const q of spec.questions) {
    const value: QuestionAnswerValue | undefined = submission.answers[q.id]
    const list = Array.isArray(value) ? [...(value as readonly string[])] : []
    if (q.type === 'checkbox') out[q.id] = list
    else if (q.type === 'text') out[q.id] = typeof value === 'string' ? value : ''
    else out[q.id] = list[0] ?? ''
  }
  return out
}

/** Saved `<question-form>` answers as the card's answer, for a closed card. */
export function questionFormCardAnswer(
  spec: QuestionFormSpec,
  status: QuestionCardStatus,
  answers: QuestionFormAnswers | undefined,
): QuestionCardAnswer | undefined {
  if (status === 'skipped') return { kind: 'skip' }
  if (!answers) return undefined
  const out: Record<string, QuestionAnswerValue> = {}
  for (const q of spec.questions) {
    const value = answers[q.id]
    if (value === undefined) continue
    out[q.id] =
      q.type === 'text' ? (Array.isArray(value) ? value.join(', ') : value) : [value].flat()
  }
  return { kind: 'submit', answers: out, decideForMe: [] }
}
