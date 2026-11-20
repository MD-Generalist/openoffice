import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { docPickedOf, type DocAttachPicked } from './DocAttachButton'
import { drivePickedOf, type DriveAttachPicked } from './DriveAttachButton'
import { IconCloudDrive, IconFileDoc, IconPaperclip, IconPlus } from './icons'
import { useDismissablePopover } from './popover-dismiss'
import { aiPanelText } from './strings-ai-panel'

interface DocAttachBridge {
  available(): Promise<boolean>
  pick(): Promise<unknown>
}

interface DriveAttachBridge {
  driveConnected(): Promise<boolean>
  onDriveConnectedChanged(listener: (connected: boolean) => void): () => void
  drivePickAttachments(): Promise<unknown>
}

function docBridge(): DocAttachBridge | null {
  const b = (globalThis as { aiOfficeDocs?: Partial<DocAttachBridge> }).aiOfficeDocs
  return typeof b?.available === 'function' && typeof b.pick === 'function'
    ? (b as DocAttachBridge)
    : null
}

function driveBridge(): DriveAttachBridge | null {
  const b = (globalThis as { aiOfficeDriveAi?: Partial<DriveAttachBridge> }).aiOfficeDriveAi
  return typeof b?.driveConnected === 'function' &&
    typeof b.onDriveConnectedChanged === 'function' &&
    typeof b.drivePickAttachments === 'function'
    ? (b as DriveAttachBridge)
    : null
}

export interface AiAttachMenuProps {
  readonly lang: Lang
  /** Local computer file picker callback; omit on editors without local file attachments */
  readonly onPickPc?: (() => void) | undefined
  /** Called with paths/notes picked from the GenOffice document chooser */
  readonly onPickedDocs?: ((picked: DocAttachPicked) => void | Promise<void>) | undefined
  /** Called with paths/notes downloaded from Google Drive */
  readonly onPickedDrive?: ((picked: DriveAttachPicked) => void | Promise<void>) | undefined
  readonly disabled?: boolean | undefined
}

/**
 * Unified "+" attachment menu consolidating local PC files, open/recent
 * GenOffice documents, and Google Drive into one clean popover trigger.
 * Renders nothing when no attachment source is available (e.g. PDF, Markdown).
 */
export function AiAttachMenu({
  lang,
  onPickPc,
  onPickedDocs,
  onPickedDrive,
  disabled = false,
}: AiAttachMenuProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [docsReady, setDocsReady] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [pickingDocs, setPickingDocs] = useState(false)
  const [pickingDrive, setPickingDrive] = useState(false)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!onPickedDocs) return
    const b = docBridge()
    if (!b) return
    let live = true
    void b.available().then((v) => live && setDocsReady(v === true))
    return () => {
      live = false
    }
  }, [onPickedDocs])

  useEffect(() => {
    if (!onPickedDrive) return
    const b = driveBridge()
    if (!b) return
    let live = true
    void b.driveConnected().then((v) => live && setDriveConnected(v === true))
    const off = b.onDriveConnectedChanged((v) => setDriveConnected(v))
    return () => {
      live = false
      off()
    }
  }, [onPickedDrive])

  useDismissablePopover(open, () => setOpen(false), {
    inside: () => [triggerRef.current, popRef.current],
    escape: false,
  })

  // Capture Escape so closing this menu never stops an active AI run
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = 224
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
    const bottom = Math.max(8, window.innerHeight - rect.top + 6)
    setPos({ left, bottom })
  }, [open])

  const hasPc = typeof onPickPc === 'function'
  const hasDocs = docsReady && typeof onPickedDocs === 'function'
  const hasDrive = driveConnected && typeof onPickedDrive === 'function'

  if (!hasPc && !hasDocs && !hasDrive) return null

  const label = aiPanelText(lang, 'attachMenuLabel')

  const pickDocs = async () => {
    const b = docBridge()
    if (!b || !onPickedDocs || pickingDocs) return
    setOpen(false)
    setPickingDocs(true)
    try {
      const picked = docPickedOf(await b.pick(), lang)
      if (picked.paths.length > 0 || picked.notes.length > 0) await onPickedDocs(picked)
    } finally {
      setPickingDocs(false)
    }
  }

  const pickDrive = async () => {
    const b = driveBridge()
    if (!b || !onPickedDrive || pickingDrive) return
    setOpen(false)
    setPickingDrive(true)
    try {
      const picked = drivePickedOf(await b.drivePickAttachments(), lang)
      if (picked.paths.length > 0 || picked.notes.length > 0) await onPickedDrive(picked)
    } finally {
      setPickingDrive(false)
    }
  }

  return (
    <span className="ai-attach-menu">
      <button
        ref={triggerRef}
        type="button"
        className="ai-composer-icon-btn ai-attach-menu-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip={label}
        aria-label={label}
      >
        <IconPlus size={16} />
      </button>
      {open && (
        <div
          ref={popRef}
          className="ai-attach-menu-pop"
          role="menu"
          aria-label={label}
          style={pos ? { left: pos.left, bottom: pos.bottom } : undefined}
        >
          {hasPc && (
            <button
              type="button"
              role="menuitem"
              data-source="pc"
              className="ai-attach-menu-item"
              onClick={() => {
                setOpen(false)
                onPickPc()
              }}
            >
              <span className="ai-attach-menu-item-icon" aria-hidden="true">
                <IconPaperclip size={15} />
              </span>
              <span>{aiPanelText(lang, 'attachFromPc')}</span>
            </button>
          )}
          {hasDocs && (
            <button
              type="button"
              role="menuitem"
              data-source="docs"
              className="ai-attach-menu-item"
              disabled={pickingDocs}
              onClick={() => void pickDocs()}
            >
              <span className="ai-attach-menu-item-icon" aria-hidden="true">
                <IconFileDoc size={15} />
              </span>
              <span>{aiPanelText(lang, 'attachFromDocs')}</span>
            </button>
          )}
          {hasDrive && (
            <button
              type="button"
              role="menuitem"
              data-source="drive"
              className="ai-attach-menu-item"
              disabled={pickingDrive}
              onClick={() => void pickDrive()}
            >
              <span className="ai-attach-menu-item-icon" aria-hidden="true">
                <IconCloudDrive size={15} />
              </span>
              <span>{aiPanelText(lang, 'attachFromDrive')}</span>
            </button>
          )}
        </div>
      )}
    </span>
  )
}
