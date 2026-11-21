import { basename } from 'node:path'
import { suggestServerName } from '@genoffice/agent-core/user-mcp/names'
import type { McpPresetId, McpServerKind } from '../../shared/mcp-servers-api'

/**
 * Curated connector presets in Settings → Integrations.
 *
 * Matching existing manually registered servers requires an exact normalized
 * official URL (for remote presets) or the official package/command target
 * (for local presets). A server that only shares the preset's default name
 * stays separate in the custom MCP list, and connecting the preset auto-assigns
 * a disambiguated name (`notion-2`, etc.).
 */

export interface McpRemotePresetSpec {
  id: 'notion' | 'canva'
  kind: 'remote'
  defaultName: string
  url: string
  keepResultsInside: boolean
}

export interface McpLocalPresetSpec {
  id: 'korean-law' | 'kordoc'
  kind: 'local'
  defaultName: string
  command: string
  args: readonly string[]
  keepResultsInside: boolean
  requiredEnv?: 'LAW_OC'
  envGuideUrl?: string
}

export type McpPresetSpec = McpRemotePresetSpec | McpLocalPresetSpec

export const MCP_PRESETS = {
  notion: {
    id: 'notion',
    kind: 'remote',
    defaultName: 'notion',
    url: 'https://mcp.notion.com/mcp',
    keepResultsInside: true,
  },
  canva: {
    id: 'canva',
    kind: 'remote',
    defaultName: 'canva',
    url: 'https://mcp.canva.com/mcp',
    keepResultsInside: true,
  },
  'korean-law': {
    id: 'korean-law',
    kind: 'local',
    defaultName: 'korean-law',
    command: 'npx',
    args: ['-y', 'korean-law-mcp'],
    keepResultsInside: false,
    requiredEnv: 'LAW_OC',
    envGuideUrl: 'https://open.law.go.kr',
  },
  kordoc: {
    id: 'kordoc',
    kind: 'local',
    defaultName: 'kordoc',
    command: 'npx',
    args: ['-y', 'kordoc', 'mcp'],
    keepResultsInside: true,
  },
} as const satisfies Record<McpPresetId, McpPresetSpec>

/** Normalize an HTTP(S) URL to `<origin><pathname without trailing slash>` */
export function normalizePresetUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.origin.toLowerCase()}${path}`
  } catch {
    return null
  }
}

const NOTION_URL_NORM = normalizePresetUrl(MCP_PRESETS.notion.url)!
const CANVA_URL_NORM = normalizePresetUrl(MCP_PRESETS.canva.url)!

const RUNNER_COMMANDS = new Set(['npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn', 'bun'])

function commandBase(command: string): string {
  const base = basename(command.trim()).toLowerCase()
  return base.replace(/\.(cmd|exe|bat|ps1)$/i, '')
}

function packageMatches(arg: string, pkgName: string): boolean {
  const lower = arg.trim().toLowerCase()
  return lower === pkgName || lower.startsWith(`${pkgName}@`)
}

function findPackageIndex(command: string, args: readonly string[], pkgName: string): number {
  const base = commandBase(command)
  if (base === pkgName) return -1
  if (!RUNNER_COMMANDS.has(base)) return -2
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    if (packageMatches(a, pkgName)) return i
  }
  return -2
}

export interface PresetMatchTarget {
  kind: McpServerKind
  presetId?: McpPresetId | null
  url: string
  command: string
  args: readonly string[]
}

/**
 * Determine which curated preset a stored server matches by inspecting its
 * actual target URL or command+args. Returns null for custom servers and for
 * servers whose name collides with a preset without targeting the official endpoint.
 */
export function matchPresetOfServer(server: PresetMatchTarget): McpPresetId | null {
  if (server.kind === 'remote') {
    const norm = normalizePresetUrl(server.url)
    if (norm === NOTION_URL_NORM) return 'notion'
    if (norm === CANVA_URL_NORM) return 'canva'
    return null
  }
  if (server.kind === 'local') {
    if (findPackageIndex(server.command, server.args, 'korean-law-mcp') >= -1) {
      return 'korean-law'
    }
    const kordocIdx = findPackageIndex(server.command, server.args, 'kordoc')
    if (kordocIdx >= -1) {
      const rest = kordocIdx === -1 ? server.args : server.args.slice(kordocIdx + 1)
      if (rest.some((a) => a.trim().toLowerCase() === 'mcp')) return 'kordoc'
    }
  }
  return null
}

/** Pick a unique MCP server name for a preset or built-in connector */
export function presetServerName(baseName: string, takenNames: Iterable<string>): string {
  return suggestServerName(baseName, takenNames)
}
