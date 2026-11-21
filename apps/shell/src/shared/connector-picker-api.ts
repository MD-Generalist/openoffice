/**
 * IPC contract for the shell's connector attachment picker window (Obsidian
 * vault notes and Notion pages). The window works only with item IDs returned
 * by the shell; the shell validates IDs and resolves them to file paths.
 */
import type { Lang } from '@genoffice/i18n'

export const CONNECTOR_PICKER_CHANNELS = {
  getInit: 'connector-picker:get-init',
  list: 'connector-picker:list',
  choose: 'connector-picker:choose',
  cancel: 'connector-picker:cancel',
  openSettings: 'connector-picker:open-settings',
} as const

export const CONNECTOR_PICKER_PAGE_KEY = 'aiOfficeConnectorPicker'

export type ConnectorPickerKind = 'obsidian' | 'notion'
export type ConnectorPickerTheme = 'light' | 'dark' | 'system'

export interface ConnectorPickerVaultChip {
  id: string
  name: string
}

export interface ConnectorPickerInit {
  kind: ConnectorPickerKind
  lang: Lang
  theme: ConnectorPickerTheme
  vaults: ConnectorPickerVaultChip[]
}

export interface ConnectorPickerItem {
  id: string
  title: string
  subtitle: string
  vaultId?: string
  vaultName?: string
  tags?: string[]
  mtimeMs?: number
  disabledReason?: 'unsaved'
}

export type ConnectorPickerListResult =
  | { ok: true; items: ConnectorPickerItem[] }
  | { ok: false; error: string }

export type ConnectorPickerChooseResult = { ok: true } | { ok: false; error: string }

export interface ConnectorPickerApi {
  getInit(): Promise<ConnectorPickerInit>
  onThemeChanged(handler: (theme: ConnectorPickerTheme) => void): () => void
  list(query?: string): Promise<ConnectorPickerListResult>
  choose(ids: string[]): Promise<ConnectorPickerChooseResult>
  cancel(): Promise<void>
  openSettings(): Promise<void>
}
