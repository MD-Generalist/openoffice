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

export const HwpMobileEditor = forwardRef<HwpMobileEditorHandle, HwpMobileEditorProps>(
  function HwpMobileEditor(
    { fileName, documentBytes, mode, lang, theme, onDirty, onReady, onError },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const editorRef = useRef<RhwpEditor | null>(null)
    const [zoom, setZoom] = useState(1)

    useEffect(() => {
      let cancelled = false
      const container = containerRef.current
      if (!container) return

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
          const editor = await createEditor({
            container,
            studioUrl,
          })
          if (cancelled) {
            editor.destroy()
            return
          }
          editorRef.current = editor

          if (documentBytes && documentBytes.byteLength > 0) {
            await editor.loadDocument(documentBytes, fileName)
          }
          onReady?.()
        } catch (err) {
          if (!cancelled) {
            onError?.(err instanceof Error ? err.message : String(err))
          }
        }
      })()

      return () => {
        cancelled = true
        const current = editorRef.current
        editorRef.current = null
        try {
          current?.destroy()
        } catch {
          // Ignore teardown errors when switching documents quickly.
        }
      }
    }, [documentBytes, fileName, lang, onError, onReady, theme])

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
                onDirty()
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
          void ed.commands.execute(map[action]).then(() => onDirty()).catch(() => {})
        },
        fitToWidth() {
          setZoom(1)
        },
      }),
      [onDirty],
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
            pointerEvents: mode === 'view' ? 'none' : 'auto',
          }}
          aria-label={fileName}
        />
      </div>
    )
  },
)
