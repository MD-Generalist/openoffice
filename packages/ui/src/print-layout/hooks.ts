import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultOptions, type PrintLayoutOptions } from '@genoffice/print-layout/plan'
import {
  coupleDuplex,
  createDuplexCoupling,
  effectiveCollate,
  isCollateLocked,
  setDuplexByUser,
  type DuplexCoupling,
  type PrintLayoutDuplex,
  type PrintLayoutProgress,
} from './model'

/** Printer option values that are not device names (Electron: '' = OS default). */
export const DEFAULT_PRINTER = ''
export const SYSTEM_DIALOG = '\u0000system-dialog'

export interface PrintPrinterInfo {
  readonly name: string
  readonly displayName: string
}

/** Per-job printer options passed to `print-layout-print` (matches `PrintJobOptions`). */
export interface PrintJobSelection {
  readonly deviceName: string | null
  readonly copies?: number | undefined
  readonly collate?: boolean | undefined
  readonly duplex?: PrintLayoutDuplex | undefined
}

export interface PrintJobState {
  readonly printers: readonly PrintPrinterInfo[]
  readonly deviceName: string
  readonly setDeviceName: (deviceName: string) => void
  readonly systemDialog: boolean
  /** true when an in-app printer is chosen ('' = OS default, or a named printer) */
  readonly isSilent: boolean
  readonly copies: number
  readonly setCopies: (copies: number) => void
  readonly collate: boolean
  readonly collateLocked: boolean
  readonly setCollate: (collate: boolean) => void
  readonly duplex: PrintLayoutDuplex
  readonly setDuplex: (duplex: PrintLayoutDuplex) => void
  readonly job: PrintJobSelection
}

// macOS's print sheet already carries copies/duplex/paper, so it stays the
// default there; Windows 11's dialog buries duplex under "More settings".
function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
}

/**
 * In-app printer, copies, collate and duplex state coupled to the shared page
 * layout options. Defaults to the OS default printer on Windows/Linux (so
 * double-sided printing is one click away) and to the system print sheet on
 * macOS.
 */
export function usePrintJob(
  options: PrintLayoutOptions,
  listPrinters?: (() => Promise<readonly PrintPrinterInfo[]>) | undefined,
): PrintJobState {
  const [printers, setPrinters] = useState<readonly PrintPrinterInfo[]>([])
  const [deviceName, setDeviceName] = useState(() =>
    isMacPlatform() ? SYSTEM_DIALOG : DEFAULT_PRINTER,
  )
  const [copies, setCopiesRaw] = useState(1)
  const [collateRaw, setCollate] = useState(true)
  const { duplex, setDuplex } = useDuplexCoupling(options, 'simplex')
  const listRef = useRef(listPrinters)
  listRef.current = listPrinters

  useEffect(() => {
    const load = listRef.current
    if (!load) return
    let alive = true
    load()
      .then((list) => {
        if (alive && Array.isArray(list)) setPrinters(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const setCopies = useCallback((next: number) => {
    setCopiesRaw(Math.min(999, Math.max(1, Math.round(next) || 1)))
  }, [])

  const systemDialog = deviceName === SYSTEM_DIALOG
  const collateLocked = isCollateLocked(options)
  const collate = effectiveCollate(options, collateRaw)

  const job = useMemo<PrintJobSelection>(
    () => (systemDialog ? { deviceName: null } : { deviceName, copies, collate, duplex }),
    [systemDialog, deviceName, copies, collate, duplex],
  )

  return {
    printers,
    deviceName,
    setDeviceName,
    systemDialog,
    isSilent: !systemDialog,
    copies,
    setCopies,
    collate,
    collateLocked,
    setCollate,
    duplex,
    setDuplex,
    job,
  }
}

/**
 * Options state for a print dialog that starts from the defaults every time
 * `open` turns true (spec 4: nothing carries over between prints).
 */
export function usePrintLayoutOptions(
  open: boolean,
): [PrintLayoutOptions, (next: PrintLayoutOptions) => void] {
  const [options, setOptions] = useState<PrintLayoutOptions>(createDefaultOptions)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOptions(createDefaultOptions())
  }
  return [options, setOptions]
}

/**
 * The word editor's duplex field coupled to the panel (spec 4.6). Pass the
 * panel's options each render; `setDuplex` is for the user's own changes.
 */
export function useDuplexCoupling(
  options: PrintLayoutOptions,
  initial: PrintLayoutDuplex,
): { duplex: PrintLayoutDuplex; setDuplex: (duplex: PrintLayoutDuplex) => void } {
  const [state, setState] = useState<DuplexCoupling>(() => createDuplexCoupling(initial))
  const [seen, setSeen] = useState(options)
  if (seen !== options) {
    setSeen(options)
    setState(coupleDuplex(state, seen, options))
  }
  const setDuplex = useCallback(
    (duplex: PrintLayoutDuplex) => setState((s) => setDuplexByUser(s, duplex)),
    [],
  )
  return { duplex: state.duplex, setDuplex }
}

/**
 * Builds the arranged result as one PNG per face. The editor reports progress
 * and stops (rejecting or resolving, either is fine) when `signal` aborts.
 */
export type PrintLayoutPreviewRequest = (
  options: PrintLayoutOptions,
  context: { signal: AbortSignal; onProgress: (progress: PrintLayoutProgress) => void },
) => Promise<Uint8Array[]>

export type ArrangedPreviewState =
  | { status: 'idle' }
  | { status: 'running'; progress: PrintLayoutProgress | null }
  | { status: 'done'; faces: readonly Uint8Array[] }
  | { status: 'failed' }

/** Runs a preview request with cancel; a newer start or unmount aborts the older run. */
export function useArrangedPreview(request: PrintLayoutPreviewRequest | undefined): {
  state: ArrangedPreviewState
  start: (options: PrintLayoutOptions) => void
  cancel: () => void
} {
  const [state, setState] = useState<ArrangedPreviewState>({ status: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const requestRef = useRef(request)
  requestRef.current = request

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setState((s) => (s.status === 'idle' ? s : { status: 'idle' }))
  }, [])

  const start = useCallback((options: PrintLayoutOptions) => {
    const run = requestRef.current
    if (!run) return
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setState({ status: 'running', progress: null })
    let pending: Promise<Uint8Array[]>
    try {
      pending = run(options, {
        signal: c.signal,
        onProgress: (progress) => {
          if (!c.signal.aborted) setState({ status: 'running', progress })
        },
      })
    } catch {
      pending = Promise.reject(new Error('preview request failed'))
    }
    pending.then(
      (faces) => {
        if (c.signal.aborted) return
        controller.current = null
        setState({ status: 'done', faces })
      },
      () => {
        if (c.signal.aborted) return
        controller.current = null
        setState({ status: 'failed' })
      },
    )
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  return { state, start, cancel }
}
