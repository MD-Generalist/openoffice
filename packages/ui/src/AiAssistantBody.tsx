/**
 * Renders an assistant reply's Markdown body alongside any embedded
 * `<question-form>` text-fallback block as the shared `AiQuestionCard` (T2/T9).
 */
import React from 'react'
import type { Lang } from '@genoffice/i18n'
import { Markdown, type MarkdownImage, type MarkdownNav } from './Markdown'
import { AiQuestionCard } from './AiQuestionCard'
import {
  parseQuestionFormBlocks,
  type QuestionCardStatus,
  type QuestionFormAnswers,
  type QuestionFormSpec,
} from './question-form'
import { questionCardText } from './strings-question-card'

export interface AiAssistantBodyProps {
  lang: Lang
  text: string
  nav?: MarkdownNav | undefined
  navs?: readonly MarkdownNav[] | undefined
  images?: MarkdownImage | undefined
  streaming?: boolean | undefined
  /** Status of any text-embedded `<question-form>` card in this message */
  questionStatus?: QuestionCardStatus | undefined
  savedAnswers?: QuestionFormAnswers | undefined
  onQuestionSubmit?: ((spec: QuestionFormSpec, answers: QuestionFormAnswers) => void) | undefined
  onQuestionSkip?: ((spec: QuestionFormSpec) => void) | undefined
}

export function AiAssistantBody({
  lang,
  text,
  nav,
  navs,
  images,
  streaming = false,
  questionStatus = 'open',
  savedAnswers,
  onQuestionSubmit,
  onQuestionSkip,
}: AiAssistantBodyProps): React.JSX.Element {
  const mdExtras = {
    ...(nav !== undefined ? { nav } : {}),
    ...(navs !== undefined ? { navs } : {}),
    ...(images !== undefined ? { images } : {}),
  }
  if (!text.includes('<question-form>')) {
    return <Markdown text={text} {...mdExtras} />
  }
  const segments = parseQuestionFormBlocks(text, streaming)
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <Markdown key={i} text={seg.text} {...mdExtras} />
        }
        if (seg.kind === 'pending') {
          return (
            <div key={i} className="ai-question-pending" role="status">
              {questionCardText(lang, 'preparing')}
            </div>
          )
        }
        return (
          <AiQuestionCard
            key={`${seg.spec.id}-${i}`}
            lang={lang}
            spec={seg.spec}
            status={streaming ? 'open' : questionStatus}
            savedAnswers={savedAnswers}
            onSubmit={(answers) => onQuestionSubmit?.(seg.spec, answers)}
            onSkip={() => onQuestionSkip?.(seg.spec)}
          />
        )
      })}
    </>
  )
}
