import { describe, expect, it } from 'vitest'
import type { RenderSlide } from '@genoffice/pptx-render'
import {
  DEFAULT_SLIDES_TWEAKS,
  buildSlidesTweaksTxn,
  targetSlideIndexesForScope,
} from '../src/renderer/tweaks/slides-tweaks'

const makeSlide = (index: number): RenderSlide =>
  ({
    index,
    widthPx: 960,
    heightPx: 540,
    nodes: [
      {
        kind: 'shape',
        sourceId: `title-${index}`,
        paragraphs: [{ runs: [{ text: 'Heading', fontSizePt: 28 }] }],
      },
      {
        kind: 'shape',
        sourceId: `body-${index}`,
        paragraphs: [{ runs: [{ text: 'Body', fontSizePt: 16 }] }],
      },
    ],
  }) as unknown as RenderSlide

describe('Slides No-AI Style Tweaks', () => {
  it('respects Current slide vs Whole deck scope toggle in atomic ApplyTxnOp', () => {
    const slides = [makeSlide(0), makeSlide(1), makeSlide(2)]
    expect(targetSlideIndexesForScope(3, 1, 'current')).toEqual([1])
    expect(targetSlideIndexesForScope(3, 1, 'deck')).toEqual([0, 1, 2])

    const currentTxn = buildSlidesTweaksTxn(slides, 1, {
      ...DEFAULT_SLIDES_TWEAKS,
      scope: 'current',
      palette: 'navy',
      fontScalePct: 110,
    })
    const currentSlidesTouched = new Set(
      currentTxn.ops.map((op) => {
        const rec = op as { slide?: number; target?: { slide?: number } }
        return rec.slide ?? rec.target?.slide
      }),
    )
    expect([...currentSlidesTouched]).toEqual([1])

    const deckTxn = buildSlidesTweaksTxn(slides, 1, {
      ...DEFAULT_SLIDES_TWEAKS,
      scope: 'deck',
      palette: 'forest',
      fontScalePct: 95,
    })
    const deckSlidesTouched = new Set(
      deckTxn.ops.map((op) => {
        const rec = op as { slide?: number; target?: { slide?: number } }
        return rec.slide ?? rec.target?.slide
      }),
    )
    expect([...deckSlidesTouched].sort()).toEqual([0, 1, 2])
  })
})
