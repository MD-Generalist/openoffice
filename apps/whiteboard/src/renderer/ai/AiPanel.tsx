/**
 * Whiteboard AI panel wired to `@genoffice/ui` shared send-gate, model picker,
 * changes card, and `AgentLoop`. Automatically attaches a theme-invariant light
 * PNG snapshot of the current page alongside `<whiteboard_page>` text when the
 * active model supports vision, and falls back silently to text-only otherwise.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  AgentLoop,
  composeSkills,
  type AgentImage,
  type IpcStreamError,
} from '@genoffice/agent-core'
import type { AiSettings, AiSubscriptionUsage } from '@genoffice/ai-provider/browser'
import {
  AiBlockedNotice,
  AiChangesCard,
  type AiChangesState,
  AiConnectPrompt,
  AiEmptyHints,
  AiFirstConnectionNotice,
  AiInputTruncatedNotice,
  AiModelPicker,
  type AiModelPickerBridge,
  AiPanelHeader,
  AiPanelSideButton,
  AiSubscriptionUsageLine,
  AiWorkSteps,
  type AiWorkStep,
  IconArrowUp,
  IconStop,
  Markdown,
  useAiSendGate,
  useSubscriptionUsageUpdates,
} from '@genoffice/ui'
import type { WhiteboardAiHost } from '../../shared/ai-host'
import type { AttachmentMeta, WhiteboardHandoff } from '../../shared/ipc'
import { useI18n } from '../i18n/locale'
import { blockedRunFor, mergeSubscriptionUsage, type BlockedRun } from './connection'
import { createFilesSkill } from './files-skill'
import { aiLangDirective } from './lang-directive'
import { createSearchSkill } from './search-skill'
import { useSubscriptionConnection } from './subscription-client'
import { createElectronTransport } from './transport'
import { modelSupportsVision } from './vision-capability'
import { createWhiteboardSkill, whiteboardContext } from './whiteboard-skill'

interface TurnChanges {
  batchCount: number
  changedIds: string[]
  state: AiChangesState
}

interface TrackedWorkStep extends AiWorkStep {
  readonly callId: string
}

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  steps?: TrackedWorkStep[]
  error?: string
  changes?: TurnChanges
}

export interface WhiteboardAiPanelProps {
  host: WhiteboardAiHost
  filePath: string | null
  handoff?: WhiteboardHandoff | null
  onCollapse(): void
  onHandoffConsumed?(): void
}

const STARTERS = [
  ['aiStarterBrainstorm', 'aiStarterBrainstormPrompt'],
  ['aiStarterKanban', 'aiStarterKanbanPrompt'],
  ['aiStarterOrganize', 'aiStarterOrganizePrompt'],
  ['aiStarterSummarize', 'aiStarterSummarizePrompt'],
] as const

const MODEL_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.whiteboardApi.ai.getSettings() as Promise<AiSettings>,
  setSettings: (settings) => window.whiteboardApi.ai.setSettings(settings),
  onSettingsChanged: (handler) => window.whiteboardApi.ai.onSettingsChanged(handler),
  openModelSettings: () => window.whiteboardApi.ai.openModelSettings(),
}

export function AiPanel({
  host,
  handoff,
  onCollapse,
  onHandoffConsumed,
}: WhiteboardAiPanelProps): ReactElement {
  const { lang, t } = useI18n()
  const sub = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [blockedRun, setBlockedRun] = useState<BlockedRun | null>(null)
  const [inputTruncated, setInputTruncated] = useState(false)
  const [usage, setUsage] = useState<AiSubscriptionUsage[]>([])
  const [activeHighlights, setActiveHighlights] = useState<string[]>([])
  const [undoNotice, setUndoNotice] = useState<string | null>(null)

  const settingsRef = useRef<AiSettings | null>(null)
  settingsRef.current = settings
  const attachmentsRef = useRef<AttachmentMeta[]>([])
  attachmentsRef.current = attachments
  const contextRef = useRef('')
  const lastStreamErrorRef = useRef<IpcStreamError | null>(null)
  const loopRef = useRef<AgentLoop | null>(null)
  const activeAsstIdRef = useRef<string | null>(null)
  const turnBatchesRef = useRef(0)
  const turnChangedIdsRef = useRef<string[]>([])
  const lastSentRef = useRef<{ text: string; attachments: AttachmentMeta[] } | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang

  const refreshSettings = useCallback(() => {
    void window.whiteboardApi.ai
      .getSettings()
      .then((s: unknown) => setSettings(s as AiSettings))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshSettings()
    return window.whiteboardApi.ai.onSettingsChanged(refreshSettings)
  }, [refreshSettings])

  useSubscriptionUsageUpdates(
    () => window.whiteboardApi?.subscription,
    setUsage,
    mergeSubscriptionUsage,
  )

  const finalizeRun = useCallback(() => {
    const asstId = activeAsstIdRef.current
    const batches = turnBatchesRef.current
    const changedIds = [...new Set(turnChangedIdsRef.current)]
    if (asstId && batches > 0) {
      host.setHighlights(changedIds)
      setActiveHighlights(changedIds)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? {
                ...m,
                changes: {
                  batchCount: batches,
                  changedIds,
                  state: 'applied',
                },
              }
            : m,
        ),
      )
    }
    setBusy(false)
  }, [host])

  const runTurn = useCallback(
    async (text: string, sendAttachments: AttachmentMeta[]) => {
      const currentSettings = settingsRef.current
      if (!currentSettings) return
      setBusy(true)
      setBlockedRun(null)
      setInputTruncated(false)
      setUndoNotice(null)
      lastStreamErrorRef.current = null
      turnBatchesRef.current = 0
      turnChangedIdsRef.current = []
      lastSentRef.current = { text, attachments: sendAttachments }

      const userId = `u-${Date.now()}`
      const asstId = `a-${Date.now()}`
      activeAsstIdRef.current = asstId
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text },
        { id: asstId, role: 'assistant', text: '', steps: [] },
      ])

      const pageTable = await host.readPage()
      contextRef.current = whiteboardContext(pageTable)

      const images: AgentImage[] = []
      if (modelSupportsVision(currentSettings)) {
        const png = await host.captureCurrentPagePng(1600)
        if (png) {
          images.push({ base64: png.base64, mime: png.mime })
        }
      }
      for (const att of sendAttachments) {
        if (!att.isImage) continue
        const img = await window.whiteboardApi.ai.readAttachmentImage(att.path)
        if (img.ok && img.base64 && img.mime) {
          images.push({ base64: img.base64, mime: img.mime })
        }
      }

      if (!loopRef.current) {
        const transport = createElectronTransport(
          () => settingsRef.current!,
          {
            getLang: () => langRef.current,
            onStreamError: (err) => {
              lastStreamErrorRef.current = err
            },
            onSubscriptionUsage: (reported) => {
              setUsage((prev) => mergeSubscriptionUsage(prev, reported))
            },
            onInputTruncated: () => setInputTruncated(true),
          },
        )
        const wbSkill = createWhiteboardSkill({
          host: () => host,
          context: () => contextRef.current,
          onApplied: (ids) => {
            turnBatchesRef.current += 1
            turnChangedIdsRef.current.push(...ids)
          },
        })
        const composed = composeSkills('whiteboard-suite', '', [
          wbSkill,
          createFilesSkill(() => attachmentsRef.current),
          createSearchSkill(),
        ])
        loopRef.current = new AgentLoop({
          transport,
          skill: composed,
          systemSuffix: () => aiLangDirective(langRef.current),
          events: {
            onText: (fullText) => {
              const targetId = activeAsstIdRef.current
              if (!targetId) return
              setMessages((prev) =>
                prev.map((m) => (m.id === targetId ? { ...m, text: fullText } : m)),
              )
            },
            onToolStart: (call) => {
              const targetId = activeAsstIdRef.current
              if (!targetId) return
              const step: TrackedWorkStep = {
                callId: call.id,
                name: call.name,
                summary: call.name,
                running: true,
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetId ? { ...m, steps: [...(m.steps ?? []), step] } : m,
                ),
              )
            },
            onToolExecuted: ({ call, execution }) => {
              const targetId = activeAsstIdRef.current
              if (!targetId) return
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetId
                    ? {
                        ...m,
                        steps: (m.steps ?? []).map((s) =>
                          s.callId === call.id
                            ? {
                                ...s,
                                summary: execution.summary || s.summary,
                                running: false,
                                isError: execution.isError,
                                output: execution.output.slice(0, 1200),
                              }
                            : s,
                        ),
                      }
                    : m,
                ),
              )
            },
            onError: (msg) => {
              const targetId = activeAsstIdRef.current
              const blocked = blockedRunFor(msg, lastStreamErrorRef.current)
              if (blocked) {
                setBlockedRun(blocked)
              } else if (targetId) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === targetId ? { ...m, error: msg } : m)),
                )
              }
              finalizeRun()
            },
            onDone: () => {
              finalizeRun()
            },
          },
        })
      }

      loopRef.current.run(text, images.length > 0 ? images : undefined)
    },
    [finalizeRun, host],
  )

  const gate = useAiSendGate<{ text: string; attachments: AttachmentMeta[] }>({
    settings,
    statuses: sub.statuses,
    store: {
      getSettings: MODEL_BRIDGE.getSettings,
      setSettings: MODEL_BRIDGE.setSettings,
    },
    start: (req) => {
      void runTurn(req.text, req.attachments)
    },
    onNotConnected: () => sub.refresh(),
    onSettingsSaved: (next) => setSettings(next),
  })

  const sendMessage = useCallback(
    (overrideText?: string, overrideAttachments?: AttachmentMeta[]) => {
      const text = (overrideText ?? input).trim()
      const atts = overrideAttachments ?? attachments
      if (!text || busy) return
      if (!gate.admit({ text, attachments: atts })) return
      setInput('')
      void runTurn(text, atts)
    },
    [input, attachments, busy, gate, runTurn],
  )

  const consumedHandoffId = useRef<string | null>(null)
  useEffect(() => {
    if (!handoff || consumedHandoffId.current === handoff.id) return
    consumedHandoffId.current = handoff.id
    void (async () => {
      let added: AttachmentMeta[] = []
      if (handoff.sourcePaths.length > 0) {
        const res = await window.whiteboardApi.ai.addAttachmentPaths(handoff.sourcePaths)
        added = res.added
        setAttachments((prev) => [...prev, ...added])
      }
      window.whiteboardApi.handoff.reportRunStarted({
        id: handoff.id,
        attachedPaths: added.map((a) => a.path),
      })
      onHandoffConsumed?.()
      if (handoff.prompt.trim()) {
        setInput(handoff.prompt)
        sendMessage(handoff.prompt, added)
      }
    })()
  }, [handoff, onHandoffConsumed, sendMessage])

  const handleNewChat = useCallback(() => {
    loopRef.current?.cancel()
    loopRef.current = null
    setMessages([])
    setBlockedRun(null)
    setInputTruncated(false)
    setUndoNotice(null)
    host.setHighlights([])
    setActiveHighlights([])
    gate.reset()
  }, [gate, host])

  const handleRevertTurn = useCallback(
    async (msgId: string, changes: TurnChanges) => {
      const ok = await host.undoBatches(changes.batchCount)
      if (!ok) {
        setUndoNotice(t('aiUndoBlockedAfterEdit'))
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.changes ? { ...m, changes: { ...m.changes, state: 'refused' } } : m,
          ),
        )
        return
      }
      setActiveHighlights([])
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.changes ? { ...m, changes: { ...m.changes, state: 'reverted' } } : m,
        ),
      )
    },
    [host, t],
  )

  const handleClearMarks = useCallback(() => {
    host.setHighlights([])
    setActiveHighlights([])
  }, [host])

  const handleAddAttachments = useCallback(async () => {
    const res = await window.whiteboardApi.ai.addAttachments()
    if (res.added.length > 0) {
      setAttachments((prev) => [...prev, ...res.added])
    }
  }, [])

  const headerActions = useMemo(
    () => (
      <>
        <AiPanelSideButton
          lang={lang}
          onMove={async (side) => {
            await window.whiteboardApi.ai.setPanelPrefs({ side })
            return window.whiteboardApi.ai.getPanelPrefs()
          }}
        />
        <button
          type="button"
          className="wb-btn"
          title={t('aiNewChat')}
          onClick={handleNewChat}
          disabled={busy}
        >
          +
        </button>
        <button
          type="button"
          className="wb-btn"
          title={t('aiCollapsePanel')}
          onClick={onCollapse}
        >
          ×
        </button>
      </>
    ),
    [busy, handleNewChat, lang, onCollapse, t],
  )

  return (
    <aside className="copilot" aria-label="AI Assistant">
      <AiPanelHeader lang={lang} actions={headerActions} />

      <div className="wbai-messages">
        {gate.connectChoice && (
          <AiConnectPrompt
            lang={lang}
            choice={gate.connectChoice}
            statuses={sub.statuses}
            onInstall={sub.install}
            onLogin={sub.login}
            onRecheck={sub.recheck}
            onAcceptMetered={sub.acceptMetered}
            onOpenInstallHelp={sub.openInstallHelp}
            onUpdate={sub.update}
            onCancelLogin={sub.cancelLogin}
            attention={gate.connectAttention}
            onOpenSettings={() => void window.whiteboardApi.ai.openModelSettings()}
          />
        )}
        {gate.noticeDue && (
          <AiFirstConnectionNotice lang={lang} onAcknowledge={gate.acknowledgeNotice} />
        )}
        {blockedRun && (
          <AiBlockedNotice
            lang={lang}
            kind={blockedRun.kind}
            provider={blockedRun.provider}
            resetsAt={blockedRun.resetsAt}
            message={blockedRun.message}
            settings={settings ?? {}}
            statuses={sub.statuses}
            onContinueWith={(provider) => {
              const last = lastSentRef.current
              gate.continueWith(provider, () => {
                if (last) void runTurn(last.text, last.attachments)
              })
            }}
          />
        )}
        {inputTruncated && <AiInputTruncatedNotice lang={lang} />}
        {undoNotice && <div className="wbai-error">{undoNotice}</div>}

        {messages.length === 0 ? (
          <div>
            <h4>{t('aiEmptyTitle')}</h4>
            <p>{t('aiEmptyBody')}</p>
            <div className="wbai-starters">
              {STARTERS.map(([labelKey, promptKey]) => (
                <button
                  key={labelKey}
                  type="button"
                  className="wbai-starter"
                  onClick={() => setInput(t(promptKey))}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <AiEmptyHints lang={lang} />
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`wbai-msg wbai-msg-${m.role}`}>
              {m.role === 'user' ? (
                <div>{m.text}</div>
              ) : (
                <>
                  {m.steps && m.steps.length > 0 && <AiWorkSteps lang={lang} steps={m.steps} />}
                  {m.text && <Markdown text={m.text} />}
                  {m.error && <div className="wbai-error">{m.error}</div>}
                  {m.changes && (
                    <AiChangesCard
                      lang={lang}
                      state={m.changes.state}
                      count={m.changes.changedIds.length || m.changes.batchCount}
                      canRevert={!busy && m.changes.state === 'applied'}
                      onRevert={() => void handleRevertTurn(m.id, m.changes!)}
                      onClearMarks={activeHighlights.length > 0 ? handleClearMarks : null}
                    />
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {usage.length > 0 && <AiSubscriptionUsageLine lang={lang} usage={usage} />}

      <div className="wbai-composer-wrap">
        {attachments.length > 0 && (
          <div className="wbai-chips">
            {attachments.map((att) => (
              <span key={att.id} className="wbai-chip">
                {att.name}
                <button
                  type="button"
                  title={t('aiRemoveAttachmentTitle')}
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="wbai-composer-row">
          <textarea
            className="wbai-textarea"
            value={input}
            placeholder={t('aiComposerPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                sendMessage()
              }
            }}
          />
        </div>
        <div className="wbai-composer-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="wbai-icon-btn"
              title={t('aiAttachTitle')}
              onClick={() => void handleAddAttachments()}
            >
              +
            </button>
            <AiModelPicker
              bridge={MODEL_BRIDGE}
              lang={lang}
              subscriptionStatuses={sub.statuses}
              onRefreshSubscriptions={() => sub.refresh()}
            />
          </div>
          {busy ? (
            <button
              type="button"
              className="wbai-icon-btn"
              title={t('aiStop')}
              onClick={() => loopRef.current?.cancel()}
            >
              <IconStop size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="wbai-icon-btn primary"
              title={t('aiSend')}
              disabled={!input.trim()}
              onClick={() => sendMessage()}
            >
              <IconArrowUp size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
