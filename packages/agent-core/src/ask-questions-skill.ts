import type { AgentSkill } from './skill'
import type { AgentToolCall, AgentToolDef, ToolExecution } from './types'

/**
 * Shared in-loop app tool (`ask_questions`) that lets the AI present a compact
 * inline structured question card without enabling any external subscription CLI
 * tools. Enforces a strict max-1-question-round limit per run.
 */
export const ASK_QUESTIONS_TOOL = 'ask_questions'

export interface AskQuestionOption {
  readonly label: string
  readonly value: string
}

export interface AskQuestionField {
  readonly id: string
  readonly label: string
  readonly type: 'radio' | 'checkbox' | 'select' | 'text'
  readonly options?: readonly (string | AskQuestionOption)[] | undefined
  readonly default?: string | readonly string[] | undefined
  readonly required?: boolean | undefined
  readonly allowCustom?: boolean | undefined
  readonly maxSelections?: number | undefined
  readonly description?: string | undefined
}

export interface AskQuestionsRequest {
  readonly id: string
  readonly title: string
  readonly description?: string | undefined
  readonly questions: readonly AskQuestionField[]
}

export type AskQuestionsResponse =
  | { readonly submitted: true; readonly answers: Record<string, string | string[]> }
  | { readonly skipped: true }

export interface AskQuestionsDeps {
  /** Renders the inline question card and resolves when the user submits or skips. */
  readonly ask: (
    request: AskQuestionsRequest,
    signal?: AbortSignal,
  ) => Promise<AskQuestionsResponse>
}

const VALID_TYPES = new Set(['radio', 'checkbox', 'select', 'text'])

function validateRequest(args: Record<string, unknown>): AskQuestionsRequest | string {
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  if (!title) return 'title is required'
  if (!Array.isArray(args.questions) || args.questions.length < 1 || args.questions.length > 5) {
    return 'questions must contain 1 to 5 items'
  }
  const questions: AskQuestionField[] = []
  for (let i = 0; i < args.questions.length; i++) {
    const q = args.questions[i] as Record<string, unknown> | null
    if (!q || typeof q !== 'object' || Array.isArray(q)) return `question[${i}] must be an object`
    const label = typeof q.label === 'string' ? q.label.trim() : ''
    if (!label) return `question[${i}].label is required`
    const type = typeof q.type === 'string' ? q.type : ''
    if (!VALID_TYPES.has(type)) return `question[${i}].type must be radio|checkbox|select|text`
    if (type !== 'text') {
      if (!Array.isArray(q.options) || q.options.length < 1 || q.options.length > 7) {
        return `question[${i}].options must contain 1 to 7 options`
      }
    }
    questions.push({
      id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${i + 1}`,
      label,
      type: type as AskQuestionField['type'],
      ...(Array.isArray(q.options) ? { options: q.options as (string | AskQuestionOption)[] } : {}),
      ...(q.default !== undefined ? { default: q.default as string | string[] } : {}),
      ...(typeof q.required === 'boolean' ? { required: q.required } : {}),
      ...(typeof q.allowCustom === 'boolean' ? { allowCustom: q.allowCustom } : {}),
      ...(typeof q.maxSelections === 'number' ? { maxSelections: q.maxSelections } : {}),
      ...(typeof q.description === 'string' ? { description: q.description } : {}),
    })
  }
  return {
    id: typeof args.id === 'string' && args.id.trim() ? args.id.trim() : `ask-${Date.now()}`,
    title,
    ...(typeof args.description === 'string' && args.description.trim()
      ? { description: args.description.trim() }
      : {}),
    questions,
  }
}

const TOOL_DEF: AgentToolDef = {
  name: ASK_QUESTIONS_TOOL,
  description:
    'Ask the user 1-5 concise structured clarifying questions inline when key direction (audience, length, tone, format) is ambiguous or a purpose-built skill requires scoping. Maximum once per turn; skip when the user already gave enough detail.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Optional stable id for this question card.' },
      title: {
        type: 'string',
        description: 'Short card title explaining what is being confirmed.',
      },
      description: { type: 'string', description: 'Optional 1-line helper description.' },
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['radio', 'checkbox', 'select', 'text'] },
            options: { type: 'array', maxItems: 7 },
            default: {},
            required: { type: 'boolean' },
            allowCustom: { type: 'boolean' },
            maxSelections: { type: 'number' },
            description: { type: 'string' },
          },
          required: ['label', 'type'],
        },
      },
    },
    required: ['title', 'questions'],
  },
}

const SYSTEM_PROMPT = [
  '## Clarifying questions (`ask_questions`)',
  '- Call `ask_questions` ONLY when using a purpose-built creation skill or when key direction (audience, length, tone, format) is genuinely ambiguous.',
  '- If the user already provided enough detail, proceed immediately without asking.',
  '- Ask at most ONCE per turn, with 1-5 concise questions and sensible defaults.',
].join('\n')

export function createAskQuestionsSkill(deps: AskQuestionsDeps): AgentSkill {
  let askedInRun = false
  return {
    id: 'ask-questions',
    systemPrompt: SYSTEM_PROMPT,
    tools: [TOOL_DEF],
    async executeTool(call: AgentToolCall, signal?: AbortSignal): Promise<ToolExecution> {
      if (call.name !== ASK_QUESTIONS_TOOL) {
        return { output: `Unknown tool: ${call.name}`, isError: true, summary: call.name }
      }
      if (askedInRun) {
        return {
          output: JSON.stringify({
            ok: false,
            message: 'Already asked once in this turn; proceed with reasonable defaults',
          }),
          isError: true,
          summary: 'Ask skipped (already asked)',
        }
      }
      const validated = validateRequest(call.input)
      if (typeof validated === 'string') {
        return {
          output: JSON.stringify({ ok: false, error: validated }),
          isError: true,
          summary: 'Invalid question form',
        }
      }
      askedInRun = true
      const response = await deps.ask(validated, signal)
      return {
        output: JSON.stringify({ ok: true, ...response }),
        mutated: false,
        summary: validated.title,
      }
    },
  }
}
