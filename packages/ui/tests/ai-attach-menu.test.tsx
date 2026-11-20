/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiAttachMenu } from '../src/AiAttachMenu'
import { aiPanelText } from '../src/strings-ai-panel'

const g = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
  aiOfficeDocs?: { available: () => Promise<boolean>; pick: () => Promise<unknown> }
  aiOfficeDriveAi?: {
    driveConnected: () => Promise<boolean>
    onDriveConnectedChanged: (fn: (connected: boolean) => void) => () => void
    drivePickAttachments: () => Promise<unknown>
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true
  delete g.aiOfficeDocs
  delete g.aiOfficeDriveAi
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete g.aiOfficeDocs
  delete g.aiOfficeDriveAi
})

describe('AiAttachMenu', () => {
  it('renders nothing when no attachment source is available', () => {
    act(() => {
      root.render(<AiAttachMenu lang="ko" />)
    })
    expect(container.querySelector('.ai-attach-menu')).toBeNull()
  })

  it('opens popover with only PC option when docs/drive bridges are absent', () => {
    const onPickPc = vi.fn()
    act(() => {
      root.render(<AiAttachMenu lang="ko" onPickPc={onPickPc} />)
    })
    const trigger = container.querySelector<HTMLButtonElement>('.ai-attach-menu-btn')!
    expect(trigger).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('.ai-attach-menu-item'))
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toContain(aiPanelText('ko', 'attachFromPc'))

    act(() => {
      items[0]!.click()
    })
    expect(onPickPc).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ai-attach-menu-pop')).toBeNull()
  })

  it('shows all three sources when PC, Docs, and Drive are available and stops Escape from propagating', async () => {
    g.aiOfficeDocs = {
      available: vi.fn().mockResolvedValue(true),
      pick: vi.fn().mockResolvedValue({ paths: ['/a.docx'] }),
    }
    g.aiOfficeDriveAi = {
      driveConnected: vi.fn().mockResolvedValue(true),
      onDriveConnectedChanged: vi.fn(() => () => {}),
      drivePickAttachments: vi.fn().mockResolvedValue({ paths: ['/b.pdf'] }),
    }
    const onPickedDocs = vi.fn()
    const onPickedDrive = vi.fn()
    await act(async () => {
      root.render(
        <AiAttachMenu
          lang="en"
          onPickPc={vi.fn()}
          onPickedDocs={onPickedDocs}
          onPickedDrive={onPickedDrive}
        />,
      )
      await Promise.resolve()
    })

    const trigger = container.querySelector<HTMLButtonElement>('.ai-attach-menu-btn')!
    act(() => {
      trigger.click()
    })
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('.ai-attach-menu-item'))
    expect(items).toHaveLength(3)

    // Bubble-phase window listener simulates a run-stop Escape handler
    const bubbleEscape = vi.fn()
    window.addEventListener('keydown', bubbleEscape, false)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    window.removeEventListener('keydown', bubbleEscape, false)

    expect(container.querySelector('.ai-attach-menu-pop')).toBeNull()
    expect(bubbleEscape).not.toHaveBeenCalled()
  })
})
