/**
 * Shared hook for the inline question card across the editors and the Home
 * question panel: the in-loop `ask_questions` app tool (an A2UI `createSurface`
 * message checked by `@genoffice/agent-core`) and the text-block cards of
 * tool-less replies. Keeps subscription CLI tools at 0 (Absolute Rule 3): the
 * tool runs in the app.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createAskQuestionsSkill,
  type AskQuestionsSkill,
  type QuestionCardAnswer,
  type QuestionSurfaceView,
} from '@genoffice/agent-core'
import type { QuestionCardStatus, QuestionCardSubmission } from './AiQuestionCard'
import {
  formatQuestionFormAnswers,
  type QuestionFormAnswers,
  type QuestionFormSpec,
} from './question-form'

export interface ActiveQuestionCardState {
  /** Unique per card: use it as the React key of the drawn card. */
  readonly id: number
  readonly view: QuestionSurfaceView
  readonly status: QuestionCardStatus
  /** The answer given, once `submitted`. */
  readonly answer?: QuestionCardAnswer | undefined
}

export interface TextQuestionCardState {
  status: QuestionCardStatus
  answers?: QuestionFormAnswers
}

export interface AiInlineQuestions {
  /** The `ask-questions` skill to add to the run's skills. */
  readonly askQuestionsSkill: AskQuestionsSkill
  /** The tool card of this panel, if one was asked. */
  readonly activeToolCard: ActiveQuestionCardState | null
  /** True while the tool card waits for the person; pause elapsed-time displays with it. */
  readonly waitingForPerson: boolean
  readonly submitToolCard: (answer: QuestionCardSubmission) => void
  readonly skipToolCard: () => void
  /** A new message: closes open cards (the tool answers skip) and resets the one-card limit. */
  readonly supersedeOpen: () => void
  readonly textCardStates: Record<string, TextQuestionCardState>
  readonly markTextCard: (
    cardKey: string,
    status: QuestionCardStatus,
    answers?: QuestionFormAnswers,
  ) => void
  readonly formatFollowUp: (
    spec: QuestionFormSpec,
    answers: QuestionFormAnswers,
    skipped?: boolean,
  ) => string
}

const SKIP: QuestionCardAnswer = { kind: 'skip' }

export function useAiInlineQuestions(): AiInlineQuestions {
  const [activeToolCard, setActiveToolCard] = useState<ActiveQuestionCardState | null>(null)
  const [textCardStates, setTextCardStates] = useState<Record<string, TextQuestionCardState>>({})
  const resolverRef = useRef<((answer: QuestionCardAnswer) => void) | null>(null)
  const nextIdRef = useRef(1)

  /** Settles the waiting tool call once; later calls do nothing. */
  const settle = useCallback((answer: QuestionCardAnswer) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(answer)
  }, [])

  const askQuestionsSkill: AskQuestionsSkill = useMemo(
    () =>
      createAskQuestionsSkill({
        ask: (view, signal) =>
          new Promise<QuestionCardAnswer>((resolve) => {
            // a card still waiting from an earlier call gives way to this one
            settle(SKIP)
            const id = nextIdRef.current++
            const finish = (answer: QuestionCardAnswer) => {
              if (resolverRef.current === finish) resolverRef.current = null
              resolve(answer)
            }
            resolverRef.current = finish
            setActiveToolCard({ id, view, status: 'open' })
            const close = () => {
              setActiveToolCard((prev) =>
                prev && prev.id === id && prev.status === 'open'
                  ? { ...prev, status: 'superseded' }
                  : prev,
              )
              finish(SKIP)
            }
            if (signal?.aborted) close()
            else signal?.addEventListener('abort', close, { once: true })
          }),
      }),
    [settle],
  )

  const submitToolCard = useCallback(
    (answer: QuestionCardSubmission) => {
      setActiveToolCard((prev) =>
        prev && prev.status === 'open' ? { ...prev, status: 'submitted', answer } : prev,
      )
      settle(answer)
    },
    [settle],
  )

  const skipToolCard = useCallback(() => {
    setActiveToolCard((prev) =>
      prev && prev.status === 'open' ? { ...prev, status: 'skipped', answer: SKIP } : prev,
    )
    settle(SKIP)
  }, [settle])

  const supersedeOpen = useCallback(() => {
    askQuestionsSkill.resetTurn()
    settle(SKIP)
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
  }, [askQuestionsSkill, settle])

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
    waitingForPerson: activeToolCard?.status === 'open',
    submitToolCard,
    skipToolCard,
    supersedeOpen,
    textCardStates,
    markTextCard,
    formatFollowUp,
  }
}
