/**
 * Interactive whiteboard canvas editor:
 * - Toolbar (Select, Sticky, Text, Shape[8], Connector, Pen, Highlighter, Eraser,
 *   Image, Table, Sticker[19], Link Card, Import PDF, Undo/Redo, Zoom, Present F5, Export, Print)
 * - Contextual format bar for selected objects
 * - Interactive SVG stage with pan/zoom, move, resize, freehand pressure strokes,
 *   inline textarea editing (no innerHTML), link-card click -> safe external URL,
 *   non-destructive AI highlight overlays, and smart drag-drop (.pdf -> PDF background,
 *   raster image -> embed image, other files -> do not preventDefault so shell drop-open handles them)
 * - Page rail (freeform, 16:9, A4 portrait/landscape, rename, delete)
 * - Modals: Link Card (opt-in preview off by default), PDF page range, Export scope
 * - Presentation mode overlay (F5, Left/Right, Esc)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import {
  computeStrokeOutline,
  type BoardObject,
  type ConnectorProps,
  type ImageProps,
  type LinkProps,
  type PageFormat,
  type ShapeKind,
  type ShapeProps,
  type StickerProps,
  type StickyProps,
  type StrokeProps,
  type TableProps,
  type TextProps,
} from '@genoffice/whiteboard-engine'
import { openableLink } from '../../shared/links'
import type { ExportFormat } from '../../shared/ipc'
import { SHAPE_KINDS, shapePath } from '../canvas/shape-paths'
import { STICKER_IDS, StickerIcon } from '../canvas/stickers'
import type { WhiteboardSession } from '../document/session'
import {
  inspectPdfBytes,
  MAX_PDF_IMPORT_PAGES,
  parsePdfPageRange,
  renderPdfPagesToPng,
} from '../export/pdf-import'
import { renderPageToSvg, richTextPlain } from '../export/render-svg'
import { useI18n } from '../i18n/locale'

type ToolKind =
  'select' | 'sticky' | 'text' | 'shape' | 'connector' | 'pen' | 'highlighter' | 'eraser'

const STICKY_COLORS = ['#FEF08A', '#FBCFE8', '#BFDBFE', '#BBF7D0', '#FED7AA', '#DDD6FE'] as const
const STROKE_COLORS = ['#0F172A', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED'] as const
const LINK_PREVIEW_PREF = 'whiteboardapp.linkPreview'
const IMAGE_DROP_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function defaultTextRuns(text: string, color = '#0F172A', fontSize = 16) {
  return {
    paragraphs: text.split('\n').map((line) => ({
      runs: [{ text: line, color, fontSize }],
    })),
  }
}

export type WhiteboardEditorMenuAction = 'import-pdf' | 'zoom-in' | 'zoom-out' | 'zoom-fit'

export interface WhiteboardEditorProps {
  session: WhiteboardSession
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed'
  autoSave: boolean
  onToggleAutoSave(): void
  onExport(format: ExportFormat, scope: 'all' | 'current'): void
  onPrint(): void
  exportModalFormat: ExportFormat | null
  onCloseExportModal(): void
  onOpenExportModal(format: ExportFormat): void
  presenting: boolean
  onSetPresenting(v: boolean): void
  onToast(message: string): void
  menuCommand?: { seq: number; cmd: WhiteboardEditorMenuAction } | null
}

export function WhiteboardEditor({
  session,
  saveStatus,
  autoSave,
  onToggleAutoSave,
  onExport,
  onPrint,
  exportModalFormat,
  onCloseExportModal,
  onOpenExportModal,
  presenting,
  onSetPresenting,
  onToast,
  menuCommand,
}: WhiteboardEditorProps): ReactElement {
  const { t } = useI18n()
  const [, setTick] = useState(0)
  const [tool, setTool] = useState<ToolKind>('select')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rounded_rectangle')
  const [activeColor, setActiveColor] = useState<string>('#FEF08A')
  const [penColor, setPenColor] = useState<string>('#0F172A')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [stickerOpen, setStickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [exportScope, setExportScope] = useState<'all' | 'current'>('all')

  // Link card modal state (opt-in preview off by default, remembered per preference).
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkFetchPreview, setLinkFetchPreview] = useState(
    () => localStorage.getItem(LINK_PREVIEW_PREF) === '1',
  )
  const [linkBusy, setLinkBusy] = useState(false)

  // PDF import modal state.
  const [pdfPending, setPdfPending] = useState<{
    name: string
    bytes: Uint8Array
    pageCount: number
  } | null>(null)
  const [pdfRange, setPdfRange] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)

  // Active pointer interaction refs.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    kind: 'move' | 'pan' | 'draw' | 'resize'
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
    objectId?: string
    origX?: number
    origY?: number
    origW?: number
    origH?: number
    points?: Array<[number, number, number]>
  } | null>(null)
  const [liveStroke, setLiveStroke] = useState<Array<[number, number, number]> | null>(null)
  const [dragDelta, setDragDelta] = useState<{
    id: string
    dx: number
    dy: number
    dw: number
    dh: number
  } | null>(null)

  useEffect(() => session.subscribe(() => setTick((n) => n + 1)), [session])

  const doc = session.getDocument()
  const activePage = session.getActivePage()
  const activePageId = activePage?.id ?? ''
  const selectedIds = session.getSelection()
  const highlights = session.getHighlights()
  const highlightSet = useMemo(() => new Set(highlights), [highlights])
  const importSummary = session.getImportSummary()

  const pageObjects = useMemo(
    () =>
      doc.objects
        .filter((o) => o.pageId === activePageId)
        .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)),
    [doc, activePageId],
  )
  const objectsById = useMemo(() => new Map(pageObjects.map((o) => [o.id, o])), [pageObjects])

  const selectedObj = selectedIds.length === 1 ? (objectsById.get(selectedIds[0]!) ?? null) : null

  const clientToBoard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      }
    },
    [pan.x, pan.y, zoom],
  )

  const handleFitZoom = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || !activePage) {
      setZoom(1)
      setPan({ x: 40, y: 40 })
      return
    }
    const targetW = activePage.format === 'freeform' ? 1280 : activePage.width || 1280
    const targetH = activePage.format === 'freeform' ? 800 : activePage.height || 720
    const nextZoom = Math.max(
      0.2,
      Math.min(2, Math.min((rect.width - 64) / targetW, (rect.height - 64) / targetH)),
    )
    setZoom(Number(nextZoom.toFixed(2)))
    setPan({
      x: Math.round((rect.width - targetW * nextZoom) / 2),
      y: Math.round((rect.height - targetH * nextZoom) / 2),
    })
  }, [activePage])

  // Keyboard shortcuts (Undo, Redo, Delete, F5, Escape, Present arrows).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null
      const typing =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)

      if (presenting) {
        if (e.key === 'Escape' || e.key === 'F5') {
          e.preventDefault()
          onSetPresenting(false)
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault()
          const idx = doc.pages.findIndex((p) => p.id === activePageId)
          if (idx >= 0 && idx + 1 < doc.pages.length) {
            session.setActivePageId(doc.pages[idx + 1]!.id)
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault()
          const idx = doc.pages.findIndex((p) => p.id === activePageId)
          if (idx > 0) {
            session.setActivePageId(doc.pages[idx - 1]!.id)
          }
        }
        return
      }

      if (typing) return
      if (e.key === 'F5') {
        e.preventDefault()
        onSetPresenting(true)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) session.redo()
        else session.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        session.redo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (session.getSelection().length > 0) {
          e.preventDefault()
          session.deleteSelected()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePageId, doc.pages, onSetPresenting, presenting, session])

  // Inline text commit.
  const commitInlineEdit = useCallback(() => {
    if (!editingId) return
    const obj = objectsById.get(editingId)
    const text = editingText
    setEditingId(null)
    if (!obj) return
    if (obj.kind === 'sticky' || obj.kind === 'text' || obj.kind === 'shape') {
      session.updateObject(obj.id, { text: defaultTextRuns(text) })
    }
  }, [editingId, editingText, objectsById, session])

  const startInlineEdit = useCallback((obj: BoardObject) => {
    if (obj.kind !== 'sticky' && obj.kind !== 'text' && obj.kind !== 'shape') return
    const p = obj.props as unknown as StickyProps | TextProps | ShapeProps
    setEditingId(obj.id)
    setEditingText(richTextPlain(p.text))
  }, [])

  // Add helpers.
  const handleAddSticker = useCallback(
    (stickerId: string) => {
      session.addObject({
        kind: 'sticker',
        stickerId,
        width: 96,
        height: 96,
      })
      setStickerOpen(false)
      setTool('select')
    },
    [session],
  )

  const handleAddTable = useCallback(() => {
    session.addObject({
      kind: 'table',
      width: 360,
      height: 160,
      rowIds: ['r1', 'r2', 'r3'],
      colIds: ['c1', 'c2', 'c3'],
      headerRow: true,
      cells: {
        'r1:c1': defaultTextRuns('Column 1'),
        'r1:c2': defaultTextRuns('Column 2'),
        'r1:c3': defaultTextRuns('Column 3'),
      },
    })
    setTool('select')
  }, [session])

  const handlePickImage = useCallback(async () => {
    const picked = await window.whiteboardApi.core.pickImageFile()
    if (!picked.ok || !picked.bytes) return
    const res = await session.insertImage({ bytes: picked.bytes, alt: picked.name })
    if (!res.ok) onToast(res.error)
  }, [onToast, session])

  const openPdfBytesForImport = useCallback(
    async (bytes: Uint8Array, name: string) => {
      try {
        const info = await inspectPdfBytes(bytes)
        if (info.pageCount <= 0) {
          onToast(t('pdfImportFailed', { error: 'empty PDF' }))
          return
        }
        if (info.pageCount === 1) {
          const rendered = await renderPdfPagesToPng(bytes, [1])
          session.importPdfPages(rendered, name.replace(/\.pdf$/i, ''))
          return
        }
        setPdfPending({ name, bytes, pageCount: info.pageCount })
        setPdfRange(`1-${Math.min(info.pageCount, MAX_PDF_IMPORT_PAGES)}`)
      } catch (err) {
        onToast(
          t('pdfImportFailed', {
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    },
    [onToast, session, t],
  )

  const handlePickPdf = useCallback(async () => {
    const picked = await window.whiteboardApi.core.pickPdfFile()
    if (!picked.ok || !picked.bytes) return
    await openPdfBytesForImport(picked.bytes, picked.name ?? 'PDF')
  }, [openPdfBytesForImport])

  const lastMenuSeqRef = useRef(0)
  useEffect(() => {
    if (!menuCommand || menuCommand.seq === lastMenuSeqRef.current) return
    lastMenuSeqRef.current = menuCommand.seq
    if (menuCommand.cmd === 'import-pdf') {
      void handlePickPdf()
    } else if (menuCommand.cmd === 'zoom-in') {
      setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))
    } else if (menuCommand.cmd === 'zoom-out') {
      setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))
    } else if (menuCommand.cmd === 'zoom-fit') {
      handleFitZoom()
    }
  }, [handleFitZoom, handlePickPdf, menuCommand])

  const handleConfirmPdfImport = useCallback(async () => {
    if (!pdfPending || pdfBusy) return
    setPdfBusy(true)
    try {
      const nums = parsePdfPageRange(pdfRange, pdfPending.pageCount, MAX_PDF_IMPORT_PAGES)
      if (nums.length === 0) {
        onToast(t('pdfImportFailed', { error: 'no pages selected' }))
        return
      }
      const rendered = await renderPdfPagesToPng(pdfPending.bytes, nums)
      session.importPdfPages(rendered, pdfPending.name.replace(/\.pdf$/i, ''))
      setPdfPending(null)
    } catch (err) {
      onToast(
        t('pdfImportFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setPdfBusy(false)
    }
  }, [onToast, pdfBusy, pdfPending, pdfRange, session, t])

  const handleConfirmLinkCard = useCallback(async () => {
    const safe = openableLink(linkUrl)
    if (!safe) {
      onToast(t('linkInvalidUrl'))
      return
    }
    localStorage.setItem(LINK_PREVIEW_PREF, linkFetchPreview ? '1' : '0')
    let title = linkTitle.trim()
    let description: string | undefined
    let previewResourceId: string | undefined

    if (linkFetchPreview && /^https?:\/\//i.test(safe)) {
      setLinkBusy(true)
      try {
        const preview = await window.whiteboardApi.core.readLinkPreview(safe)
        if (preview.ok) {
          if (!title && preview.title) title = preview.title
          if (preview.description) description = preview.description
          if (preview.imageBytes && preview.imageBytes.length > 0) {
            const added = session.addImageResource(preview.imageBytes)
            previewResourceId = added.resourceId
          }
        } else {
          onToast(t('linkPreviewFailed'))
        }
      } catch {
        onToast(t('linkPreviewFailed'))
      } finally {
        setLinkBusy(false)
      }
    }

    session.addObject({
      kind: 'link',
      url: safe,
      title: title || safe,
      ...(description ? { description } : {}),
      ...(previewResourceId ? { previewResourceId } : {}),
      width: 300,
      height: previewResourceId ? 176 : 92,
    })
    setLinkModalOpen(false)
    setLinkUrl('')
    setLinkTitle('')
  }, [linkFetchPreview, linkTitle, linkUrl, onToast, session, t])

  // Drag & drop routing:
  // - `.pdf` dropped onto whiteboard -> PDF page background import
  // - raster image dropped onto whiteboard -> embed image on canvas
  // - other document types -> do NOT call preventDefault() so shell drop-open opens them in a new tab!
  const isBoardDroppable = useCallback((dt: DataTransfer | null): boolean => {
    if (!dt) return false
    const files = Array.from(dt.files ?? [])
    if (files.length === 0) return false
    return files.every((f) => {
      const ext = fileExt(f.name)
      return ext === 'pdf' || IMAGE_DROP_EXTS.has(ext)
    })
  }, [])

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (isBoardDroppable(e.dataTransfer)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    [isBoardDroppable],
  )

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!isBoardDroppable(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer.files)
      const pt = clientToBoard(e.clientX, e.clientY)
      for (const file of files) {
        const ext = fileExt(file.name)
        const buf = new Uint8Array(await file.arrayBuffer())
        if (ext === 'pdf') {
          await openPdfBytesForImport(buf, file.name)
        } else if (IMAGE_DROP_EXTS.has(ext)) {
          const res = await session.insertImage({ bytes: buf, alt: file.name, x: pt.x, y: pt.y })
          if (!res.ok) onToast(res.error)
        }
      }
    },
    [clientToBoard, isBoardDroppable, onToast, openPdfBytesForImport, session],
  )

  // Stage pointer handlers.
  const handleStagePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (editingId) commitInlineEdit()
      const pt = clientToBoard(e.clientX, e.clientY)

      if (e.button === 1 || (tool === 'select' && e.altKey)) {
        dragRef.current = {
          kind: 'pan',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        }
        return
      }

      if (tool === 'sticky') {
        session.addObject({
          kind: 'sticky',
          x: pt.x - 100,
          y: pt.y - 80,
          width: 200,
          height: 160,
          color: activeColor,
          text: defaultTextRuns(t('defaultStickyText')),
        })
        setTool('select')
        return
      }
      if (tool === 'text') {
        session.addObject({
          kind: 'text',
          x: pt.x - 100,
          y: pt.y - 24,
          width: 220,
          height: 48,
          text: defaultTextRuns(t('defaultText'), '#0F172A', 18),
        })
        setTool('select')
        return
      }
      if (tool === 'shape') {
        session.addObject({
          kind: 'shape',
          shape: shapeKind,
          x: pt.x - 80,
          y: pt.y - 50,
          width: 160,
          height: 100,
          fill: '#FFFFFF',
          stroke: '#0F172A',
          strokeWidth: 2,
          text: defaultTextRuns(''),
        })
        setTool('select')
        return
      }
      if (tool === 'connector') {
        session.addObject({
          kind: 'connector',
          start: { x: pt.x, y: pt.y },
          end: { x: pt.x + 180, y: pt.y },
          color: '#0F172A',
          strokeWidth: 2,
          endHead: 'arrow',
        })
        setTool('select')
        return
      }
      if (tool === 'pen' || tool === 'highlighter') {
        const pressure = e.pressure > 0 ? e.pressure : 0.5
        const pts: Array<[number, number, number]> = [[pt.x, pt.y, pressure]]
        dragRef.current = {
          kind: 'draw',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          points: pts,
        }
        setLiveStroke(pts)
        return
      }

      // Click empty stage clears selection.
      session.setSelection([])
    },
    [
      activeColor,
      clientToBoard,
      commitInlineEdit,
      editingId,
      pan.x,
      pan.y,
      session,
      shapeKind,
      t,
      tool,
    ],
  )

  const handleObjectPointerDown = useCallback(
    (e: ReactPointerEvent, obj: BoardObject) => {
      e.stopPropagation()
      if (editingId && editingId !== obj.id) commitInlineEdit()

      if (tool === 'eraser') {
        session.setSelection([obj.id])
        session.deleteSelected()
        return
      }
      if (tool !== 'select') return

      session.setSelection([obj.id])
      dragRef.current = {
        kind: 'move',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        objectId: obj.id,
        origX: obj.x,
        origY: obj.y,
        origW: obj.width,
        origH: obj.height,
      }
    },
    [commitInlineEdit, editingId, pan.x, pan.y, session, tool],
  )

  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent, obj: BoardObject) => {
      e.stopPropagation()
      dragRef.current = {
        kind: 'resize',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        objectId: obj.id,
        origX: obj.x,
        origY: obj.y,
        origW: obj.width,
        origH: obj.height,
      }
    },
    [pan.x, pan.y],
  )

  const handleStagePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'pan') {
        setPan({
          x: drag.startPanX + (e.clientX - drag.startClientX),
          y: drag.startPanY + (e.clientY - drag.startClientY),
        })
        return
      }
      if (drag.kind === 'draw' && drag.points) {
        const pt = clientToBoard(e.clientX, e.clientY)
        const pressure = e.pressure > 0 ? e.pressure : 0.5
        drag.points.push([pt.x, pt.y, pressure])
        setLiveStroke([...drag.points])
        return
      }
      if (drag.kind === 'move' && drag.objectId) {
        setDragDelta({
          id: drag.objectId,
          dx: (e.clientX - drag.startClientX) / zoom,
          dy: (e.clientY - drag.startClientY) / zoom,
          dw: 0,
          dh: 0,
        })
        return
      }
      if (drag.kind === 'resize' && drag.objectId) {
        setDragDelta({
          id: drag.objectId,
          dx: 0,
          dy: 0,
          dw: (e.clientX - drag.startClientX) / zoom,
          dh: (e.clientY - drag.startClientY) / zoom,
        })
      }
    },
    [clientToBoard, zoom],
  )

  const handleStagePointerUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return

    if (drag.kind === 'draw' && drag.points && drag.points.length > 0) {
      const pts = drag.points
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      const relPoints: Array<[number, number, number]> = pts.map(([px, py, pr]) => [
        px - minX,
        py - minY,
        pr,
      ])
      const isHi = tool === 'highlighter'
      session.addObject({
        kind: 'stroke',
        x: minX,
        y: minY,
        width: Math.max(8, maxX - minX),
        height: Math.max(8, maxY - minY),
        tool: isHi ? 'highlighter' : 'pen',
        color: isHi ? '#FEF08A' : penColor,
        strokeWidth: isHi ? 18 : 4,
        opacity: isHi ? 0.45 : 1,
        points: relPoints,
      })
      setLiveStroke(null)
      return
    }

    if (dragDelta && drag.objectId) {
      const patch: Record<string, unknown> = {}
      if (drag.kind === 'move' && (dragDelta.dx !== 0 || dragDelta.dy !== 0)) {
        patch.x = Math.round((drag.origX ?? 0) + dragDelta.dx)
        patch.y = Math.round((drag.origY ?? 0) + dragDelta.dy)
      } else if (drag.kind === 'resize' && (dragDelta.dw !== 0 || dragDelta.dh !== 0)) {
        patch.width = Math.max(32, Math.round((drag.origW ?? 100) + dragDelta.dw))
        patch.height = Math.max(24, Math.round((drag.origH ?? 60) + dragDelta.dh))
      }
      setDragDelta(null)
      if (Object.keys(patch).length > 0) {
        session.updateObject(drag.objectId, patch)
      }
    }
  }, [dragDelta, penColor, session, tool])

  const handleOpenLinkCard = useCallback(
    async (url: string) => {
      const opened = await window.whiteboardApi.core.openLink(url)
      if (!opened) onToast(t('linkNotOpened'))
    },
    [onToast, t],
  )

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedObj) return
    const { id: _id, orderKey: _ok, ...rest } = selectedObj
    session.addObject({
      ...rest,
      ...(selectedObj.props as Record<string, unknown>),
      x: selectedObj.x + 28,
      y: selectedObj.y + 28,
    })
  }, [selectedObj, session])

  // Present mode SVG markup (theme-invariant light render of active page).
  const presentSvg = useMemo(() => {
    if (!presenting || !activePage) return null
    return renderPageToSvg(doc, activePage.id, session.getAllResourceDataUrls())
  }, [activePage, doc, presenting, session])

  const statusText =
    saveStatus === 'saving'
      ? t('statusSaving')
      : saveStatus === 'failed'
        ? t('statusSaveFailed')
        : session.isDirty()
          ? t('statusUnsaved')
          : t('statusSaved')

  const editingObj = editingId ? objectsById.get(editingId) : null

  return (
    <div className="wb-main" onDragOver={handleDragOver} onDrop={(e) => void handleDrop(e)}>
      {/* Top Toolbar */}
      <div className="wb-toolbar" role="toolbar" aria-label={t('appName')}>
        <div className="wb-toolbar-group">
          <button
            type="button"
            className={`wb-btn${tool === 'select' ? ' active' : ''}`}
            onClick={() => setTool('select')}
          >
            {t('toolSelect')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'sticky' ? ' active' : ''}`}
            onClick={() => setTool('sticky')}
          >
            {t('toolSticky')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'text' ? ' active' : ''}`}
            onClick={() => setTool('text')}
          >
            {t('toolText')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'shape' ? ' active' : ''}`}
            onClick={() => setTool('shape')}
          >
            {t('toolShape')}
          </button>
          {tool === 'shape' && (
            <select
              className="wb-select"
              value={shapeKind}
              onChange={(e) => setShapeKind(e.target.value as ShapeKind)}
            >
              {SHAPE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`wb-btn${tool === 'connector' ? ' active' : ''}`}
            onClick={() => setTool('connector')}
          >
            {t('toolConnector')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'pen' ? ' active' : ''}`}
            onClick={() => setTool('pen')}
          >
            {t('toolPen')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'highlighter' ? ' active' : ''}`}
            onClick={() => setTool('highlighter')}
          >
            {t('toolHighlighter')}
          </button>
          <button
            type="button"
            className={`wb-btn${tool === 'eraser' ? ' active' : ''}`}
            onClick={() => setTool('eraser')}
          >
            {t('toolEraser')}
          </button>
        </div>

        <div className="wb-toolbar-group">
          <button type="button" className="wb-btn" onClick={() => void handlePickImage()}>
            {t('toolImage')}
          </button>
          <button type="button" className="wb-btn" onClick={handleAddTable}>
            {t('toolTable')}
          </button>
          <button
            type="button"
            className={`wb-btn${stickerOpen ? ' active' : ''}`}
            onClick={() => setStickerOpen((v) => !v)}
          >
            {t('toolSticker')}
          </button>
          <button type="button" className="wb-btn" onClick={() => setLinkModalOpen(true)}>
            {t('toolLink')}
          </button>
          <button type="button" className="wb-btn" onClick={() => void handlePickPdf()}>
            {t('toolImportPdf')}
          </button>
        </div>

        <div className="wb-toolbar-group">
          <button
            type="button"
            className="wb-btn"
            disabled={!session.canUndo()}
            onClick={() => session.undo()}
          >
            {t('toolUndo')}
          </button>
          <button
            type="button"
            className="wb-btn"
            disabled={!session.canRedo()}
            onClick={() => session.redo()}
          >
            {t('toolRedo')}
          </button>
        </div>

        <div className="wb-toolbar-group">
          <button type="button" className="wb-btn" onClick={() => onSetPresenting(true)}>
            {t('toolPresent')}
          </button>
          <button type="button" className="wb-btn" onClick={() => onOpenExportModal('png')}>
            {t('toolExport')}
          </button>
          <button type="button" className="wb-btn" onClick={onPrint}>
            {t('toolPrint')}
          </button>
        </div>
      </div>

      {/* Contextual format bar when an object or drawing tool is active */}
      {(selectedObj || tool === 'sticky' || tool === 'pen') && (
        <div className="wb-format-bar">
          {(tool === 'sticky' || selectedObj?.kind === 'sticky') &&
            STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="wb-swatch"
                style={{ backgroundColor: c }}
                onClick={() => {
                  setActiveColor(c)
                  if (selectedObj?.kind === 'sticky') {
                    session.updateObject(selectedObj.id, { color: c })
                  }
                }}
              />
            ))}
          {(tool === 'pen' || selectedObj?.kind === 'shape' || selectedObj?.kind === 'connector') &&
            STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="wb-swatch"
                style={{ backgroundColor: c }}
                onClick={() => {
                  setPenColor(c)
                  if (selectedObj?.kind === 'shape') {
                    session.updateObject(selectedObj.id, { stroke: c })
                  } else if (selectedObj?.kind === 'connector') {
                    session.updateObject(selectedObj.id, { color: c })
                  }
                }}
              />
            ))}
          {selectedObj && (
            <>
              <button type="button" className="wb-btn" onClick={handleDuplicateSelected}>
                {t('toolDuplicate')}
              </button>
              <button type="button" className="wb-btn" onClick={() => session.deleteSelected()}>
                {t('toolDelete')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Excalidraw skipped elements banner */}
      {importSummary && importSummary.skippedCount > 0 && (
        <div className="wb-banner" role="status">
          <span>{t('excalidrawBanner', { count: importSummary.skippedCount })}</span>
          <button type="button" className="wb-btn" onClick={() => session.dismissImportBanner()}>
            {t('excalidrawBannerDismiss')}
          </button>
        </div>
      )}

      {/* Interactive SVG Canvas Stage */}
      <div className="wb-stage-wrap" ref={stageRef}>
        {stickerOpen && (
          <div className="wb-sticker-popover">
            {STICKER_IDS.map((sid) => (
              <button
                key={sid}
                type="button"
                className="wb-sticker-btn"
                onClick={() => handleAddSticker(sid)}
              >
                <StickerIcon stickerId={sid} size={26} />
              </button>
            ))}
          </div>
        )}

        <svg
          className="wb-stage-svg"
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              setZoom((z) =>
                Math.max(0.2, Math.min(4, Number((z * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2)))),
              )
            } else {
              setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
            }
          }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Fixed or freeform page paper (invariant light paper color) */}
            {activePage && activePage.format !== 'freeform' ? (
              <g className="wb-paper-shadow">
                <rect
                  x={0}
                  y={0}
                  width={activePage.width}
                  height={activePage.height}
                  fill="#FFFFFF"
                  rx={4}
                />
                {activePage.background?.kind === 'image' &&
                  (() => {
                    const href = session.getResourceDataUrl(activePage.background.resourceId)
                    return href ? (
                      <image
                        href={href}
                        x={0}
                        y={0}
                        width={activePage.width}
                        height={activePage.height}
                        preserveAspectRatio="xMidYMid meet"
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : null
                  })()}
              </g>
            ) : (
              <rect x={-4000} y={-4000} width={8000} height={8000} fill="#FFFFFF" />
            )}

            {/* Board objects */}
            {pageObjects.map((rawObj) => {
              const delta = dragDelta?.id === rawObj.id ? dragDelta : null
              const x = rawObj.x + (delta?.dx ?? 0)
              const y = rawObj.y + (delta?.dy ?? 0)
              const width = Math.max(24, rawObj.width + (delta?.dw ?? 0))
              const height = Math.max(24, rawObj.height + (delta?.dh ?? 0))
              const isSelected = selectedIds.includes(rawObj.id)
              const isHighlighted = highlightSet.has(rawObj.id)

              return (
                <g
                  key={rawObj.id}
                  data-object-id={rawObj.id}
                  data-object-kind={rawObj.kind}
                  transform={
                    rawObj.rotation
                      ? `rotate(${rawObj.rotation} ${x + width / 2} ${y + height / 2})`
                      : undefined
                  }
                  onPointerDown={(e) => handleObjectPointerDown(e, rawObj)}
                  onDoubleClick={() => startInlineEdit(rawObj)}
                  style={{ cursor: tool === 'eraser' ? 'crosshair' : 'move' }}
                >
                  {renderObjectElement(
                    rawObj,
                    x,
                    y,
                    width,
                    height,
                    objectsById,
                    session,
                    handleOpenLinkCard,
                  )}
                  {isHighlighted && (
                    <rect
                      className="wb-ai-highlight-rect"
                      x={x - 5}
                      y={y - 5}
                      width={width + 10}
                      height={height + 10}
                      rx={8}
                    />
                  )}
                  {isSelected && (
                    <>
                      <rect
                        className="wb-selection-rect"
                        x={x - 2}
                        y={y - 2}
                        width={width + 4}
                        height={height + 4}
                        rx={4}
                      />
                      <rect
                        x={x + width - 5}
                        y={y + height - 5}
                        width={10}
                        height={10}
                        fill="#FFFFFF"
                        stroke="#2563EB"
                        strokeWidth={2}
                        style={{ cursor: 'nwse-resize' }}
                        onPointerDown={(e) => handleResizePointerDown(e, rawObj)}
                      />
                    </>
                  )}
                </g>
              )
            })}

            {/* Live in-progress pressure stroke */}
            {liveStroke && liveStroke.length > 0 && (
              <path
                d={computeStrokeOutline(
                  liveStroke,
                  tool === 'highlighter' ? 18 : 4,
                  tool === 'highlighter' ? 'highlighter' : 'pen',
                )}
                fill={tool === 'highlighter' ? '#FEF08A' : penColor}
                fillOpacity={tool === 'highlighter' ? 0.45 : 1}
              />
            )}
          </g>
        </svg>

        {/* Inline plain-text editor overlay (never innerHTML) */}
        {editingObj && (
          <textarea
            className="wb-inline-editor"
            autoFocus
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={commitInlineEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                commitInlineEdit()
              }
            }}
            style={{
              left: pan.x + editingObj.x * zoom,
              top: pan.y + editingObj.y * zoom,
              width: Math.max(120, editingObj.width * zoom),
              height: Math.max(48, editingObj.height * zoom),
            }}
          />
        )}
      </div>

      {/* Bottom Page Rail & Status Bar */}
      <div className="wb-footer">
        <div className="wb-pages">
          {doc.pages.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              className={`wb-page-tab${p.id === activePageId ? ' active' : ''}`}
              onClick={() => session.setActivePageId(p.id)}
            >
              <span>{p.title || t('pageDefaultName', { n: idx + 1 })}</span>
            </button>
          ))}
          <button
            type="button"
            className="wb-btn"
            onClick={() =>
              session.addPage('freeform', t('pageDefaultName', { n: doc.pages.length + 1 }))
            }
          >
            + {t('pageAdd')}
          </button>
          {activePage && (
            <select
              className="wb-select"
              value={activePage.format}
              onChange={(e) => session.setPageFormat(activePage.id, e.target.value as PageFormat)}
            >
              <option value="freeform">{t('pageFormatFreeform')}</option>
              <option value="wide_16_9">{t('pageFormatWide')}</option>
              <option value="a4_portrait">{t('pageFormatA4P')}</option>
              <option value="a4_landscape">{t('pageFormatA4L')}</option>
            </select>
          )}
          {doc.pages.length > 1 && activePage && (
            <button
              type="button"
              className="wb-btn"
              onClick={() => session.deletePage(activePage.id)}
            >
              {t('pageDelete')}
            </button>
          )}
        </div>

        <div className="wb-status-group">
          <button
            type="button"
            className="wb-btn"
            onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="wb-btn"
            onClick={() => setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))}
          >
            +
          </button>
          <button type="button" className="wb-btn" onClick={handleFitZoom}>
            {t('zoomFit')}
          </button>
          <label className="wb-checkbox">
            <input type="checkbox" checked={autoSave} onChange={onToggleAutoSave} />
            {t('autoSave')}
          </label>
          <span>{statusText}</span>
        </div>
      </div>

      {/* Link Card Modal */}
      {linkModalOpen && (
        <div className="wb-modal-scrim">
          <div className="wb-modal" role="dialog" aria-modal="true">
            <h3>{t('linkDialogTitle')}</h3>
            <label className="wb-field">
              <span>{t('linkUrlLabel')}</span>
              <input
                className="wb-input"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </label>
            <label className="wb-field">
              <span>{t('linkTitleLabel')}</span>
              <input
                className="wb-input"
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
              />
            </label>
            <label className="wb-checkbox">
              <input
                type="checkbox"
                checked={linkFetchPreview}
                onChange={(e) => setLinkFetchPreview(e.target.checked)}
              />
              <span>{t('linkFetchPreview')}</span>
            </label>
            <div className="wb-modal-actions">
              <button
                type="button"
                className="wb-btn wb-btn-secondary"
                disabled={linkBusy}
                onClick={() => setLinkModalOpen(false)}
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                disabled={linkBusy}
                onClick={() => void handleConfirmLinkCard()}
              >
                {t('btnAdd')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-page PDF Range Modal */}
      {pdfPending && (
        <div className="wb-modal-scrim">
          <div className="wb-modal" role="dialog" aria-modal="true">
            <h3>{t('pdfDialogTitle')}</h3>
            <div>{t('pdfPageCount', { count: pdfPending.pageCount })}</div>
            <label className="wb-field">
              <span>{t('pdfRangeLabel')}</span>
              <input
                className="wb-input"
                type="text"
                value={pdfRange}
                onChange={(e) => setPdfRange(e.target.value)}
                autoFocus
              />
            </label>
            <div className="wb-modal-actions">
              <button
                type="button"
                className="wb-btn wb-btn-secondary"
                disabled={pdfBusy}
                onClick={() => setPdfPending(null)}
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                disabled={pdfBusy}
                onClick={() => void handleConfirmPdfImport()}
              >
                {t('btnImport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Scope Modal */}
      {exportModalFormat && (
        <div className="wb-modal-scrim">
          <div className="wb-modal" role="dialog" aria-modal="true">
            <h3>
              {exportModalFormat === 'png'
                ? t('exportTitlePng')
                : exportModalFormat === 'svg'
                  ? t('exportTitleSvg')
                  : t('exportTitlePdf')}
            </h3>
            <label className="wb-checkbox">
              <input
                type="radio"
                name="wb-export-scope"
                checked={exportScope === 'all'}
                onChange={() => setExportScope('all')}
              />
              <span>{t('exportAllPages')}</span>
            </label>
            <label className="wb-checkbox">
              <input
                type="radio"
                name="wb-export-scope"
                checked={exportScope === 'current'}
                onChange={() => setExportScope('current')}
              />
              <span>{t('exportCurrentPage')}</span>
            </label>
            <div className="wb-modal-actions">
              <button
                type="button"
                className="wb-btn wb-btn-secondary"
                onClick={onCloseExportModal}
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                onClick={() => {
                  const fmt = exportModalFormat
                  onCloseExportModal()
                  onExport(fmt, exportScope)
                }}
              >
                {t('btnExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presentation Mode Overlay (F5) */}
      {presenting && activePage && (
        <div className="wb-present-overlay" role="dialog" aria-modal="true">
          <div className="wb-present-stage">
            {presentSvg && (
              <img
                alt={activePage.title || 'Whiteboard page'}
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(presentSvg.svg)}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  background: '#FFFFFF',
                }}
              />
            )}
          </div>
          <div className="wb-present-bar">
            <button
              type="button"
              onClick={() => {
                const idx = doc.pages.findIndex((p) => p.id === activePageId)
                if (idx > 0) session.setActivePageId(doc.pages[idx - 1]!.id)
              }}
            >
              {t('presentPrev')}
            </button>
            <span>
              {doc.pages.findIndex((p) => p.id === activePageId) + 1} / {doc.pages.length}
            </span>
            <button
              type="button"
              onClick={() => {
                const idx = doc.pages.findIndex((p) => p.id === activePageId)
                if (idx >= 0 && idx + 1 < doc.pages.length)
                  session.setActivePageId(doc.pages[idx + 1]!.id)
              }}
            >
              {t('presentNext')}
            </button>
            <button type="button" onClick={() => onSetPresenting(false)}>
              {t('presentExit')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function renderObjectElement(
  obj: BoardObject,
  x: number,
  y: number,
  width: number,
  height: number,
  byId: Map<string, BoardObject>,
  session: WhiteboardSession,
  onOpenLink: (url: string) => void,
): ReactElement | null {
  switch (obj.kind) {
    case 'sticky': {
      const p = obj.props as unknown as StickyProps
      const text = richTextPlain(p.text)
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={10}
            fill={p.color || '#FEF08A'}
            stroke="#D1D5DB"
            strokeWidth={1}
          />
          <foreignObject
            x={x + 10}
            y={y + 10}
            width={Math.max(10, width - 20)}
            height={Math.max(10, height - 20)}
          >
            <div
              style={{
                color: '#0F172A',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {text}
            </div>
          </foreignObject>
        </g>
      )
    }
    case 'text': {
      const p = obj.props as unknown as TextProps
      const text = richTextPlain(p.text)
      return (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div
            style={{
              color: '#0F172A',
              fontSize: 16,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {text}
          </div>
        </foreignObject>
      )
    }
    case 'shape': {
      const p = obj.props as unknown as ShapeProps
      const d = shapePath(p.shape || 'rectangle', width, height, (p.strokeWidth ?? 2) / 2)
      const text = richTextPlain(p.text)
      return (
        <g transform={`translate(${x}, ${y})`}>
          <path
            d={d}
            fill={p.fill || '#FFFFFF'}
            stroke={p.stroke || '#0F172A'}
            strokeWidth={p.strokeWidth ?? 2}
          />
          {text && (
            <foreignObject
              x={8}
              y={8}
              width={Math.max(10, width - 16)}
              height={Math.max(10, height - 16)}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  color: '#0F172A',
                  fontSize: 14,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {text}
              </div>
            </foreignObject>
          )}
        </g>
      )
    }
    case 'connector': {
      const p = obj.props as unknown as ConnectorProps
      const resolveEnd = (end: ConnectorProps['start']) => {
        if ('objectId' in end) {
          const target = byId.get(end.objectId)
          if (target) {
            return {
              x: target.x + target.width * (end.anchorX ?? 0.5),
              y: target.y + target.height * (end.anchorY ?? 0.5),
            }
          }
          return { x: 0, y: 0 }
        }
        return { x: end.x, y: end.y }
      }
      const s = resolveEnd(p.start)
      const e = resolveEnd(p.end)
      const labelText = richTextPlain(p.label)
      return (
        <g>
          <line
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            stroke={p.color || '#0F172A'}
            strokeWidth={p.strokeWidth ?? 2}
          />
          {labelText && (
            <text
              x={(s.x + e.x) / 2}
              y={(s.y + e.y) / 2 - 6}
              textAnchor="middle"
              fontSize={12}
              fill="#0F172A"
            >
              {labelText}
            </text>
          )}
        </g>
      )
    }
    case 'stroke': {
      const p = obj.props as unknown as StrokeProps
      const d = computeStrokeOutline(p.points ?? [], p.width ?? 4, p.tool ?? 'pen')
      return (
        <path
          transform={`translate(${x}, ${y})`}
          d={d}
          fill={p.color || '#0F172A'}
          fillOpacity={p.opacity ?? (p.tool === 'highlighter' ? 0.45 : 1)}
        />
      )
    }
    case 'image': {
      const p = obj.props as unknown as ImageProps
      const href = session.getResourceDataUrl(p.resourceId)
      return href ? (
        <image
          href={href}
          x={x}
          y={y}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <rect x={x} y={y} width={width} height={height} fill="#F1F5F9" stroke="#CBD5E1" />
      )
    }
    case 'table': {
      const p = obj.props as unknown as TableProps
      const rowIds = p.rowIds?.length ? p.rowIds : ['r1']
      const colIds = p.colIds?.length ? p.colIds : ['c1']
      const cw = width / colIds.length
      const ch = height / rowIds.length
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="#FFFFFF"
            stroke="#94A3B8"
            strokeWidth={1.5}
          />
          {rowIds.map((rid, r) =>
            colIds.map((cid, c) => {
              const cell = p.cells?.[`${rid}:${cid}`]
              return (
                <g key={`${rid}-${cid}`}>
                  <rect
                    x={x + c * cw}
                    y={y + r * ch}
                    width={cw}
                    height={ch}
                    fill={r === 0 && p.headerRow ? '#F1F5F9' : '#FFFFFF'}
                    stroke="#CBD5E1"
                    strokeWidth={1}
                  />
                  <text x={x + c * cw + 6} y={y + r * ch + ch / 2 + 4} fontSize={12} fill="#0F172A">
                    {richTextPlain(cell)}
                  </text>
                </g>
              )
            }),
          )}
        </g>
      )
    }
    case 'sticker': {
      const p = obj.props as unknown as StickerProps
      return (
        <g transform={`translate(${x}, ${y})`}>
          <svg width={width} height={height} viewBox="0 0 100 100">
            <StickerIcon stickerId={p.stickerId || 'star'} tint={p.tint} />
          </svg>
        </g>
      )
    }
    case 'link': {
      const p = obj.props as unknown as LinkProps
      const previewHref = p.previewResourceId
        ? session.getResourceDataUrl(p.previewResourceId)
        : null
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={10}
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth={1.5}
          />
          {previewHref && (
            <image
              href={previewHref}
              x={x + 8}
              y={y + 8}
              width={width - 16}
              height={Math.min(84, height * 0.5)}
              preserveAspectRatio="xMidYMid slice"
            />
          )}
          <foreignObject
            x={x + 12}
            y={previewHref ? y + Math.min(84, height * 0.5) + 12 : y + 10}
            width={Math.max(20, width - 24)}
            height={Math.max(24, height - (previewHref ? Math.min(84, height * 0.5) + 20 : 20))}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <a
                href={p.url}
                onClick={(ev) => {
                  ev.preventDefault()
                  ev.stopPropagation()
                  onOpenLink(p.url)
                }}
                style={{
                  color: '#2563EB',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'underline',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.title || p.url}
              </a>
              <span
                style={{
                  color: '#64748B',
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.url}
              </span>
            </div>
          </foreignObject>
        </g>
      )
    }
  }
}
