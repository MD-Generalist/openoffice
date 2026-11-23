import { useState, type ReactNode } from 'react'
import type { DocumentMode } from '@genoffice/mobile-bridge/view-edit-gate'
import type { MobileDocFormat } from '@genoffice/mobile-bridge/transport'
import { useMobileLocale } from '../i18n'
import { BottomSheet } from '../components/BottomSheet'
import { useViewportLayout } from './useViewportLayout'

export interface EditorQuickActionItem {
  readonly id: string
  readonly label: string
  readonly onPress: () => void
}

export interface EditorShellProps {
  readonly docTitle: string
  readonly docFormat: MobileDocFormat
  readonly dirty: boolean
  readonly mode: DocumentMode
  readonly canEdit: boolean
  readonly aiEnabled: boolean
  readonly noticeBanner?: string | null
  readonly quickActions: readonly EditorQuickActionItem[]
  readonly aiPanelContent: ReactNode
  readonly onBack: () => void
  readonly onToggleMode: () => void
  readonly onSave: () => void
  readonly onSaveAs: () => void
  readonly onShare: () => void
  readonly onFitToWidth: () => void
  readonly onOpenBackups: () => void
  readonly children: ReactNode
}

export function EditorShell({
  docTitle,
  docFormat,
  dirty,
  mode,
  canEdit,
  aiEnabled,
  noticeBanner,
  quickActions,
  aiPanelContent,
  onBack,
  onToggleMode,
  onSave,
  onSaveAs,
  onShare,
  onFitToWidth,
  onOpenBackups,
  children,
}: EditorShellProps) {
  const { t } = useMobileLocale()
  const { isTablet, keyboardInsetPx } = useViewportLayout()
  const [aiOpen, setAiOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div
      className={isTablet ? 'mobile-shell mobile-shell-tablet' : 'mobile-shell mobile-shell-phone'}
      data-layout={isTablet ? 'tablet' : 'phone'}
      data-mode={mode}
    >
      <header className="mobile-editor-header" data-testid="editor-header">
        <button
          type="button"
          className="mobile-touch-btn mobile-btn-ghost"
          onClick={onBack}
          data-testid="editor-back-btn"
        >
          {t('back')}
        </button>

        <div className="mobile-header-title-wrap">
          <span className="mobile-header-title">{docTitle}</span>
          {dirty && <span className="mobile-dirty-dot" aria-label="unsaved" />}
        </div>

        <div className="mobile-header-actions">
          {canEdit && (
            <button
              type="button"
              className="mobile-touch-btn mobile-btn-secondary"
              onClick={onToggleMode}
              data-testid="editor-mode-toggle"
            >
              {mode === 'view' ? t('switchToEdit') : t('switchToView')}
            </button>
          )}
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-primary"
            onClick={onSave}
            data-testid="editor-save-btn"
          >
            {t('save')}
          </button>
          {isTablet && aiEnabled && (
            <button
              type="button"
              className="mobile-touch-btn mobile-btn-secondary"
              onClick={() => setAiOpen((prev) => !prev)}
              data-testid="tablet-ai-toggle"
            >
              {t('aiTitle')}
            </button>
          )}
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-ghost"
            onClick={() => setMoreOpen(true)}
            data-testid="editor-more-btn"
          >
            {t('more')}
          </button>
        </div>
      </header>

      {isTablet && mode === 'edit' && quickActions.length > 0 && (
        <div className="mobile-tablet-toolbar" role="toolbar" data-testid="tablet-toolbar">
          {quickActions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mobile-touch-btn mobile-btn-ghost"
              onClick={item.onPress}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {noticeBanner && (
        <div className="mobile-inline-info" role="status" data-testid="editor-notice-banner">
          {noticeBanner}
        </div>
      )}

      <div className="mobile-workspace-row">
        <section className="mobile-editor-stage">{children}</section>

        {isTablet && aiEnabled && aiOpen && (
          <aside className="mobile-tablet-ai-dock" data-testid="tablet-ai-dock">
            <header className="mobile-sheet-header">
              <h2 className="mobile-sheet-title">{t('aiTitle')}</h2>
              <button
                type="button"
                className="mobile-touch-btn mobile-btn-ghost"
                onClick={() => setAiOpen(false)}
              >
                {t('cancel')}
              </button>
            </header>
            {aiPanelContent}
          </aside>
        )}
      </div>

      {!isTablet && mode === 'edit' && (
        <nav
          className="mobile-quick-toolbar"
          style={{ bottom: `${keyboardInsetPx}px` }}
          aria-label="Quick formatting"
          data-testid="phone-quick-toolbar"
        >
          {quickActions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mobile-touch-btn mobile-btn-ghost"
              onClick={item.onPress}
            >
              {item.label}
            </button>
          ))}
          {aiEnabled && (
            <button
              type="button"
              className="mobile-touch-btn mobile-btn-primary"
              onClick={() => setAiOpen(true)}
              data-testid="phone-ai-open-btn"
            >
              {t('aiTitle')}
            </button>
          )}
        </nav>
      )}

      {!isTablet && mode === 'view' && aiEnabled && (
        <div className="mobile-view-fab-bar">
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-primary"
            onClick={() => setAiOpen(true)}
            data-testid="phone-view-ai-btn"
          >
            {t('aiTitle')}
          </button>
        </div>
      )}

      {!isTablet && aiEnabled && (
        <BottomSheet
          open={aiOpen}
          title={t('aiTitle')}
          closeLabel={t('cancel')}
          onClose={() => setAiOpen(false)}
        >
          {aiPanelContent}
        </BottomSheet>
      )}

      <BottomSheet
        open={moreOpen}
        title={t('more')}
        closeLabel={t('cancel')}
        onClose={() => setMoreOpen(false)}
      >
        <div className="mobile-menu-stack">
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-secondary"
            onClick={() => {
              setMoreOpen(false)
              onSaveAs()
            }}
          >
            {t('saveAs')}
          </button>
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-secondary"
            onClick={() => {
              setMoreOpen(false)
              onShare()
            }}
          >
            {t('share')}
          </button>
          <button
            type="button"
            className="mobile-touch-btn mobile-btn-secondary"
            onClick={() => {
              setMoreOpen(false)
              onFitToWidth()
            }}
          >
            {t('fitToWidth')}
          </button>
          {(docFormat === 'hwp' || docFormat === 'hwpx') && (
            <button
              type="button"
              className="mobile-touch-btn mobile-btn-secondary"
              onClick={() => {
                setMoreOpen(false)
                onOpenBackups()
              }}
            >
              {t('settingsBackupsSection')}
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
