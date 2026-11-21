import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConnectorAttachWireResult } from '@genoffice/electron-utils/connector-attach-channels'
import type { ConnectorPickerItem } from '../../shared/connector-picker-api'
import { atomicWriteFile } from '../atomic-write'

/** Subdirectory under OS temp dir where Notion page snapshots are stored */
export const NOTION_ATTACH_SUBDIR = 'ieumoffice-notion-attach'
/** Maximum number of Notion pages that may be attached in one pick */
export const MAX_NOTION_PICKS = 20
/** Cleanup threshold for cached Notion attach snapshots (7 days) */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface NotionToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface NotionToolPair {
  searchTool: NotionToolDescriptor
  fetchTool: NotionToolDescriptor
  searchQueryParam: string
  fetchIdParam: string
}

function schemaStringProp(
  schema: Record<string, unknown> | undefined,
  preferred: readonly string[],
): string | null {
  const props = schema?.properties
  if (!props || typeof props !== 'object') return null
  const record = props as Record<string, unknown>
  for (const key of preferred) {
    if (key in record) return key
  }
  for (const [key, val] of Object.entries(record)) {
    if (val && typeof val === 'object' && (val as { type?: unknown }).type === 'string') {
      return key
    }
  }
  return null
}

/**
 * Discover the Notion search and fetch tools from a server's advertised tool
 * catalog using tool names and input schemas rather than hardcoded exact names.
 */
export function findNotionTools(tools: readonly NotionToolDescriptor[]): NotionToolPair | null {
  const scoreSearch = (t: NotionToolDescriptor): number => {
    const n = t.name.toLowerCase()
    if (n === 'notion-search' || n === 'notion_search' || n === 'search') return 100
    if (n.includes('search') && !n.includes('user')) return 70
    return 0
  }
  const scoreFetch = (t: NotionToolDescriptor): number => {
    const n = t.name.toLowerCase()
    if (n === 'notion-fetch' || n === 'notion_fetch' || n === 'fetch') return 100
    if (n.includes('fetch') || n.includes('get-page') || n.includes('get_page') || n.includes('retrieve-page') || n.includes('retrieve_page')) {
      return 70
    }
    return 0
  }

  let searchTool: NotionToolDescriptor | null = null
  let bestSearch = 0
  let fetchTool: NotionToolDescriptor | null = null
  let bestFetch = 0

  for (const t of tools) {
    const s = scoreSearch(t)
    if (s > bestSearch) {
      bestSearch = s
      searchTool = t
    }
    const f = scoreFetch(t)
    if (f > bestFetch) {
      bestFetch = f
      fetchTool = t
    }
  }

  if (!searchTool || !fetchTool) return null
  return {
    searchTool,
    fetchTool,
    searchQueryParam: schemaStringProp(searchTool.inputSchema, ['query', 'q', 'text', 'keyword']) ?? 'query',
    fetchIdParam: schemaStringProp(fetchTool.inputSchema, ['id', 'page_id', 'pageId', 'url']) ?? 'id',
  }
}

const EXCLUDED_NOTION_TYPES = new Set([
  'database',
  'data_source',
  'datasource',
  'user',
  'comment',
  'block',
])

function extractTitle(entry: Record<string, unknown>): string {
  if (typeof entry.title === 'string' && entry.title.trim()) return entry.title.trim()
  if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim()
  // Notion API-style properties.title / properties.Name
  const props = entry.properties
  if (props && typeof props === 'object') {
    for (const val of Object.values(props as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const titleArr = (val as { title?: unknown }).title
        if (Array.isArray(titleArr)) {
          const joined = titleArr
            .map((t) =>
              t && typeof t === 'object' && typeof (t as { plain_text?: unknown }).plain_text === 'string'
                ? (t as { plain_text: string }).plain_text
                : '',
            )
            .join('')
            .trim()
          if (joined) return joined
        }
      }
    }
  }
  return ''
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Check for fenced ```json block or first JSON object/array
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) {
      try {
        return JSON.parse(fenced[1]!.trim())
      } catch {
        // fall through
      }
    }
    const start = trimmed.search(/[{[]/)
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start))
      } catch {
        // fall through
      }
    }
    return null
  }
}

/**
 * Parse Notion search tool output and keep only individual pages (databases,
 * data sources, users, and comments are excluded).
 */
export function parseNotionSearchResults(output: string): ConnectorPickerItem[] {
  const parsed = tryParseJson(output)
  let rawList: unknown[] = []
  if (Array.isArray(parsed)) {
    rawList = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['results', 'pages', 'items', 'data']) {
      if (Array.isArray(obj[key])) {
        rawList = obj[key] as unknown[]
        break
      }
    }
  }

  const items: ConnectorPickerItem[] = []
  const seen = new Set<string>()
  for (const row of rawList) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const kind = String(rec.type ?? rec.object ?? '').trim().toLowerCase()
    if (kind && EXCLUDED_NOTION_TYPES.has(kind)) continue
    const id =
      typeof rec.id === 'string' && rec.id.trim()
        ? rec.id.trim()
        : typeof rec.url === 'string' && rec.url.trim()
          ? rec.url.trim()
          : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const title = extractTitle(rec) || id
    const subtitleRaw =
      rec.timestamp ?? rec.last_edited_time ?? rec.updated_at ?? rec.url ?? ''
    const subtitle = typeof subtitleRaw === 'string' ? subtitleRaw.trim() : ''
    items.push({ id, title, subtitle })
  }
  return items
}

/** Remove temporary Notion snapshot `.md` files older than 7 days */
export async function cleanupOldNotionSnapshots(
  attachDir: string,
  nowMs: number = Date.now(),
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(attachDir)
  } catch {
    return
  }
  const cutoff = nowMs - SNAPSHOT_MAX_AGE_MS
  await Promise.all(
    entries.map(async (name) => {
      if (!name.toLowerCase().endsWith('.md')) return
      const full = join(attachDir, name)
      try {
        const info = await stat(full)
        if (info.isFile() && info.mtimeMs < cutoff) {
          await unlink(full)
        }
      } catch {
        // ignore stale or vanished files
      }
    }),
  )
}

function safeSnapshotName(title: string, id: string, index: number): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  const base = cleaned || `notion-page-${index + 1}`
  const shortId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || `${Date.now().toString(36)}`
  return `${base}-${shortId}.md`
}

function countNonTextElements(markdown: string): number {
  const tagMatches =
    markdown.match(/<(?:image|img|file|video|audio|pdf|embed|bookmark)\b[^>]*>/gi)?.length ?? 0
  const mdImageMatches = markdown.match(/!\[[^\]]*\]\([^)]+\)/g)?.length ?? 0
  return tagMatches + mdImageMatches
}

export type NotionPickerCallAnswer =
  | { ok: true; output: string; isError: boolean }
  | { ok: false; error: string }

export interface FetchNotionPagesParams {
  serverId: string
  selectedItems: readonly ConnectorPickerItem[]
  fetchTool: NotionToolDescriptor
  fetchIdParam?: string
  callForUserPicker: (
    serverId: string,
    tool: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<NotionPickerCallAnswer>
  attachDir: string
  signal?: AbortSignal
}

/**
 * Fetch up to 20 selected Notion pages through the user-picker channel and save
 * each page's text content as a temporary `.md` file in `attachDir`.
 */
export async function fetchNotionPagesToTemp(
  params: FetchNotionPagesParams,
): Promise<ConnectorAttachWireResult> {
  const items = params.selectedItems.slice(0, MAX_NOTION_PICKS)
  if (items.length === 0) return { ok: false, reason: 'cancelled' }

  await mkdir(params.attachDir, { recursive: true })
  const idParam =
    params.fetchIdParam ??
    schemaStringProp(params.fetchTool.inputSchema, ['id', 'page_id', 'pageId', 'url']) ??
    'id'

  const paths: string[] = []
  let failed = 0
  let omittedNonText = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const res = await params.callForUserPicker(
      params.serverId,
      params.fetchTool.name,
      { [idParam]: item.id },
      params.signal,
    )
    if (!res.ok || res.isError || !res.output.trim()) {
      failed += 1
      continue
    }
    omittedNonText += countNonTextElements(res.output)
    const filePath = join(params.attachDir, safeSnapshotName(item.title, item.id, i))
    await atomicWriteFile(filePath, Buffer.from(res.output, 'utf8'))
    paths.push(filePath)
  }

  if (paths.length === 0) {
    return { ok: false, reason: 'failed' }
  }
  return {
    ok: true,
    paths,
    ...(failed > 0 ? { failed } : {}),
    ...(omittedNonText > 0 ? { omittedNonText } : {}),
  }
}
