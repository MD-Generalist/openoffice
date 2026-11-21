/**
 * Theme-invariant SVG serializer and PNG rasterizer for whiteboard pages.
 * Used identically for PNG/SVG/PDF exports, printing, `--headless-export`,
 * `.whiteboard` thumbnails, and AI vision PNG page snapshots.
 *
 * Never reads CSS theme variables — document paper and objects always render in
 * their own document colors, and UI chrome (selection handles, AI highlights) is
 * never included.
 */
import {
  computePageBounds,
  computeStrokeOutline,
  type BoardDocument,
  type BoardObject,
  type ConnectorEnd,
  type ConnectorProps,
  type ImageProps,
  type LinkProps,
  type RichText,
  type ShapeProps,
  type StickerProps,
  type StickyProps,
  type StrokeProps,
  type TableProps,
  type TextProps,
} from '@genoffice/whiteboard-engine'
import { shapePath } from '../canvas/shape-paths'
import { stickerInnerSvg } from '../canvas/stickers'

export interface RenderedPageSvg {
  svg: string
  width: number
  height: number
  viewBoxX: number
  viewBoxY: number
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function richTextPlain(rt: RichText | undefined): string {
  if (!rt || !Array.isArray(rt.paragraphs)) return ''
  return rt.paragraphs
    .map((p) => (Array.isArray(p.runs) ? p.runs.map((r) => r.text ?? '').join('') : ''))
    .join('\n')
}

function renderMultilineTextSvg(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): string {
  if (!text) return ''
  const lines = text.split('\n')
  const lineH = fontSize * 1.35
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 8 : x + 8
  const startY = y + Math.max(fontSize + 4, (h - lines.length * lineH) / 2 + fontSize * 0.85)
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${tx.toFixed(1)}" y="${(startY + i * lineH).toFixed(1)}">${escXml(line || ' ')}</tspan>`,
    )
    .join('')
  return `<text font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" fill="${escXml(color)}" text-anchor="${anchor}">${tspans}</text>`
}

function resolveConnectorPoint(
  end: ConnectorEnd,
  byId: Map<string, BoardObject>,
): { x: number; y: number } {
  if ('objectId' in end) {
    const obj = byId.get(end.objectId)
    if (obj) {
      const ax = end.anchorX ?? 0.5
      const ay = end.anchorY ?? 0.5
      return { x: obj.x + obj.width * ax, y: obj.y + obj.height * ay }
    }
    return { x: 0, y: 0 }
  }
  return { x: end.x, y: end.y }
}

function dashAttr(style?: string): string {
  if (style === 'dashed') return ' stroke-dasharray="8 6"'
  if (style === 'dotted') return ' stroke-dasharray="2 5"'
  return ''
}

export function renderPageToSvg(
  doc: BoardDocument,
  pageId: string,
  resourceDataUrls: ReadonlyMap<string, string>,
  freeformMargin = 48,
): RenderedPageSvg | null {
  const page = doc.pages.find((p) => p.id === pageId)
  if (!page) return null

  const bounds = computePageBounds(doc, pageId, freeformMargin) ?? {
    x: 0,
    y: 0,
    width: page.width || 1920,
    height: page.height || 1080,
  }
  const w = Math.max(1, Math.round(bounds.width))
  const h = Math.max(1, Math.round(bounds.height))

  const pageObjs = doc.objects
    .filter((o) => o.pageId === pageId)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0))
  const byId = new Map(pageObjs.map((o) => [o.id, o]))

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">`,
  )
  parts.push(
    `<defs><marker id="wb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="context-stroke"/></marker><marker id="wb-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="4" fill="context-stroke"/></marker></defs>`,
  )

  // Background layer (document paper colors, never inverted by dark UI theme).
  const bg = page.background
  if (bg.kind === 'solid') {
    parts.push(
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${escXml(bg.color)}"/>`,
    )
  } else if (bg.kind === 'grid') {
    parts.push(
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${escXml(bg.color)}"/>`,
    )
    const step = 32
    const patId = `wb-grid-${bg.pattern}`
    if (bg.pattern === 'dot') {
      parts.push(
        `<defs><pattern id="${patId}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#CBD5E1"/></pattern></defs>`,
      )
    } else {
      parts.push(
        `<defs><pattern id="${patId}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#E2E8F0" stroke-width="1"/></pattern></defs>`,
      )
    }
    parts.push(
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="url(#${patId})"/>`,
    )
  } else if (bg.kind === 'image') {
    parts.push(
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#FFFFFF"/>`,
    )
    const dataUrl = resourceDataUrls.get(bg.resourceId)
    if (dataUrl) {
      parts.push(
        `<image href="${escXml(dataUrl)}" x="0" y="0" width="${bg.width}" height="${bg.height}" preserveAspectRatio="xMidYMid meet"/>`,
      )
    }
  }

  for (const obj of pageObjs) {
    const cx = obj.x + obj.width / 2
    const cy = obj.y + obj.height / 2
    const rotAttr =
      Math.abs(obj.rotation) > 1e-4 ? ` transform="rotate(${obj.rotation} ${cx} ${cy})"` : ''

    switch (obj.kind) {
      case 'sticky': {
        const p = obj.props as unknown as StickyProps
        const txt = richTextPlain(p.text)
        parts.push(`<g${rotAttr}>`)
        parts.push(
          `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="8" fill="${escXml(p.color || '#FEF08A')}" stroke="#D4B830" stroke-width="1"/>`,
        )
        parts.push(
          renderMultilineTextSvg(
            txt,
            obj.x + 8,
            obj.y + 8,
            obj.width - 16,
            obj.height - 16,
            p.fontSize ?? 16,
            '#1E293B',
            p.align ?? 'left',
          ),
        )
        parts.push('</g>')
        break
      }
      case 'text': {
        const p = obj.props as unknown as TextProps
        const txt = richTextPlain(p.text)
        parts.push(`<g${rotAttr}>`)
        if (p.background || p.borderColor) {
          parts.push(
            `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="4" fill="${escXml(p.background || 'none')}" stroke="${escXml(p.borderColor || 'none')}" stroke-width="1"/>`,
          )
        }
        parts.push(
          renderMultilineTextSvg(
            txt,
            obj.x,
            obj.y,
            obj.width,
            obj.height,
            p.fontSize ?? 18,
            p.color || '#0F172A',
            p.align ?? 'left',
          ),
        )
        parts.push('</g>')
        break
      }
      case 'shape': {
        const p = obj.props as unknown as ShapeProps
        const sw = p.strokeWidth ?? 2
        const d = shapePath(p.shape || 'rounded_rectangle', obj.width, obj.height, sw / 2)
        const txt = richTextPlain(p.text)
        parts.push(`<g${rotAttr}>`)
        parts.push(
          `<g transform="translate(${obj.x} ${obj.y})"><path d="${d}" fill="${escXml(p.fill || '#EFF6FF')}" stroke="${escXml(p.stroke || '#2563EB')}" stroke-width="${sw}"${dashAttr(p.lineStyle)}/></g>`,
        )
        parts.push(
          renderMultilineTextSvg(
            txt,
            obj.x + 8,
            obj.y + 8,
            obj.width - 16,
            obj.height - 16,
            p.fontSize ?? 15,
            '#0F172A',
            p.align ?? 'center',
          ),
        )
        parts.push('</g>')
        break
      }
      case 'connector': {
        const p = obj.props as unknown as ConnectorProps
        const a = resolveConnectorPoint(p.start, byId)
        const b = resolveConnectorPoint(p.end, byId)
        const pts = [a, ...(p.waypoints ?? []), b]
        const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
        const startMarker =
          p.startHead === 'arrow' || p.startHead === 'triangle'
            ? ' marker-start="url(#wb-arrow)"'
            : p.startHead === 'circle'
              ? ' marker-start="url(#wb-circle)"'
              : ''
        const endMarker =
          p.endHead === 'arrow' || p.endHead === 'triangle'
            ? ' marker-end="url(#wb-arrow)"'
            : p.endHead === 'circle'
              ? ' marker-end="url(#wb-circle)"'
              : ''
        parts.push(
          `<path d="${d}" fill="none" stroke="${escXml(p.color || '#334155')}" stroke-width="${p.strokeWidth ?? 2}"${dashAttr(p.lineStyle)}${startMarker}${endMarker}/>`,
        )
        const lbl = richTextPlain(p.label)
        if (lbl) {
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2 - 8
          parts.push(
            `<text x="${mx}" y="${my}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#334155">${escXml(lbl)}</text>`,
          )
        }
        break
      }
      case 'stroke': {
        const p = obj.props as unknown as StrokeProps
        const d = computeStrokeOutline(p.points ?? [], p.width ?? 3, p.tool ?? 'pen')
        if (d) {
          parts.push(
            `<g transform="translate(${obj.x} ${obj.y})" opacity="${p.opacity ?? 1}"><path d="${d}" fill="${escXml(p.color || '#1E293B')}"/></g>`,
          )
        }
        break
      }
      case 'image': {
        const p = obj.props as unknown as ImageProps
        const dataUrl = resourceDataUrls.get(p.resourceId)
        if (dataUrl) {
          parts.push(
            `<g${rotAttr}><image href="${escXml(dataUrl)}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="xMidYMid meet"/></g>`,
          )
        }
        break
      }
      case 'table': {
        const p = obj.props as unknown as TableProps
        const rows = p.rowIds?.length || 1
        const cols = p.colIds?.length || 1
        const cellW = obj.width / cols
        const cellH = obj.height / rows
        parts.push(`<g${rotAttr}>`)
        parts.push(
          `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`,
        )
        p.rowIds?.forEach((rid, ri) => {
          p.colIds?.forEach((cid, ci) => {
            const cx0 = obj.x + ci * cellW
            const cy0 = obj.y + ri * cellH
            if (ri === 0 && p.headerRow) {
              parts.push(
                `<rect x="${cx0}" y="${cy0}" width="${cellW}" height="${cellH}" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>`,
              )
            } else {
              parts.push(
                `<rect x="${cx0}" y="${cy0}" width="${cellW}" height="${cellH}" fill="none" stroke="#CBD5E1" stroke-width="1"/>`,
              )
            }
            const cellTxt = richTextPlain(p.cells?.[`${rid}:${cid}`])
            if (cellTxt) {
              parts.push(
                renderMultilineTextSvg(
                  cellTxt,
                  cx0,
                  cy0,
                  cellW,
                  cellH,
                  p.fontSize ?? 13,
                  '#0F172A',
                  'left',
                ),
              )
            }
          })
        })
        parts.push('</g>')
        break
      }
      case 'sticker': {
        const p = obj.props as unknown as StickerProps
        parts.push(
          `<g${rotAttr}><svg x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" viewBox="0 0 100 100">${stickerInnerSvg(p.stickerId, p.tint)}</svg></g>`,
        )
        break
      }
      case 'link': {
        const p = obj.props as unknown as LinkProps
        parts.push(`<g${rotAttr}>`)
        parts.push(
          `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>`,
        )
        const hasPreview = p.previewResourceId && resourceDataUrls.has(p.previewResourceId)
        const textX = hasPreview ? obj.x + 112 : obj.x + 14
        const textW = hasPreview ? obj.width - 124 : obj.width - 28
        if (hasPreview) {
          const url = resourceDataUrls.get(p.previewResourceId!)!
          parts.push(
            `<image href="${escXml(url)}" x="${obj.x + 10}" y="${obj.y + 10}" width="92" height="${Math.max(40, obj.height - 20)}" preserveAspectRatio="xMidYMid slice"/>`,
          )
        }
        parts.push(
          `<text x="${textX}" y="${obj.y + 32}" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="#0F172A">${escXml((p.title || p.url).slice(0, 60))}</text>`,
        )
        if (p.description) {
          parts.push(
            `<text x="${textX}" y="${obj.y + 54}" font-family="system-ui, sans-serif" font-size="12" fill="#475569">${escXml(p.description.slice(0, 80))}</text>`,
          )
        }
        parts.push(
          `<text x="${textX}" y="${obj.y + obj.height - 16}" font-family="system-ui, sans-serif" font-size="11" fill="#2563EB">${escXml(p.url.slice(0, Math.max(20, Math.floor(textW / 6.5))))}</text>`,
        )
        parts.push('</g>')
        break
      }
    }
  }

  parts.push('</svg>')
  return {
    svg: parts.join('\n'),
    width: w,
    height: h,
    viewBoxX: bounds.x,
    viewBoxY: bounds.y,
  }
}

/** Rasterizes a theme-invariant page SVG into PNG bytes via an offscreen HTMLCanvasElement. */
export async function renderSvgToPngBytes(
  svg: string,
  width: number,
  height: number,
  maxEdge = 2400,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('failed to load SVG into image'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!pngBlob) return null
    const buf = await pngBlob.arrayBuffer()
    return { bytes: new Uint8Array(buf), width: outW, height: outH }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function uint8ToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
