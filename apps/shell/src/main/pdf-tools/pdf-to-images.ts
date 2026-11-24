/**
 * Chunked PDF-pages-to-images exporter (PDF tools v2, no Electron dependency).
 *
 * Splits requested 1-based page numbers into small DPI-aware chunks so high-DPI
 * (300 DPI) exports never materialize all raw BGRA frames in memory at once.
 * Each chunk is encoded immediately through the injected `encodePage` callback
 * (Chromium `nativeImage` in main; pure mock/encoder in unit tests) and added to
 * either a STORE-compressed `jszip` archive or sequential files inside `outPath`.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import { atomicWriteFile } from '../atomic-write'

export const JPG_QUALITY_BY_PRESET = {
  high: 90,
  medium: 80,
  small: 65,
} as const

export type PdfImageQualityPreset = keyof typeof JPG_QUALITY_BY_PRESET
export type PdfImageDpi = 150 | 200 | 300
export type PdfImageFormat = 'png' | 'jpg'
export type PdfImageOutMode = 'zip' | 'folder'

export interface RenderedPageFrame {
  page: number
  width: number
  height: number
  bgra: Uint8Array
}

export type RenderPagesChunkFn = (
  pages: number[],
  dpi: PdfImageDpi,
) => Promise<{ pageCount: number; pages: RenderedPageFrame[] }>

export type PageImageEncoder = (
  bgra: Uint8Array,
  width: number,
  height: number,
  format: PdfImageFormat,
  quality: number,
) => Uint8Array

export interface ExportPdfPagesToImagesOptions {
  /** 1-based page numbers in export order */
  pageNumbers: readonly number[]
  dpi: PdfImageDpi
  format: PdfImageFormat
  qualityPreset: PdfImageQualityPreset
  outMode: PdfImageOutMode
  /** target `.zip` file path when `outMode === 'zip'`, or target folder path when `outMode === 'folder'` */
  outPath: string
  /** filename stem without extension */
  baseName: string
  renderChunk: RenderPagesChunkFn
  encodePage: PageImageEncoder
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface ExportPdfPagesToImagesResult {
  writtenPaths: string[]
  exportedPages: number
}

/** Chunk size by DPI to keep peak BGRA IPC payload bounded on 8 GB PCs (tunable) */
export function chunkSizeForDpi(dpi: PdfImageDpi): number {
  return dpi >= 300 ? 2 : 4
}

/** Split 1-based page numbers into bounded sequential chunks */
export function splitPageChunks(pages: readonly number[], dpi: PdfImageDpi): number[][] {
  const size = chunkSizeForDpi(dpi)
  const chunks: number[][] = []
  for (let i = 0; i < pages.length; i += size) {
    chunks.push(pages.slice(i, i + size))
  }
  return chunks
}

function safeStem(name: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control chars is intentional
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned || 'page'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const err = new Error('cancelled')
  err.name = 'AbortError'
  throw err
}

/**
 * Render, encode, and write PDF pages chunk by chunk.
 * Releases each chunk's BGRA buffers before requesting the next chunk.
 */
export async function exportPdfPagesToImages(
  opts: ExportPdfPagesToImagesOptions,
): Promise<ExportPdfPagesToImagesResult> {
  const {
    pageNumbers,
    dpi,
    format,
    qualityPreset,
    outMode,
    outPath,
    baseName,
    renderChunk,
    encodePage,
    onProgress,
    signal,
  } = opts
  throwIfAborted(signal)

  const total = pageNumbers.length
  const chunks = splitPageChunks(pageNumbers, dpi)
  const quality = JPG_QUALITY_BY_PRESET[qualityPreset]
  const stem = safeStem(baseName)
  const ext = format === 'jpg' ? 'jpg' : 'png'
  const padDigits = Math.max(2, String(Math.max(...pageNumbers, total, 1)).length)

  const zip = outMode === 'zip' ? new JSZip() : null
  const writtenPaths: string[] = []
  if (outMode === 'folder') {
    await mkdir(outPath, { recursive: true })
  }

  let done = 0
  onProgress?.(0, total)

  for (const chunk of chunks) {
    throwIfAborted(signal)
    const rendered = await renderChunk(chunk, dpi)
    throwIfAborted(signal)

    for (const frame of rendered.pages) {
      throwIfAborted(signal)
      const encoded = encodePage(frame.bgra, frame.width, frame.height, format, quality)
      const fileName = `${stem}-${String(frame.page).padStart(padDigits, '0')}.${ext}`
      if (zip) {
        zip.file(fileName, encoded, { compression: 'STORE' })
      } else {
        const dest = join(outPath, fileName)
        await atomicWriteFile(dest, encoded)
        writtenPaths.push(dest)
      }
      done++
      onProgress?.(done, total)
    }
  }

  if (zip) {
    throwIfAborted(signal)
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    await atomicWriteFile(outPath, zipBytes)
    writtenPaths.push(outPath)
  }

  return { writtenPaths, exportedPages: done }
}
