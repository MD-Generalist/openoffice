import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createEditor, type RhwpEditor } from '@rhwp/editor'
import type { Lang } from '@genoffice/i18n'
import type { DocumentMode } from '@genoffice/mobile-bridge/view-edit-gate'
import type { MobileTheme } from '@genoffice/mobile-bridge/transport'
import {
  MOBILE_STUDIO_SETTINGS_KEY,
  mobileHwpStudioUrl,
  seedMobileHwpStudioSettings,
  type MobileHwpEditorPort,
} from '@genoffice/mobile-bridge/hwp'
import { registerMobileKoreanFonts } from '../assets/fonts'

export type HwpQuickAction = 'undo' | 'redo' | 'bold' | 'italic' | 'underline'

export interface HwpMobileEditorHandle {
  readonly getSavePort: () => MobileHwpEditorPort
  readonly runAction: (action: HwpQuickAction) => void
  readonly fitToWidth: () => void
}

export interface HwpMobileEditorProps {
  readonly fileName: string
  readonly documentBytes: Uint8Array | null
  readonly mode: DocumentMode
  readonly lang: Lang
  readonly theme: MobileTheme
  readonly onDirty: () => void
  readonly onReady?: () => void
  readonly onError?: (message: string) => void
}

const PASSWORD_FLAG = 'ieumPasswordProtected'
const STUDIO_DIRTY_EVENT = 'ieum:dirty'
const DIRTY_POLL_MS = 2000

export const HwpMobileEditor = forwardRef<HwpMobileEditorHandle, HwpMobileEditorProps>(
  function HwpMobileEditor(
    { fileName, documentBytes, mode, lang, theme, onDirty, onReady, onError },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const editorRef = useRef<RhwpEditor | null>(null)
    const [zoom, setZoom] = useState(1)

    // Keep callback props in refs so parent re-renders never tear down and reload rhwp-studio.
    const onDirtyRef = useRef(onDirty)
    onDirtyRef.current = onDirty
    const onReadyRef = useRef(onReady)
    onReadyRef.current = onReady
    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    useEffect(() => {
      let cancelled = false
      let dirtyPoll: ReturnType<typeof setInterval> | null = null
      let frameWindow: Window | null = null
      let lastReportedDirty = false
      const container = containerRef.current
      if (!container) return

      const onFrameDirty = (event: Event) => {
        const isDirty = (event as CustomEvent<unknown>).detail === true
        if (isDirty && !lastReportedDirty) {
          lastReportedDirty = true
          onDirtyRef.current()
        }
      }

      void (async () => {
        try {
          // Force Canvas2D renderer (no canvaskit-wasm) and disable studio draft autosave.
          if (typeof localStorage !== 'undefined') {
            const current = localStorage.getItem(MOBILE_STUDIO_SETTINGS_KEY)
            localStorage.setItem(
              MOBILE_STUDIO_SETTINGS_KEY,
              seedMobileHwpStudioSettings(current, theme),
            )
          }
          await registerMobileKoreanFonts()
          if (cancelled) return

          const studioUrl = mobileHwpStudioUrl(lang)
          const editor = await createEditor(container, {
            studioUrl,
          })
          if (cancelled) {
            editor.destroy()
            return
          }
          editorRef.current = editor

          if (documentBytes && documentBytes.byteLength > 0) {
            await editor.loadFile(documentBytes, fileName, { skipUnsavedGuard: true })
          }
          if (cancelled) return

          frameWindow = editor.element?.contentWindow ?? null
          frameWindow?.addEventListener(STUDIO_DIRTY_EVENT, onFrameDirty)
          dirtyPoll = setInterval(() => {
            void editor.commands
              .context()
              .then((ctx) => {
                const record = ctx as Record<string, unknown>
                if ((record.isDirty === true || record.modified === true) && !lastReportedDirty) {
                  lastReportedDirty = true
                  onDirtyRef.current()
                }
              })
              .catch(() => {})
          }, DIRTY_POLL_MS)

          onReadyRef.current?.()
        } catch (err) {
          if (!cancelled) {
            onErrorRef.current?.(err instanceof Error ? err.message : String(err))
          }
        }
      })()

      return () => {
        cancelled = true
        if (dirtyPoll) clearInterval(dirtyPoll)
        frameWindow?.removeEventListener(STUDIO_DIRTY_EVENT, onFrameDirty)
        const current = editorRef.current
        editorRef.current = null
        try {
          current?.destroy()
        } catch {
          // Ignore teardown errors when switching documents quickly.
        }
      }
    }, [documentBytes, fileName, lang, theme])

    // Sync view/read-only state inside rhwp-studio without blocking touch scroll or pinch zoom.
    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const readOnly = mode === 'view'
      const raw = editor.commands as unknown as {
        execute: (id: string, payload?: Record<string, unknown>) => Promise<unknown>
      }
      void raw.execute('view.setReadOnly', { readOnly }).catch(() => {})
    }, [mode])

    useImperativeHandle(
      ref,
      () => ({
        getSavePort(): MobileHwpEditorPort {
          const requireEditor = (): RhwpEditor => {
            const ed = editorRef.current
            if (!ed) throw new Error('HWP editor is not ready.')
            return ed
          }
          return {
            async isPasswordProtected() {
              const ed = requireEditor()
              const ctx = (await ed.commands.context()) as Record<string, unknown>
              const flag = ctx[PASSWORD_FLAG]
              return typeof flag === 'boolean' ? flag : true
            },
            exportHwp: () => requireEditor().exportHwp(),
            exportHwpx: () => requireEditor().exportHwpx(),
            exportHwpVerify: () => requireEditor().exportHwpVerify(),
            async measureTabs() {
              return []
            },
            async getPlainText() {
              const ed = requireEditor()
              const raw = ed as unknown as {
                getText?: () => Promise<string>
                commands: { execute: (id: string) => Promise<unknown> }
              }
              if (typeof raw.getText === 'function') {
                return raw.getText()
              }
              return ''
            },
            async replaceText(find, replace) {
              const ed = requireEditor()
              const raw = ed as unknown as {
                commands: {
                  execute: (id: string, payload?: Record<string, unknown>) => Promise<unknown>
                }
              }
              try {
                await raw.commands.execute('edit.replace', { find, replace })
                onDirtyRef.current()
                return true
              } catch {
                return false
              }
            },
            async notifySaved(savedName) {
              const ed = requireEditor()
              const raw = ed as unknown as { notifySaved?: (name?: string) => Promise<void> }
              await raw.notifySaved?.(savedName)
            },
          }
        },
        runAction(action) {
          const ed = editorRef.current
          if (!ed) return
          const map: Record<HwpQuickAction, string> = {
            undo: 'edit.undo',
            redo: 'edit.redo',
            bold: 'format.bold',
            italic: 'format.italic',
            underline: 'format.underline',
          }
          void ed.commands
            .execute(map[action])
            .then(() => onDirtyRef.current())
            .catch(() => {})
        },
        fitToWidth() {
          setZoom(1)
        },
      }),
      [],
    )

    return (
      <div
        className="mobile-doc-viewport"
        data-editor="hwp"
        data-renderer="canvas2d"
        data-mode={mode}
      >
        <div
          ref={containerRef}
          className="mobile-hwp-frame-host"
          style={{
            transform: zoom === 1 ? undefined : `scale(${zoom})`,
            transformOrigin: 'top left',
            touchAction: 'pan-x pan-y pinch-zoom',
          }}
          aria-label={fileName}
        />
      </div>
    )
  },
)
