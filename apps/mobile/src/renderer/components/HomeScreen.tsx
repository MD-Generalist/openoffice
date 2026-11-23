import type { RecentDocEntry, RecoveryEntry } from '@genoffice/mobile-bridge/transport'
import { useMobileLocale } from '../i18n'

export interface HomeScreenProps {
  readonly recentDocs: readonly RecentDocEntry[]
  readonly recoveryEntries: readonly RecoveryEntry[]
  readonly permissionDeniedRecentId: string | null
  readonly defaultHwpFormat: 'hwp' | 'hwpx'
  readonly onCreateNew: (format: 'hwp' | 'hwpx' | 'md') => void
  readonly onOpenFile: () => void
  readonly onOpenRecent: (entry: RecentDocEntry) => void
  readonly onRemoveRecent: (id: string) => void
  readonly onRestoreRecovery: (entry: RecoveryEntry) => void
  readonly onDiscardRecovery: (docKey: string) => void
  readonly onOpenSettings: () => void
}

export function HomeScreen({
  recentDocs,
  recoveryEntries,
  permissionDeniedRecentId,
  defaultHwpFormat,
  onCreateNew,
  onOpenFile,
  onOpenRecent,
  onRemoveRecent,
  onRestoreRecovery,
  onDiscardRecovery,
  onOpenSettings,
}: HomeScreenProps) {
  const { t } = useMobileLocale()

  return (
    <main className="mobile-home" data-testid="mobile-home-screen">
      <header className="mobile-home-header">
        <h1 className="mobile-home-title">{t('appTitle')}</h1>
        <button
          type="button"
          className="mobile-touch-btn mobile-btn-ghost"
          onClick={onOpenSettings}
          data-testid="home-settings-btn"
        >
          {t('settings')}
        </button>
      </header>

      {recoveryEntries.length > 0 && (
        <section
          className="mobile-card mobile-recovery-banner"
          aria-label={t('recoveryBannerTitle')}
          data-testid="home-recovery-banner"
        >
          <h2 className="mobile-section-title">{t('recoveryBannerTitle')}</h2>
          <ul className="mobile-list">
            {recoveryEntries.map((entry) => (
              <li key={entry.docKey} className="mobile-list-row">
                <div className="mobile-list-meta">
                  <span className="mobile-list-name">{entry.title}</span>
                  <span className="mobile-badge">{entry.format.toUpperCase()}</span>
                </div>
                <div className="mobile-row-actions">
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-primary"
                    onClick={() => onRestoreRecovery(entry)}
                  >
                    {t('recoveryRestore')}
                  </button>
                  <button
                    type="button"
                    className="mobile-touch-btn mobile-btn-ghost"
                    onClick={() => onDiscardRecovery(entry.docKey)}
                  >
                    {t('recoveryDiscard')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mobile-home-actions" aria-label={t('newDoc')}>
        <button
          type="button"
          className="mobile-touch-btn mobile-btn-primary"
          onClick={() => onCreateNew(defaultHwpFormat)}
          data-testid="home-new-hwp-btn"
        >
          {defaultHwpFormat === 'hwpx' ? t('newHwpx') : t('newHwp')}
        </button>
        <button
          type="button"
          className="mobile-touch-btn mobile-btn-secondary"
          onClick={() => onCreateNew('md')}
          data-testid="home-new-md-btn"
        >
          {t('newMarkdown')}
        </button>
        <button
          type="button"
          className="mobile-touch-btn mobile-btn-secondary"
          onClick={onOpenFile}
          data-testid="home-open-file-btn"
        >
          {t('openFile')}
        </button>
      </section>

      <section className="mobile-card" aria-label={t('recentDocs')}>
        <h2 className="mobile-section-title">{t('recentDocs')}</h2>
        {recentDocs.length === 0 ? (
          <p className="mobile-muted">{t('recentEmpty')}</p>
        ) : (
          <ul className="mobile-list" data-testid="home-recent-list">
            {recentDocs.map((entry) => {
              const expired = permissionDeniedRecentId === entry.id
              return (
                <li key={entry.id} className="mobile-list-item-col">
                  <button
                    type="button"
                    className="mobile-list-row mobile-touch-btn mobile-btn-list"
                    onClick={() => onOpenRecent(entry)}
                  >
                    <span className="mobile-list-name">{entry.name}</span>
                    <span className="mobile-badge">{entry.format.toUpperCase()}</span>
                  </button>
                  {expired && (
                    <div
                      className="mobile-inline-alert"
                      role="alert"
                      data-testid={`recent-expired-${entry.id}`}
                    >
                      <p>{t('recentPermissionExpired')}</p>
                      <div className="mobile-row-actions">
                        <button
                          type="button"
                          className="mobile-touch-btn mobile-btn-secondary"
                          onClick={onOpenFile}
                        >
                          {t('repickFile')}
                        </button>
                        <button
                          type="button"
                          className="mobile-touch-btn mobile-btn-ghost"
                          onClick={() => onRemoveRecent(entry.id)}
                        >
                          {t('removeFromRecent')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
