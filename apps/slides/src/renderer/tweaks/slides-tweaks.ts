/**
 * No-AI live style Tweaks planner for Slides (T14).
 * Produces standard atomic `ApplyTxnOp` operations scoped strictly to either
 * the active slide (`scope: 'current'`) or the entire deck (`scope: 'deck'`).
 * Zero AI calls, zero modifications to `packages/pptx-engine`.
 */
import type { RenderSlide } from '@genoffice/pptx-render'
import type { ApplyTxnOp } from '../../shared/ipc'

export type SlidesTweaksScope = 'current' | 'deck'
export type SlidesTweaksPaletteId =
  'default' | 'editorial' | 'navy' | 'forest' | 'slate' | 'warm-sand'
export type SlidesTweaksRadius = 'sharp' | 'normal' | 'rounded'

export interface SlidesTweaksPalette {
  readonly id: SlidesTweaksPaletteId
  readonly background: string
  readonly surface: string
  readonly text: string
  readonly accent: string
}

export const SLIDES_TWEAKS_PALETTES: readonly SlidesTweaksPalette[] = [
  {
    id: 'default',
    background: '#FFFFFF',
    surface: '#F4F6FA',
    text: '#18181B',
    accent: '#2563EB',
  },
  {
    id: 'editorial',
    background: '#FBFAF7',
    surface: '#F2EFE8',
    text: '#1F1D1A',
    accent: '#9A3412',
  },
  {
    id: 'navy',
    background: '#F8FAFC',
    surface: '#E2E8F0',
    text: '#0F172A',
    accent: '#1E3A5F',
  },
  {
    id: 'forest',
    background: '#FCFDFB',
    surface: '#ECF3EE',
    text: '#14261C',
    accent: '#1F6F4A',
  },
  {
    id: 'slate',
    background: '#FFFFFF',
    surface: '#F4F4F5',
    text: '#18181B',
    accent: '#3F3F46',
  },
  {
    id: 'warm-sand',
    background: '#FDFBF7',
    surface: '#F5EDE0',
    text: '#292118',
    accent: '#B45309',
  },
]

export interface SlidesTweaksState {
  scope: SlidesTweaksScope
  palette: SlidesTweaksPaletteId
  /** 90..115 percent */
  fontScalePct: number
  radius: SlidesTweaksRadius
}

export const DEFAULT_SLIDES_TWEAKS: SlidesTweaksState = {
  scope: 'current',
  palette: 'default',
  fontScalePct: 100,
  radius: 'normal',
}

export function targetSlideIndexesForScope(
  slideCount: number,
  activeSlideIndex: number,
  scope: SlidesTweaksScope,
): number[] {
  if (slideCount <= 0) return []
  if (scope === 'deck') {
    return Array.from({ length: slideCount }, (_, i) => i)
  }
  const idx = Math.min(Math.max(0, activeSlideIndex), slideCount - 1)
  return [idx]
}

/**
 * Builds one atomic transaction payload for `applyTxn` (`journaledTxn`) so a
 * tweak adjustment applies as a single undo step and respects `current` vs `deck`.
 */
export function buildSlidesTweaksTxn(
  slides: readonly RenderSlide[],
  activeSlideIndex: number,
  state: SlidesTweaksState,
): ApplyTxnOp {
  const pal =
    SLIDES_TWEAKS_PALETTES.find((p) => p.id === state.palette) ?? SLIDES_TWEAKS_PALETTES[0]!
  const targets = targetSlideIndexesForScope(slides.length, activeSlideIndex, state.scope)
  const ops: unknown[] = []
  const scale = Math.min(115, Math.max(90, state.fontScalePct)) / 100

  for (const slideIndex of targets) {
    const slide = slides[slideIndex]
    if (!slide) continue
    ops.push({
      op: 'setBackground',
      slide: slideIndex,
      fill: { kind: 'solid', color: pal.background },
    })

    for (const node of slide.nodes as unknown as Array<Record<string, unknown>>) {
      const sourceId = typeof node.sourceId === 'string' ? node.sourceId : null
      if (!sourceId) continue

      const paragraphs = Array.isArray(node.paragraphs)
        ? (node.paragraphs as Array<Record<string, unknown>>)
        : null
      if (paragraphs && paragraphs.length > 0) {
        const firstRun = Array.isArray(paragraphs[0]?.runs)
          ? (paragraphs[0]!.runs as Array<Record<string, unknown>>)[0]
          : undefined
        const basePt = typeof firstRun?.fontSizePt === 'number' ? firstRun.fontSizePt : 16
        const scaledPt = Math.max(10, Math.round(basePt * scale))
        const isHeading = basePt >= 22
        ops.push({
          op: 'setElementFont',
          target: { slide: slideIndex, el: sourceId },
          color: isHeading ? pal.accent : pal.text,
          ...(state.fontScalePct !== 100 ? { fontSizePt: scaledPt } : {}),
        })
      }
    }
  }

  return {
    ops,
    isolation: 'per_op',
  }
}
