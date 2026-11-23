import { describe, expect, it, vi } from 'vitest'
import { ASK_QUESTIONS_TOOL, createAskQuestionsSkill } from '../src/ask-questions-skill'

describe('createAskQuestionsSkill', () => {
  it('validates arguments, returns submitted answers, and rejects a second call in the same run', async () => {
    const ask = vi.fn().mockResolvedValue({ submitted: true, answers: { tone: 'formal' } })
    const skill = createAskQuestionsSkill({ ask })

    const firstExec = await skill.executeTool({
      id: 'c1',
      name: ASK_QUESTIONS_TOOL,
      input: {
        title: 'Confirm direction',
        questions: [{ id: 'tone', label: 'Tone', type: 'radio', options: ['formal', 'casual'] }],
      },
    })
    expect(firstExec.isError).toBeUndefined()
    expect(JSON.parse(firstExec.output)).toEqual({
      ok: true,
      submitted: true,
      answers: { tone: 'formal' },
    })
    expect(ask).toHaveBeenCalledTimes(1)

    const secondExec = await skill.executeTool({
      id: 'c2',
      name: ASK_QUESTIONS_TOOL,
      input: {
        title: 'Second ask',
        questions: [{ id: 'q2', label: 'More?', type: 'text' }],
      },
    })
    expect(secondExec.isError).toBe(true)
    expect(JSON.parse(secondExec.output).message).toContain('Already asked once in this turn')
    expect(ask).toHaveBeenCalledTimes(1)

    // Starting a new user turn resets the single-call guard
    skill.resetTurn()
    const nextTurnExec = await skill.executeTool({
      id: 'c2b',
      name: ASK_QUESTIONS_TOOL,
      input: {
        title: 'Next turn',
        questions: [{ id: 'q3', label: 'Audience?', type: 'text' }],
      },
    })
    expect(nextTurnExec.isError).toBeUndefined()
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid question counts without invoking UI', async () => {
    const ask = vi.fn()
    const skill = createAskQuestionsSkill({ ask })
    const res = await skill.executeTool({
      id: 'c3',
      name: ASK_QUESTIONS_TOOL,
      input: { title: 'Bad', questions: [] },
    })
    expect(res.isError).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })
})
