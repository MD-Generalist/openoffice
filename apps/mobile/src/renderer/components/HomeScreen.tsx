import type { RecentDocEntry, RecoveryEntry } from '@genoffice/mobile-bridge/transport'
import { useMobileLocale } from '../i18n'
import {
  IconChevronRight,
  IconFileText,
  IconFolderOpen,
  IconMarkdown,
  IconSettings,
} from './MobileIcons'

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
    <div className="mobile-page" data-testid="mobile-home-screen">
      <header className="mobile-appbar">
        <div className="mobile-brand-wrap">
          <span className="mobile-brand-mark" aria-hidden="true">
            <IconFileText size={18} />
          </span>
          <h1 className="mobile-appbar-title">{t('appTitle')}</h1>
        </div>
        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onOpenSettings}
          aria-label={t('settings')}
          title={t('settings')}
          data-testid="home-settings-btn"
        >
          <IconSettings size={21} />
        </button>
      </header>

      <main className="mobile-page-body">
        {recoveryEntries.length > 0 && (
          <section
            className="mobile-card mobile-recovery-banner"
            aria-label={t('recoveryBannerTitle')}
            data-testid="home-recovery-banner"
          >
            <h2 className="mobile-section-title">{t('recoveryBannerTitle')}</h2>
            <ul className="mobile-list">
              {recoveryEntries.map((entry) => (
                <li key={entry.docKey} className="mobile-list-item-col">
                  <div className="mobile-list-row">
                    <div className="mobile-list-meta">
                      <span className="mobile-list-name">{entry.title}</span>
                      <span className="mobile-badge">{entry.format.toUpperCase()}</span>
                    </div>
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

        <section className="mobile-home-cta-group" aria-label={t('newDoc')}>
          <div className="mobile-home-create-grid">
            <button
              type="button"
              className="mobile-action-card mobile-action-card-primary"
              onClick={() => onCreateNew(defaultHwpFormat)}
              data-testid="home-new-hwp-btn"
            >
              <span className="mobile-action-card-icon">
                <IconFileText size={22} />
              </span>
              <span className="mobile-action-card-label">
                {defaultHwpFormat === 'hwpx' ? t('newHwpx') : t('newHwp')}
              </span>
              <span className="mobile-action-card-ext">.{defaultHwpFormat}</span>
            </button>

            <button
              type="button"
              className="mobile-action-card mobile-action-card-secondary"
              onClick={() => onCreateNew('md')}
              data-testid="home-new-md-btn"
            >
              <span className="mobile-action-card-icon">
                <IconMarkdown size={22} />
              </span>
              <span className="mobile-action-card-label">{t('newMarkdown')}</span>
              <span className="mobile-action-card-ext">.md</span>
            </button>
          </div>

          <button
            type="button"
            className="mobile-touch-btn mobile-btn-secondary mobile-open-file-btn"
            onClick={onOpenFile}
            data-testid="home-open-file-btn"
          >
            <IconFolderOpen size={19} />
            <span>{t('openFile')}</span>
          </button>
        </section>

        <section className="mobile-section" aria-label={t('recentDocs')}>
          <h2 className="mobile-section-heading">{t('recentDocs')}</h2>
          {recentDocs.length === 0 ? (
            <div className="mobile-empty-state">
              <span className="mobile-empty-icon" aria-hidden="true">
                <IconFileText size={28} />
              </span>
              <p className="mobile-muted">{t('recentEmpty')}</p>
            </div>
          ) : (
            <ul className="mobile-doc-list" data-testid="home-recent-list">
              {recentDocs.map((entry) => {
                const expired = permissionDeniedRecentId === entry.id
                const isHwp = entry.format === 'hwp' || entry.format === 'hwpx'
                return (
                  <li key={entry.id} className="mobile-doc-list-item">
                    <button
                      type="button"
                      className="mobile-doc-row-btn"
                      onClick={() => onOpenRecent(entry)}
                    >
                      <span className="mobile-doc-row-icon" aria-hidden="true">
                        {isHwp ? <IconFileText size={18} /> : <IconMarkdown size={18} />}
                      </span>
                      <span className="mobile-doc-row-main">
                        <span className="mobile-list-name">{entry.name}</span>
                        <span className="mobile-badge">{entry.format.toUpperCase()}</span>
                      </span>
                      <IconChevronRight size={17} className="mobile-chevron" />
                    </button>
                    {expired && (
                      <div
                        className="mobile-inline-alert"
                        role="alert"
                        data-testid={`recent-expired-${entry.id}`}
                      >
                        <p className="mobile-alert-text">{t('recentPermissionExpired')}</p>
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
    </div>
  )
}
