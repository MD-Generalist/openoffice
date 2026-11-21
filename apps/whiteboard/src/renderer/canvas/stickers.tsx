/**
 * Built-in vector stickers (zero external assets, theme-invariant document artwork).
 */
import type { ReactElement } from 'react'

export const STICKER_IDS = [
  'star',
  'heart',
  'check',
  'thumbsup',
  'bulb',
  'fire',
  'trophy',
  'medal',
  'flag',
  'rocket',
  'sparkle',
  'arrow',
  'speech',
  'pencil',
  'book',
  'clock',
  'one',
  'two',
  'three',
] as const

export type StickerId = (typeof STICKER_IDS)[number]

const INK = '#1E293B'
const PAPER = '#FFFFFF'
const YELLOW = '#FACC15'
const ORANGE = '#FB923C'
const RED = '#F87171'
const GREEN = '#4ADE80'
const BLUE = '#60A5FA'
const PURPLE = '#A78BFA'

function starPath(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? rOut : rIn
    pts.push(
      `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r).toFixed(1)}`,
    )
  }
  return `${pts.join(' ')} Z`
}

function sparklePath(cx: number, cy: number, r: number): string {
  const q = r * 0.26
  return `M${cx} ${cy - r} Q${cx + q} ${cy - q} ${cx + r} ${cy} Q${cx + q} ${cy + q} ${cx} ${cy + r} Q${cx - q} ${cy + q} ${cx - r} ${cy} Q${cx - q} ${cy - q} ${cx} ${cy - r} Z`
}

const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,24})$/

function safeTint(tint: string | undefined, fallback: string): string {
  if (typeof tint !== 'string') return fallback
  const trimmed = tint.trim()
  return SAFE_COLOR_RE.test(trimmed) ? trimmed : fallback
}

/** Pure SVG markup string for a sticker (used by both live DOM and SVG/PNG/PDF export). */
export function stickerInnerSvg(stickerId: string, tint?: string): string {
  const accent = safeTint(tint, YELLOW)
  switch (stickerId) {
    case 'star':
      return `<path d="${starPath(50, 52, 40, 18)}" fill="${accent}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    case 'heart':
      return `<path d="M50 84 C20 62 12 42 18 28 C24 14 40 16 50 30 C60 16 76 14 82 28 C88 42 80 62 50 84 Z" fill="${safeTint(tint, RED)}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    case 'check':
      return `<circle cx="50" cy="50" r="40" fill="${safeTint(tint, GREEN)}" stroke="${INK}" stroke-width="4"/><path d="M30 52 L44 66 L72 36" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'thumbsup':
      return `<circle cx="50" cy="50" r="40" fill="${safeTint(tint, BLUE)}" stroke="${INK}" stroke-width="4"/><path d="M34 52 H44 V72 H34 Z M46 52 L54 30 C56 26 62 28 60 36 L58 46 H70 C74 46 76 50 74 56 L70 68 C68 72 64 72 58 72 H46 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
    case 'bulb':
      return `<path d="M36 66 C36 56 24 50 24 36 C24 22 36 12 50 12 C64 12 76 22 76 36 C76 50 64 56 64 66 Z" fill="${accent}" stroke="${INK}" stroke-width="4"/><rect x="38" y="68" width="24" height="8" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/><rect x="42" y="78" width="16" height="8" rx="3" fill="#CBD5E1" stroke="${INK}" stroke-width="3.5"/>`
    case 'fire':
      return `<path d="M50 12 C66 28 80 44 76 64 C73 78 62 88 50 88 C36 88 24 78 24 62 C24 46 36 38 38 26 C42 32 45 34 46 28 C48 22 48 16 50 12 Z" fill="${safeTint(tint, ORANGE)}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M50 48 C58 56 62 64 58 74 C56 80 52 82 50 82 C44 82 40 76 42 68 C43 60 47 54 50 48 Z" fill="${YELLOW}"/>`
    case 'trophy':
      return `<path d="M30 26 H14 C14 42 22 50 34 50 M70 26 H86 C86 42 78 50 66 50" fill="none" stroke="${INK}" stroke-width="4"/><path d="M28 16 H72 V36 C72 52 62 62 50 62 C38 62 28 52 28 36 Z" fill="${accent}" stroke="${INK}" stroke-width="4"/><rect x="44" y="62" width="12" height="12" fill="${accent}" stroke="${INK}" stroke-width="4"/><rect x="30" y="74" width="40" height="12" rx="3" fill="${ORANGE}" stroke="${INK}" stroke-width="4"/>`
    case 'medal':
      return `<path d="M28 6 H44 L56 40 H40 Z" fill="${BLUE}" stroke="${INK}" stroke-width="3.5"/><path d="M72 6 H56 L44 40 H60 Z" fill="${RED}" stroke="${INK}" stroke-width="3.5"/><circle cx="50" cy="64" r="26" fill="${accent}" stroke="${INK}" stroke-width="4"/><path d="${starPath(50, 65, 13, 6)}" fill="${ORANGE}"/>`
    case 'flag':
      return `<path d="M28 18 H80 L70 34 L80 50 H28 Z" fill="${safeTint(tint, RED)}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><rect x="20" y="10" width="8" height="80" rx="3" fill="#9A6A43" stroke="${INK}" stroke-width="3.5"/>`
    case 'rocket':
      return `<path d="M40 76 L50 94 L60 76 Z" fill="${ORANGE}" stroke="${INK}" stroke-width="3.5"/><path d="M36 54 L20 70 V80 L38 72 Z M64 54 L80 70 V80 L62 72 Z" fill="${RED}" stroke="${INK}" stroke-width="3.5"/><path d="M50 6 C68 22 72 48 64 76 H36 C28 48 32 22 50 6 Z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/><circle cx="50" cy="38" r="9" fill="${safeTint(tint, BLUE)}" stroke="${INK}" stroke-width="3.5"/>`
    case 'sparkle':
      return `<path d="${sparklePath(42, 56, 36)}" fill="${accent}" stroke="${INK}" stroke-width="3.5"/><path d="${sparklePath(76, 22, 16)}" fill="${accent}" stroke="${INK}" stroke-width="3"/>`
    case 'arrow':
      return `<path d="M10 38 H54 V18 L90 50 L54 82 V62 H10 Z" fill="${safeTint(tint, GREEN)}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    case 'speech':
      return `<path d="M14 24 Q14 12 26 12 H74 Q86 12 86 24 V56 Q86 68 74 68 H46 L26 86 L30 68 H26 Q14 68 14 56 Z" fill="${safeTint(tint, '#CFE3F7')}" stroke="${INK}" stroke-width="4"/><circle cx="34" cy="40" r="5" fill="${INK}"/><circle cx="50" cy="40" r="5" fill="${INK}"/><circle cx="66" cy="40" r="5" fill="${INK}"/>`
    case 'pencil':
      return `<g transform="rotate(-45 50 50)"><rect x="22" y="38" width="48" height="24" fill="${accent}" stroke="${INK}" stroke-width="4"/><rect x="10" y="38" width="12" height="24" rx="3" fill="#F2A99F" stroke="${INK}" stroke-width="4"/><path d="M70 38 L92 50 L70 62 Z" fill="#FDE68A" stroke="${INK}" stroke-width="4"/><path d="M85 46 L92 50 L85 54 Z" fill="${INK}"/></g>`
    case 'book':
      return `<path d="M50 26 C40 18 24 16 8 20 V80 C24 76 40 78 50 86 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/><path d="M50 26 C60 18 76 16 92 20 V80 C76 76 60 78 50 86 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/><path d="M8 80 C24 76 40 78 50 86 C60 78 76 76 92 80 V88 H8 Z" fill="${safeTint(tint, BLUE)}" stroke="${INK}" stroke-width="3.5"/>`
    case 'clock':
      return `<circle cx="50" cy="50" r="40" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><path d="M50 50 V28 M50 50 L66 60" stroke="${safeTint(tint, RED)}" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="${INK}"/>`
    case 'one':
    case 'two':
    case 'three': {
      const fill = stickerId === 'one' ? RED : stickerId === 'two' ? BLUE : PURPLE
      const digit = stickerId === 'one' ? '1' : stickerId === 'two' ? '2' : '3'
      return `<circle cx="50" cy="50" r="40" fill="${safeTint(tint, fill)}" stroke="${INK}" stroke-width="4"/><text x="50" y="64" text-anchor="middle" font-size="44" font-weight="700" fill="${PAPER}" font-family="system-ui, sans-serif">${digit}</text>`
    }
    default:
      return `<circle cx="50" cy="50" r="36" fill="${accent}" stroke="${INK}" stroke-width="4"/>`
  }
}

export function StickerIcon({
  stickerId,
  tint,
  size,
}: {
  stickerId: string
  tint?: string
  size?: number
}): ReactElement {
  // Pure static vector paths drawn directly via SVG elements (never arbitrary user HTML).
  return (
    <svg
      viewBox="0 0 100 100"
      width={size ?? '100%'}
      height={size ?? '100%'}
      aria-hidden="true"
      focusable="false"
    >
      {renderStickerElements(stickerId, tint)}
    </svg>
  )
}

function renderStickerElements(stickerId: string, tint?: string): ReactElement {
  const accent = safeTint(tint, YELLOW)
  switch (stickerId) {
    case 'star':
      return (
        <path
          d={starPath(50, 52, 40, 18)}
          fill={accent}
          stroke={INK}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )
    case 'heart':
      return (
        <path
          d="M50 84 C20 62 12 42 18 28 C24 14 40 16 50 30 C60 16 76 14 82 28 C88 42 80 62 50 84 Z"
          fill={safeTint(tint, RED)}
          stroke={INK}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )
    case 'check':
      return (
        <>
          <circle
            cx={50}
            cy={50}
            r={40}
            fill={safeTint(tint, GREEN)}
            stroke={INK}
            strokeWidth={4}
          />
          <path
            d="M30 52 L44 66 L72 36"
            fill="none"
            stroke={INK}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
    case 'thumbsup':
      return (
        <>
          <circle cx={50} cy={50} r={40} fill={safeTint(tint, BLUE)} stroke={INK} strokeWidth={4} />
          <path
            d="M34 52 H44 V72 H34 Z M46 52 L54 30 C56 26 62 28 60 36 L58 46 H70 C74 46 76 50 74 56 L70 68 C68 72 64 72 58 72 H46 Z"
            fill={PAPER}
            stroke={INK}
            strokeWidth={3.5}
            strokeLinejoin="round"
          />
        </>
      )
    case 'bulb':
      return (
        <>
          <path
            d="M36 66 C36 56 24 50 24 36 C24 22 36 12 50 12 C64 12 76 22 76 36 C76 50 64 56 64 66 Z"
            fill={accent}
            stroke={INK}
            strokeWidth={4}
          />
          <rect
            x={38}
            y={68}
            width={24}
            height={8}
            rx={3}
            fill={PAPER}
            stroke={INK}
            strokeWidth={3.5}
          />
          <rect
            x={42}
            y={78}
            width={16}
            height={8}
            rx={3}
            fill="#CBD5E1"
            stroke={INK}
            strokeWidth={3.5}
          />
        </>
      )
    case 'fire':
      return (
        <>
          <path
            d="M50 12 C66 28 80 44 76 64 C73 78 62 88 50 88 C36 88 24 78 24 62 C24 46 36 38 38 26 C42 32 45 34 46 28 C48 22 48 16 50 12 Z"
            fill={safeTint(tint, ORANGE)}
            stroke={INK}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <path
            d="M50 48 C58 56 62 64 58 74 C56 80 52 82 50 82 C44 82 40 76 42 68 C43 60 47 54 50 48 Z"
            fill={YELLOW}
          />
        </>
      )
    case 'trophy':
      return (
        <>
          <path
            d="M30 26 H14 C14 42 22 50 34 50 M70 26 H86 C86 42 78 50 66 50"
            fill="none"
            stroke={INK}
            strokeWidth={4}
          />
          <path
            d="M28 16 H72 V36 C72 52 62 62 50 62 C38 62 28 52 28 36 Z"
            fill={accent}
            stroke={INK}
            strokeWidth={4}
          />
          <rect x={44} y={62} width={12} height={12} fill={accent} stroke={INK} strokeWidth={4} />
          <rect
            x={30}
            y={74}
            width={40}
            height={12}
            rx={3}
            fill={ORANGE}
            stroke={INK}
            strokeWidth={4}
          />
        </>
      )
    case 'medal':
      return (
        <>
          <path d="M28 6 H44 L56 40 H40 Z" fill={BLUE} stroke={INK} strokeWidth={3.5} />
          <path d="M72 6 H56 L44 40 H60 Z" fill={RED} stroke={INK} strokeWidth={3.5} />
          <circle cx={50} cy={64} r={26} fill={accent} stroke={INK} strokeWidth={4} />
          <path d={starPath(50, 65, 13, 6)} fill={ORANGE} />
        </>
      )
    case 'flag':
      return (
        <>
          <path
            d="M28 18 H80 L70 34 L80 50 H28 Z"
            fill={safeTint(tint, RED)}
            stroke={INK}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <rect
            x={20}
            y={10}
            width={8}
            height={80}
            rx={3}
            fill="#9A6A43"
            stroke={INK}
            strokeWidth={3.5}
          />
        </>
      )
    case 'rocket':
      return (
        <>
          <path d="M40 76 L50 94 L60 76 Z" fill={ORANGE} stroke={INK} strokeWidth={3.5} />
          <path
            d="M36 54 L20 70 V80 L38 72 Z M64 54 L80 70 V80 L62 72 Z"
            fill={RED}
            stroke={INK}
            strokeWidth={3.5}
          />
          <path
            d="M50 6 C68 22 72 48 64 76 H36 C28 48 32 22 50 6 Z"
            fill={PAPER}
            stroke={INK}
            strokeWidth={4}
          />
          <circle
            cx={50}
            cy={38}
            r={9}
            fill={safeTint(tint, BLUE)}
            stroke={INK}
            strokeWidth={3.5}
          />
        </>
      )
    case 'sparkle':
      return (
        <>
          <path d={sparklePath(42, 56, 36)} fill={accent} stroke={INK} strokeWidth={3.5} />
          <path d={sparklePath(76, 22, 16)} fill={accent} stroke={INK} strokeWidth={3} />
        </>
      )
    case 'arrow':
      return (
        <path
          d="M10 38 H54 V18 L90 50 L54 82 V62 H10 Z"
          fill={safeTint(tint, GREEN)}
          stroke={INK}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )
    case 'speech':
      return (
        <>
          <path
            d="M14 24 Q14 12 26 12 H74 Q86 12 86 24 V56 Q86 68 74 68 H46 L26 86 L30 68 H26 Q14 68 14 56 Z"
            fill={safeTint(tint, '#CFE3F7')}
            stroke={INK}
            strokeWidth={4}
          />
          <circle cx={34} cy={40} r={5} fill={INK} />
          <circle cx={50} cy={40} r={5} fill={INK} />
          <circle cx={66} cy={40} r={5} fill={INK} />
        </>
      )
    case 'pencil':
      return (
        <g transform="rotate(-45 50 50)">
          <rect x={22} y={38} width={48} height={24} fill={accent} stroke={INK} strokeWidth={4} />
          <rect
            x={10}
            y={38}
            width={12}
            height={24}
            rx={3}
            fill="#F2A99F"
            stroke={INK}
            strokeWidth={4}
          />
          <path d="M70 38 L92 50 L70 62 Z" fill="#FDE68A" stroke={INK} strokeWidth={4} />
          <path d="M85 46 L92 50 L85 54 Z" fill={INK} />
        </g>
      )
    case 'book':
      return (
        <>
          <path
            d="M50 26 C40 18 24 16 8 20 V80 C24 76 40 78 50 86 Z"
            fill={PAPER}
            stroke={INK}
            strokeWidth={3.5}
          />
          <path
            d="M50 26 C60 18 76 16 92 20 V80 C76 76 60 78 50 86 Z"
            fill={PAPER}
            stroke={INK}
            strokeWidth={3.5}
          />
          <path
            d="M8 80 C24 76 40 78 50 86 C60 78 76 76 92 80 V88 H8 Z"
            fill={safeTint(tint, BLUE)}
            stroke={INK}
            strokeWidth={3.5}
          />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx={50} cy={50} r={40} fill={PAPER} stroke={INK} strokeWidth={5} />
          <path
            d="M50 50 V28 M50 50 L66 60"
            stroke={safeTint(tint, RED)}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle cx={50} cy={50} r={4} fill={INK} />
        </>
      )
    case 'one':
    case 'two':
    case 'three': {
      const fill = stickerId === 'one' ? RED : stickerId === 'two' ? BLUE : PURPLE
      const digit = stickerId === 'one' ? '1' : stickerId === 'two' ? '2' : '3'
      return (
        <>
          <circle cx={50} cy={50} r={40} fill={safeTint(tint, fill)} stroke={INK} strokeWidth={4} />
          <text x={50} y={64} textAnchor="middle" fontSize={44} fontWeight={700} fill={PAPER}>
            {digit}
          </text>
        </>
      )
    }
    default:
      return <circle cx={50} cy={50} r={36} fill={accent} stroke={INK} strokeWidth={4} />
  }
}
