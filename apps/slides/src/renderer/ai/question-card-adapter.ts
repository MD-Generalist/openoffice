/**
 * Bridges Slides' legacy `ClarifyQuestion[]` structure to the shared
 * `@genoffice/ui` `QuestionFormSpec` so both `ask_clarification` and
 * `ask_questions` render through one unified `AiQuestionCard` (T9).
 */
import type { QuestionField, QuestionFormSpec } from '@genoffice/ui'
import type { ClarifyQuestion } from './slides-skill'

export function clarifyQuestionsToFormSpec(
  questions: readonly ClarifyQuestion[],
  id = 'slides-clarify',
  title = 'Clarify presentation details',
): QuestionFormSpec {
  const fields: QuestionField[] = questions.slice(0, 5).map((q, idx) => ({
    id: q.id || `q${idx + 1}`,
    label: q.label,
    ...(q.description ? { description: q.description } : {}),
    type: q.multi ? 'checkbox' : 'radio',
    options: q.options.slice(0, 7).map((opt) => ({ label: opt, value: opt })),
    allowCustom: true,
    required: true,
  }))
  return {
    id,
    title,
    questions: fields,
  }
}

export function formatQuestionCardAnswersForSlides(
  spec: QuestionFormSpec,
  answers: Record<string, string | string[]>,
): string {
  return spec.questions
    .map((q) => {
      const value = answers[q.id]
      const rendered = Array.isArray(value) ? value.join(', ') : String(value ?? '').trim()
      return `- ${q.label}: ${rendered || '(default)'}`
    })
    .join('\n')
}
