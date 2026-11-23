/**
 * Shared hook unifying the `ask_questions` renderer app tool and `<question-form>`
 * text fallback cards across all 11 editors and Home KbAskPanel (T9).
 * Keeps subscription CLI tools at 0 (Absolute Rule 3).
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createAskQuestionsSkill,
  type AskQuestionsRequest,
  type AskQuestionsResponse,
  type AskQuestionsSkill,
} from '@genoffice/agent-core'
import {
  formatQuestionFormAnswers,
  type QuestionCardStatus,
  type QuestionFormAnswers,
  type QuestionFormSpec,
} from './question-form'

export interface ActiveQuestionCardState {
  spec: QuestionFormSpec
  status: QuestionCardStatus
  answers?: QuestionFormAnswers
}

function requestToSpec(req: AskQuestionsRequest): QuestionFormSpec {
  return {
    id: req.id,
    title: req.title,
    ...(req.description ? { description: req.description } : {}),
    questions: req.questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      ...(q.options ? { options: q.options } : {}),
      ...(q.default !== undefined ? { default: q.default } : {}),
      ...(q.required !== undefined ? { required: q.required } : {}),
      ...(q.allowCustom !== undefined ? { allowCustom: q.allowCustom } : {}),
      ...(q.maxSelections !== undefined ? { maxSelections: q.maxSelections } : {}),
      ...(q.description ? { description: q.description } : {}),
    })),
  }
}

export function useAiInlineQuestions() {
  const [activeToolCard, setActiveToolCard] = useState<ActiveQuestionCardState | null>(null)
  const [textCardStates, setTextCardStates] = useState<
    Record<string, { status: QuestionCardStatus; answers?: QuestionFormAnswers }>
  >({})
  const resolverRef = useRef<((res: AskQuestionsResponse) => void) | null>(null)

  const askQuestionsSkill: AskQuestionsSkill = useMemo(
    () =>
      createAskQuestionsSkill({
        ask: (req, signal) =>
          new Promise<AskQuestionsResponse>((resolve) => {
            const finish = (res: AskQuestionsResponse) => {
              if (resolverRef.current === finish) resolverRef.current = null
              resolve(res)
            }
            resolverRef.current = finish
            setActiveToolCard({ spec: requestToSpec(req), status: 'open' })
            if (signal) {
              if (signal.aborted) {
                setActiveToolCard((prev) => (prev ? { ...prev, status: 'superseded' } : prev))
                finish({ skipped: true })
                return
              }
              signal.addEventListener(
                'abort',
                () => {
                  setActiveToolCard((prev) =>
                    prev && prev.status === 'open' ? { ...prev, status: 'superseded' } : prev,
                  )
                  finish({ skipped: true })
                },
                { once: true },
              )
            }
          }),
      }),
    [],
  )

  const submitToolCard = useCallback((answers: QuestionFormAnswers) => {
    setActiveToolCard((prev) => (prev ? { ...prev, status: 'submitted', answers } : prev))
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.({ submitted: true, answers })
  }, [])

  const skipToolCard = useCallback(() => {
    setActiveToolCard((prev) => (prev ? { ...prev, status: 'skipped' } : prev))
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.({ skipped: true })
  }, [])

  const supersedeOpen = useCallback(() => {
    askQuestionsSkill.resetTurn()
    if (resolverRef.current) {
      const resolve = resolverRef.current
      resolverRef.current = null
      resolve({ skipped: true })
    }
    setActiveToolCard((prev) =>
      prev && prev.status === 'open' ? { ...prev, status: 'superseded' } : prev,
    )
    setTextCardStates((prev) => {
      let changed = false
      const next: typeof prev = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v.status === 'open') {
          next[k] = { ...v, status: 'superseded' }
          changed = true
        } else {
          next[k] = v
        }
      }
      return changed ? next : prev
    })
  }, [askQuestionsSkill])

  const markTextCard = useCallback(
    (cardKey: string, status: QuestionCardStatus, answers?: QuestionFormAnswers) => {
      setTextCardStates((prev) => ({
        ...prev,
        [cardKey]: { status, ...(answers ? { answers } : {}) },
      }))
    },
    [],
  )

  const formatFollowUp = useCallback(
    (spec: QuestionFormSpec, answers: QuestionFormAnswers, skipped = false) =>
      formatQuestionFormAnswers(spec, answers, skipped),
    [],
  )

  return {
    askQuestionsSkill,
    activeToolCard,
    submitToolCard,
    skipToolCard,
    supersedeOpen,
    textCardStates,
    markTextCard,
    formatFollowUp,
  }
}
