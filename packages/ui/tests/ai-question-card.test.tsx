// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { AiQuestionCard } from '../src/AiQuestionCard'
import { questionCardText } from '../src/strings-question-card'
import type { QuestionFormSpec } from '../src/question-form'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SPEC: QuestionFormSpec = {
  id: 'q1',
  title: '보고서 방향 확인',
  questions: [
    {
      id: 'audience',
      label: '대상 독자',
      type: 'radio',
      options: ['임원진', '실무팀'],
      default: '임원진',
      required: true,
    },
    {
      id: 'notes',
      label: '추가 메모',
      type: 'text',
      required: true,
    },
  ],
}

describe('AiQuestionCard', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('pre-selects defaults, disables confirm until required fields are filled, and supports skip', () => {
    const onSubmit = vi.fn()
    const onSkip = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <AiQuestionCard spec={SPEC} status="open" lang="ko" onSubmit={onSubmit} onSkip={onSkip} />,
      )
    })

    const submitBtn = host.querySelector('.ai-qcard-btn-primary') as HTMLButtonElement
    const skipBtn = host.querySelector('.ai-qcard-btn-secondary') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    act(() => {
      skipBtn.click()
    })
    expect(onSkip).toHaveBeenCalledTimes(1)

    const input = host.querySelector('input[type="text"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '핵심 성과 강조')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(submitBtn.disabled).toBe(false)

    act(() => {
      submitBtn.click()
    })
    expect(onSubmit).toHaveBeenCalledWith({ audience: '임원진', notes: '핵심 성과 강조' })

    act(() => {
      root.unmount()
    })
  })

  it('renders read-only locked summary for submitted/skipped/superseded states', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <AiQuestionCard
          spec={SPEC}
          status="submitted"
          lang="ko"
          savedAnswers={{ audience: '실무팀', notes: '간결하게' }}
        />,
      )
    })

    expect(host.querySelector('.ai-qcard-btn-primary')).toBeNull()
    expect(host.textContent).toContain('실무팀')
    expect(host.textContent).toContain(questionCardText('ko', 'statusSubmitted'))

    act(() => {
      root.unmount()
    })
  })

  it('has native translations for all 22 languages', () => {
    const en = questionCardText('en', 'confirmContinue')
    for (const lang of LANGS) {
      const text = questionCardText(lang, 'confirmContinue')
      expect(text, lang).toBeTruthy()
      if (lang !== 'en') expect(text, lang).not.toBe(en)
    }
  })
})
