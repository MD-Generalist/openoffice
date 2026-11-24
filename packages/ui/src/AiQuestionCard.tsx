import React, { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  initialQuestionFormAnswers,
  isQuestionFormComplete,
  normalizeQuestionOption,
  type QuestionCardStatus,
  type QuestionFormAnswers,
  type QuestionFormSpec,
} from './question-form'
import { questionCardText } from './strings-question-card'
import './ai-question-card.css'

export interface AiQuestionCardProps {
  readonly spec: QuestionFormSpec
  readonly status: QuestionCardStatus
  readonly lang: Lang
  readonly savedAnswers?: QuestionFormAnswers | undefined
  readonly onSubmit?: (answers: QuestionFormAnswers) => void
  readonly onSkip?: () => void
}

export function AiQuestionCardPending({ lang }: { readonly lang: Lang }): React.JSX.Element {
  return (
    <div className="ai-qcard-pending" role="status">
      {questionCardText(lang, 'preparing')}
    </div>
  )
}

export function AiQuestionCard({
  spec,
  status,
  lang,
  savedAnswers,
  onSubmit,
  onSkip,
}: AiQuestionCardProps): React.JSX.Element {
  const [answers, setAnswers] = useState<QuestionFormAnswers>(
    () => savedAnswers ?? initialQuestionFormAnswers(spec),
  )
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (savedAnswers) setAnswers(savedAnswers)
  }, [savedAnswers])

  const locked = status !== 'open'
  const canSubmit = !locked && isQuestionFormComplete(spec, answers)

  const setSingle = (id: string, value: string) => {
    if (locked) return
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  const toggleMulti = (id: string, value: string, maxSelections?: number) => {
    if (locked) return
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? [...(prev[id] as string[])] : []
      const idx = current.indexOf(value)
      if (idx >= 0) {
        current.splice(idx, 1)
      } else {
        if (maxSelections && current.length >= maxSelections) return prev
        current.push(value)
      }
      return { ...prev, [id]: current }
    })
  }

  const statusBadge =
    status === 'submitted'
      ? questionCardText(lang, 'statusSubmitted')
      : status === 'skipped'
        ? questionCardText(lang, 'statusSkipped')
        : status === 'superseded'
          ? questionCardText(lang, 'statusSuperseded')
          : null

  return (
    <div
      className={`ai-qcard${locked ? ' ai-qcard-locked' : ''}`}
      data-testid="ai-question-card"
      data-status={status}
    >
      <div className="ai-qcard-header">
        <span className="ai-qcard-title">{spec.title}</span>
        {statusBadge && <span className="ai-qcard-badge">{statusBadge}</span>}
      </div>
      {spec.description && <p className="ai-qcard-desc">{spec.description}</p>}

      {locked ? (
        <ul className="ai-qcard-summary">
          {spec.questions.map((q) => {
            const val = (savedAnswers ?? answers)[q.id]
            const text = Array.isArray(val) ? val.join(', ') : (val ?? '')
            return (
              <li key={q.id}>
                <strong>{q.label}:</strong> {text || '—'}
              </li>
            )
          })}
        </ul>
      ) : (
        <>
          {spec.questions.map((q) => {
            const opts = (q.options ?? []).map(normalizeQuestionOption)
            const current = answers[q.id]
            return (
              <div className="ai-qcard-field" key={q.id}>
                <label className="ai-qcard-label">
                  <span>{q.label}</span>
                  {q.required && (
                    <span className="ai-qcard-req">{questionCardText(lang, 'requiredMark')}</span>
                  )}
                  {q.type === 'checkbox' && q.maxSelections && (
                    <span className="ai-qcard-req">
                      {questionCardText(lang, 'maxSelectionsHint', { max: q.maxSelections })}
                    </span>
                  )}
                </label>
                {q.description && <span className="ai-qcard-field-desc">{q.description}</span>}

                {q.type === 'radio' && (
                  <div className="ai-qcard-options" role="radiogroup" aria-label={q.label}>
                    {opts.map((opt) => {
                      const selected = current === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`ai-qcard-opt${selected ? ' ai-qcard-opt-selected' : ''}`}
                          onClick={() => setSingle(q.id, opt.value)}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {q.type === 'checkbox' && (
                  <div className="ai-qcard-options" role="group" aria-label={q.label}>
                    {opts.map((opt) => {
                      const list = Array.isArray(current) ? current : []
                      const selected = list.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          className={`ai-qcard-opt${selected ? ' ai-qcard-opt-selected' : ''}`}
                          onClick={() => toggleMulti(q.id, opt.value, q.maxSelections)}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {q.type === 'select' && (
                  <select
                    className="ai-qcard-select"
                    aria-label={q.label}
                    value={typeof current === 'string' ? current : ''}
                    onChange={(e) => setSingle(q.id, e.target.value)}
                  >
                    <option value="">{questionCardText(lang, 'selectPlaceholder')}</option>
                    {opts.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {q.type === 'text' && (
                  <input
                    type="text"
                    className="ai-qcard-input"
                    aria-label={q.label}
                    value={typeof current === 'string' ? current : ''}
                    placeholder={questionCardText(lang, 'customPlaceholder')}
                    onChange={(e) => setSingle(q.id, e.target.value)}
                  />
                )}

                {q.allowCustom && q.type !== 'text' && (
                  <input
                    type="text"
                    className="ai-qcard-input"
                    aria-label={`${q.label} custom`}
                    value={customDrafts[q.id] ?? ''}
                    placeholder={questionCardText(lang, 'customPlaceholder')}
                    onChange={(e) => {
                      const val = e.target.value
                      setCustomDrafts((prev) => ({ ...prev, [q.id]: val }))
                      if (q.type === 'checkbox') {
                        const trimmed = val.trim()
                        const base = (Array.isArray(current) ? current : []).filter((item) =>
                          opts.some((o) => o.value === item),
                        )
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: trimmed ? [...base, trimmed] : base,
                        }))
                      } else {
                        setSingle(q.id, val)
                      }
                    }}
                  />
                )}
              </div>
            )
          })}

          <div className="ai-qcard-actions">
            <button
              type="button"
              className="ai-qcard-btn-primary"
              disabled={!canSubmit}
              onClick={() => onSubmit?.(answers)}
            >
              {questionCardText(lang, 'confirmContinue')}
            </button>
            <button type="button" className="ai-qcard-btn-secondary" onClick={() => onSkip?.()}>
              {questionCardText(lang, 'skipAuto')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
