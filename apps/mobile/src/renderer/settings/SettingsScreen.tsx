import { useState } from 'react'
import { LANGS, type Lang } from '@genoffice/i18n'
import { SUBSCRIPTION_CHATGPT_USAGE_URL } from '@genoffice/ai-provider/browser'
import type {
  HwpBackupEntry,
  MobileAiSettingsSnapshot,
  MobileAppPrefs,
  MobileAppPrefsPatch,
  MobileChatGptStatus,
  MobileRestoreTarget,
  MobileTheme,
} from '@genoffice/mobile-bridge/transport'
import { useMobileLocale } from '../i18n'

const BYOK_PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openrouter', label: 'OpenRouter (BYOK)' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'xai', label: 'xAI' },
  { id: 'mistral', label: 'Mistral' },
] as const

export interface SettingsScreenProps {
  readonly prefs: MobileAppPrefs
  readonly aiSettings: MobileAiSettingsSnapshot
  readonly chatgptStatus: MobileChatGptStatus
  readonly backups: readonly HwpBackupEntry[]
  readonly onBack: () => void
  readonly onUpdatePrefs: (patch: MobileAppPrefsPatch) => void
  readonly onSelectProvider: (provider: string) => void
  readonly onValidateAndSaveKey: (params: {
    readonly provider: string
    readonly apiKey: string
    readonly freeOnly?: boolean
  }) => Promise<void>
  readonly onRemoveKey: (provider: string) => Promise<void>
  readonly onChatgptSignIn: (reconsent?: boolean) => Promise<void>
  readonly onChatgptSignOut: () => Promise<void>
  readonly onRestoreBackup: (backupId: string, target: MobileRestoreTarget) => Promise<void>
  readonly onDeleteBackup: (backupId: string) => Promise<void>
}

export function SettingsScreen({
  prefs,
  aiSettings,
  chatgptStatus,
  backups,
  onBack,
  onUpdatePrefs,
  onSelectProvider,
  onValidateAndSaveKey,
  onRemoveKey,
  onChatgptSignIn,
  onChatgptSignOut,
  onRestoreBackup,
  onDeleteBackup,
}: SettingsScreenProps) {
  const { t } = useMobileLocale()
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [busyProvider, setBusyProvider] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  const setDraft = (slot: string, value: string) => {
    setKeyDrafts((prev) => ({ ...prev, [slot]: value }))
  }

  const saveKey = async (slot: string, provider: string, freeOnly?: boolean) => {
    const apiKey = (keyDrafts[slot] ?? '').trim()
    if (!apiKey) return
    setBusyProvider(slot)
    setKeyError(null)
    try {
      await onValidateAndSaveKey({ provider, apiKey, freeOnly })
      setDraft(slot, '')
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyProvider(null)
    }
  }

  const openRouterConfigured = aiSettings.configuredProviders.openrouter
  const geminiConfigured = aiSettings.configuredProviders.gemini

  return (
    <main className="mobile-settings" data-testid="mobile-settings-screen">
      <header className="mobile-editor-header">
        <button type="button" className="mobile-touch-btn mobile-btn-ghost" onClick={onBack}>
          {t('back')}
        </button>
        <h1 className="mobile-header-title">{t('settingsTitle')}</h1>
        <span className="mobile-header-spacer" />
      </header>

      <section className="mobile-card">
        <label className="mobile-field">
          <span>{t('settingsLanguage')}</span>
          <select
            className="mobile-select"
            value={prefs.lang}
            onChange={(e) => onUpdatePrefs({ lang: e.target.value as Lang })}
            data-testid="settings-lang-select"
          >
            {LANGS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="mobile-field">
          <span>{t('settingsTheme')}</span>
          <select
            className="mobile-select"
            value={prefs.theme}
            onChange={(e) => onUpdatePrefs({ theme: e.target.value as MobileTheme })}
            data-testid="settings-theme-select"
          >
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
            <option value="system">{t('themeSystem')}</option>
          </select>
        </label>

        <label className="mobile-field">
          <span>{t('settingsHwpFormat')}</span>
          <select
            className="mobile-select"
            value={prefs.hwpDefaultFormat}
            onChange={(e) => onUpdatePrefs({ hwpDefaultFormat: e.target.value as 'hwp' | 'hwpx' })}
            data-testid="settings-hwp-format-select"
          >
            <option value="hwp">.hwp</option>
            <option value="hwpx">.hwpx</option>
          </select>
        </label>

        <label className="mobile-toggle-row">
          <span>{t('settingsAiEnabled')}</span>
          <input
            type="checkbox"
            checked={prefs.aiEnabled}
            onChange={(e) => onUpdatePrefs({ aiEnabled: e.target.checked })}
            data-testid="settings-ai-enabled-toggle"
          />
        </label>
      </section>

      {prefs.aiEnabled && (
        <section className="mobile-card" aria-label={t('settingsAiSection')}>
          <h2 className="mobile-section-title">{t('settingsAiSection')}</h2>
          {keyError && (
            <div className="mobile-inline-alert" role="alert">
              {keyError}
            </div>
          )}

          {aiSettings.chatgptVisible && (
            <div className="mobile-subcard" data-testid="settings-chatgpt-card">
              <div className="mobile-list-row">
                <strong>{t('settingsChatgptCard')}</strong>
                <span className="mobile-badge">{chatgptStatus.state}</span>
              </div>
              {chatgptStatus.state === 'ready' ? (
                <>
                  <p className="mobile-muted">
                    {chatgptStatus.account ? `${chatgptStatus.account} · ` : ''}
                    {t('settingsChatgptConnectedPlan')}
                  </p>
                  <div className="mobile-row-actions">
                    <a
                      href={SUBSCRIPTION_CHATGPT_USAGE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mobile-link-btn"
                      data-testid="chatgpt-manage-usage-link"
                    >
                      {t('aiManageUsage')}
                    </a>
                    <button
                      type="button"
                      className="mobile-touch-btn mobile-btn-secondary"
                      onClick={() => onSelectProvider('chatgpt')}
                    >
                      {t('settingsChatgptCard')}
                    </button>
                    <button
                      type="button"
                      className="mobile-touch-btn mobile-btn-ghost"
                      onClick={() => void onChatgptSignOut()}
                    >
                      {t('settingsChatgptDisconnect')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {chatgptStatus.loginFailure?.reason === 'no-plan' && (
                    <div className="mobile-inline-alert" role="alert">
                      <strong>{t('aiSharingDeclinedTitle')}</strong>
                      <p>{t('aiSharingDeclinedDesc')}</p>
                      <button
                        type="button"
                        className="mobile-touch-btn mobile-btn-primary"
                        onClick={() => void onChatgptSignIn(true)}
                      >
                        {t('aiEnableSharing')}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-primary"
                    onClick={() => void onChatgptSignIn(false)}
                  >
                    {t('settingsChatgptContinue')}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mobile-subcard" data-testid="settings-free-ai-section">
            <h3>{t('settingsFreeAiSection')}</h3>

            <div className="mobile-provider-row">
              <strong>{t('settingsOpenRouterFree')}</strong>
              {openRouterConfigured?.hasKey && openRouterConfigured.freeOnly ? (
                <div className="mobile-row-actions">
                  <span className="mobile-badge">{t('settingsKeyConnected')}</span>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-secondary"
                    onClick={() => onSelectProvider('openrouter')}
                  >
                    {t('aiSend')}
                  </button>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-ghost"
                    onClick={() => void onRemoveKey('openrouter')}
                  >
                    {t('settingsKeyRemove')}
                  </button>
                </div>
              ) : (
                <div className="mobile-row-actions">
                  <input
                    type="password"
                    className="mobile-input"
                    value={keyDrafts['openrouter-free'] ?? ''}
                    onChange={(e) => setDraft('openrouter-free', e.target.value)}
                    placeholder={t('settingsApiKeyPlaceholder')}
                    aria-label={t('settingsOpenRouterFree')}
                  />
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-primary"
                    disabled={busyProvider === 'openrouter-free'}
                    onClick={() => void saveKey('openrouter-free', 'openrouter', true)}
                  >
                    {t('settingsValidateAndSave')}
                  </button>
                </div>
              )}
            </div>

            <div className="mobile-provider-row">
              <strong>{t('settingsGeminiFree')}</strong>
              {geminiConfigured?.hasKey ? (
                <div className="mobile-row-actions">
                  <span className="mobile-badge">{t('settingsKeyConnected')}</span>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-secondary"
                    onClick={() => onSelectProvider('gemini')}
                  >
                    {t('aiSend')}
                  </button>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-ghost"
                    onClick={() => void onRemoveKey('gemini')}
                  >
                    {t('settingsKeyRemove')}
                  </button>
                </div>
              ) : (
                <div className="mobile-row-actions">
                  <input
                    type="password"
                    className="mobile-input"
                    value={keyDrafts['gemini-free'] ?? ''}
                    onChange={(e) => setDraft('gemini-free', e.target.value)}
                    placeholder={t('settingsApiKeyPlaceholder')}
                    aria-label={t('settingsGeminiFree')}
                  />
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-primary"
                    disabled={busyProvider === 'gemini-free'}
                    onClick={() => void saveKey('gemini-free', 'gemini')}
                  >
                    {t('settingsValidateAndSave')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mobile-subcard" data-testid="settings-byok-section">
            <h3>{t('settingsByokSection')}</h3>
            {BYOK_PROVIDERS.map(({ id, label }) => {
              const info = aiSettings.configuredProviders[id]
              const isConnected =
                id === 'openrouter'
                  ? Boolean(info?.hasKey && !info.freeOnly)
                  : Boolean(info?.hasKey)
              const slot = `byok-${id}`
              return (
                <div key={id} className="mobile-provider-row">
                  <strong>{label}</strong>
                  {isConnected ? (
                    <div className="mobile-row-actions">
                      <span className="mobile-badge">{t('settingsKeyConnected')}</span>
                      <button
                        type="button"
                        className="mobile-touch-btn mobile-btn-secondary"
                        onClick={() => onSelectProvider(id)}
                      >
                        {label}
                      </button>
                      <button
                        type="button"
                        className="mobile-touch-btn mobile-btn-ghost"
                        onClick={() => void onRemoveKey(id)}
                      >
                        {t('settingsKeyRemove')}
                      </button>
                    </div>
                  ) : (
                    <div className="mobile-row-actions">
                      <input
                        type="password"
                        className="mobile-input"
                        value={keyDrafts[slot] ?? ''}
                        onChange={(e) => setDraft(slot, e.target.value)}
                        placeholder={t('settingsApiKeyPlaceholder')}
                        aria-label={label}
                      />
                      <button
                        type="button"
                        className="mobile-touch-btn mobile-btn-primary"
                        disabled={busyProvider === slot}
                        onClick={() =>
                          void saveKey(slot, id, id === 'openrouter' ? false : undefined)
                        }
                      >
                        {t('settingsValidateAndSave')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="mobile-card" aria-label={t('settingsBackupsSection')}>
        <h2 className="mobile-section-title">{t('settingsBackupsSection')}</h2>
        {backups.length === 0 ? (
          <p className="mobile-muted">{t('settingsBackupsEmpty')}</p>
        ) : (
          <ul className="mobile-list" data-testid="settings-backup-list">
            {backups.map((item) => (
              <li key={item.backupId} className="mobile-list-item-col">
                <div className="mobile-list-row">
                  <span className="mobile-list-name">{item.originalName}</span>
                  <span className="mobile-badge">{item.format.toUpperCase()}</span>
                </div>
                <div className="mobile-row-actions">
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-secondary"
                    onClick={() => void onRestoreBackup(item.backupId, 'in-place')}
                  >
                    {t('backupRestoreInPlace')}
                  </button>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-secondary"
                    onClick={() => void onRestoreBackup(item.backupId, 'save-as')}
                  >
                    {t('backupRestoreSaveAs')}
                  </button>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-ghost"
                    onClick={() => void onDeleteBackup(item.backupId)}
                  >
                    {t('backupDelete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
