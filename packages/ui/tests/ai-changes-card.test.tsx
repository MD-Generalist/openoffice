/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChangesCard, type AiChangeLine } from '../src/AiChangesCard'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AiChangesCard', () => {
  const lines: AiChangeLine[] = [
    { key: 'a', mark: '+', place: 'Slide 2', summary: 'Added heading', showable: true },
    { key: 'b', mark: '-', place: 'Slide 3', summary: 'Removed note', showable: false },
  ]

  it('renders jump button with arrow icon on showable rows and invokes onShowLine', () => {
    const onShowLine = vi.fn()
    act(() => {
      root.render(
        <AiChangesCard
          lang="ko"
          count={2}
          state="applied"
          lines={lines}
          onShowLine={onShowLine}
          onUndo={vi.fn()}
        />,
      )
    })

    const toggle = container.querySelector<HTMLButtonElement>('.ai-run-changes-toggle')!
    act(() => {
      toggle.click()
    })

    const showButtons = container.querySelectorAll<HTMLButtonElement>('.ai-run-change-show')
    expect(showButtons).toHaveLength(1)
    expect(showButtons[0]!.querySelector('.ai-run-change-jump svg')).not.toBeNull()

    act(() => {
      showButtons[0]!.click()
    })
    expect(onShowLine).toHaveBeenCalledWith(lines[0])
  })

  it('disables jump buttons when changes are undone', () => {
    act(() => {
      root.render(
        <AiChangesCard
          lang="en"
          count={2}
          state="undone"
          lines={lines}
          onShowLine={vi.fn()}
        />,
      )
    })
    const toggle = container.querySelector<HTMLButtonElement>('.ai-run-changes-toggle')!
    act(() => {
      toggle.click()
    })
    expect(container.querySelector('.ai-run-change-show')).toBeNull()
  })
})
