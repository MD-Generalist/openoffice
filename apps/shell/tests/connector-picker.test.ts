import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listObsidianPickerItems,
  resolveObsidianSelection,
} from '../src/main/connector-picker/obsidian-picker'
import {
  cleanupOldNotionSnapshots,
  fetchNotionPagesToTemp,
  findNotionTools,
  parseNotionSearchResults,
} from '../src/main/connector-picker/notion-picker'

let tempDir: string
let vaultDir: string
let attachDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ieum-connector-picker-'))
  vaultDir = join(tempDir, 'MyVault')
  attachDir = join(tempDir, 'ieumoffice-notion-attach')
  await mkdir(vaultDir, { recursive: true })
  await mkdir(attachDir, { recursive: true })
  await writeFile(join(vaultDir, 'Alpha.md'), '# Alpha\n#tag1', 'utf8')
  await writeFile(join(vaultDir, 'Beta.md'), '# Beta\n#tag2', 'utf8')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('Obsidian note picker backend', () => {
  it('marks unsaved open notes as disabled and caps selection at 20', async () => {
    const unsavedPath = join(vaultDir, 'Beta.md')
    const listed = await listObsidianPickerItems(
      [{ id: 'v1', name: 'MyVault', path: vaultDir, enabled: false }],
      async (p) => p.toLowerCase() === unsavedPath.toLowerCase(),
    )
    expect(listed.items).toHaveLength(2)
    const alpha = listed.items.find((i) => i.title === 'Alpha')!
    const beta = listed.items.find((i) => i.title === 'Beta')!
    expect(alpha.disabledReason).toBeUndefined()
    expect(beta.disabledReason).toBe('unsaved')

    // Submitting unsaved id or unknown id drops them safely
    const picked = resolveObsidianSelection([alpha.id, beta.id, 'bogus'], listed.items)
    expect(picked.paths).toEqual([alpha.id])
    expect(picked.skipped).toBe(2)

    // Selection is capped at 20
    const many = Array.from({ length: 25 }, (_, idx) => ({
      id: `C:/v/${idx}.md`,
      title: `N${idx}`,
      subtitle: `N${idx}.md`,
    }))
    const capped = resolveObsidianSelection(
      many.map((m) => m.id),
      many,
    )
    expect(capped.paths).toHaveLength(20)
  })
})

describe('Notion page picker backend', () => {
  it('finds official search and fetch tools and filters out databases from search results', () => {
    const tools = findNotionTools([
      { name: 'notion-search', description: 'Search Notion', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'notion-fetch', description: 'Fetch Notion page', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
    ])
    expect(tools?.searchTool.name).toBe('notion-search')
    expect(tools?.fetchTool.name).toBe('notion-fetch')

    const parsed = parseNotionSearchResults(
      JSON.stringify({
        results: [
          { id: 'p1', type: 'page', title: 'Roadmap 2026', timestamp: '2026-11-20T10:00:00Z' },
          { id: 'db1', type: 'database', title: 'Tasks DB', timestamp: '2026-11-20T10:00:00Z' },
          { id: 'ds1', object: 'data_source', title: 'CRM Data', timestamp: '2026-11-20T10:00:00Z' },
          { id: 'p2', object: 'page', title: 'Meeting Notes', last_edited_time: '2026-11-19T08:00:00Z' },
        ],
      }),
    )
    expect(parsed.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('fetches selected pages to temp .md snapshots, counts omitted non-text items, and cleans files older than 7 days', async () => {
    // Plant an 8-day-old file and a fresh file
    const oldFile = join(attachDir, 'stale.md')
    const freshFile = join(attachDir, 'fresh.md')
    await writeFile(oldFile, 'old', 'utf8')
    await writeFile(freshFile, 'fresh', 'utf8')
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(oldFile, eightDaysAgo, eightDaysAgo)

    await cleanupOldNotionSnapshots(attachDir)
    await expect(readFile(oldFile, 'utf8')).rejects.toThrow()
    expect(await readFile(freshFile, 'utf8')).toBe('fresh')

    const callForUserPicker = vi.fn(async () => ({
      ok: true as const,
      output: '# Roadmap 2026\n\nGoals for Q4.\n<image src="https://img.example/a.png" />\n<file url="https://f.example/b.pdf" />',
      isError: false,
    }))
    const res = await fetchNotionPagesToTemp({
      serverId: 'notion-1',
      selectedItems: [{ id: 'page-123', title: 'Roadmap / 2026', subtitle: '2026-11-20' }],
      fetchTool: { name: 'notion-fetch', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
      callForUserPicker,
      attachDir,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.paths).toHaveLength(1)
      expect(res.paths[0]).toMatch(/\.md$/)
      expect(res.omittedNonText).toBe(2)
      const saved = await readFile(res.paths[0]!, 'utf8')
      expect(saved).toContain('# Roadmap 2026')
    }
  })
})
