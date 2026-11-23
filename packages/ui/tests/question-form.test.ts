import { describe, expect, it } from 'vitest'
import {
  formatQuestionFormAnswers,
  initialQuestionFormAnswers,
  isQuestionFormComplete,
  parseQuestionFormBlocks,
  validateQuestionFormSpec,
} from '../src/question-form'

describe('question-form parser and validator', () => {
  const validJson = JSON.stringify({
    id: 'brief-1',
    title: '문서 방향 확인',
    questions: [
      {
        id: 'tone',
        label: '문체',
        type: 'radio',
        options: ['격식체', '부드러운 보고체'],
        default: '격식체',
        required: true,
      },
      {
        id: 'topics',
        label: '강조할 항목',
        type: 'checkbox',
        options: ['일정', '예산', '리스크'],
        maxSelections: 2,
      },
    ],
  })

  it('parses a complete <question-form> block cleanly', () => {
    const segs = parseQuestionFormBlocks(
      `먼저 확인하겠습니다.\n<question-form>${validJson}</question-form>`,
    )
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ kind: 'text', text: '먼저 확인하겠습니다.\n' })
    expect(segs[1]?.kind).toBe('form')
    if (segs[1]?.kind === 'form') {
      expect(segs[1].spec.questions).toHaveLength(2)
      expect(initialQuestionFormAnswers(segs[1].spec)).toEqual({
        tone: '격식체',
        topics: [],
      })
      expect(isQuestionFormComplete(segs[1].spec, { tone: '격식체', topics: [] })).toBe(true)
      expect(isQuestionFormComplete(segs[1].spec, { tone: '', topics: [] })).toBe(false)
    }
  })

  it('shows a pending segment while streaming an unclosed block and falls back to text when not streaming', () => {
    const partial = '확인 중\n<question-form>{"title":"미완성'
    expect(parseQuestionFormBlocks(partial, true)).toEqual([
      { kind: 'text', text: '확인 중\n' },
      { kind: 'pending' },
    ])
    expect(parseQuestionFormBlocks(partial, false)).toEqual([
      { kind: 'text', text: '확인 중\n' },
      { kind: 'text', text: '<question-form>{"title":"미완성' },
    ])
  })

  it('falls back to plain text on malformed JSON or out-of-range counts', () => {
    expect(parseQuestionFormBlocks('<question-form>{broken}</question-form>')).toEqual([
      { kind: 'text', text: '<question-form>{broken}</question-form>' },
    ])
    expect(
      validateQuestionFormSpec({
        title: 'Too many',
        questions: Array.from({ length: 6 }, (_, i) => ({
          id: `q${i}`,
          label: `Q${i}`,
          type: 'text',
        })),
      }),
    ).toBeNull()
    expect(
      validateQuestionFormSpec({
        title: 'Too many options',
        questions: [
          {
            id: 'q1',
            label: 'Q1',
            type: 'radio',
            options: ['1', '2', '3', '4', '5', '6', '7', '8'],
          },
        ],
      }),
    ).toBeNull()
  })

  it('formats submitted and skipped summaries cleanly', () => {
    const spec = validateQuestionFormSpec(JSON.parse(validJson))!
    expect(formatQuestionFormAnswers(spec, { tone: '격식체', topics: ['일정'] }, false)).toContain(
      '- 문체: 격식체',
    )
    expect(formatQuestionFormAnswers(spec, {}, true)).toContain('Skipped')
  })
})
