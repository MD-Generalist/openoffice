import type { ReactElement } from 'react'
import type { Lang } from '@genoffice/i18n'
import { printLayoutText, type PrintLayoutStringKey } from '../strings-print-layout'
import { DEFAULT_PRINTER, SYSTEM_DIALOG, type PrintJobState } from './hooks'
import type { PrintLayoutDuplex } from './model'
import './print-layout.css'

const DUPLEX_MODES: readonly PrintLayoutDuplex[] = ['simplex', 'longEdge', 'shortEdge']

export interface PrintJobFieldsProps {
  lang: Lang
  state: PrintJobState
  disabled?: boolean | undefined
}

/**
 * Shared in-app printer, copies, collate and double-sided printing fields
 * (modeled on the Word editor's print dialog).
 */
export function PrintJobFields(props: PrintJobFieldsProps): ReactElement {
  const { lang, state, disabled = false } = props
  const t = (key: PrintLayoutStringKey) => printLayoutText(lang, key)
  const fieldsDisabled = disabled || state.systemDialog

  return (
    <fieldset className="gs-pl-printer">
      <legend className="gs-pl-legend">{t('printer')}</legend>
      <select
        className="gs-pl-select"
        data-print="printer"
        aria-label={t('printer')}
        value={state.deviceName}
        disabled={disabled}
        onChange={(e) => state.setDeviceName(e.target.value)}
      >
        <option value={DEFAULT_PRINTER}>{t('defaultPrinter')}</option>
        {state.printers.map((pr) => (
          <option key={pr.name} value={pr.name}>
            {pr.displayName}
          </option>
        ))}
        <option value={SYSTEM_DIALOG}>{t('systemDialog')}</option>
      </select>
      <div className="gs-pl-printer-row">
        <label className="gs-pl-field">
          <span className="gs-pl-field-label">{t('copies')}</span>
          <input
            type="number"
            className="gs-pl-number"
            data-print="copies"
            min={1}
            max={999}
            value={state.copies}
            disabled={fieldsDisabled}
            onChange={(e) => state.setCopies(Number(e.target.value))}
          />
        </label>
        <label className="gs-pl-check">
          <input
            type="checkbox"
            data-print="collate"
            checked={state.collate}
            disabled={fieldsDisabled || state.copies < 2 || state.collateLocked}
            onChange={(e) => state.setCollate(e.target.checked)}
          />
          <span>{t('collate')}</span>
        </label>
      </div>
      <label className="gs-pl-field gs-pl-printer-duplex">
        <span className="gs-pl-field-label">{t('duplex')}</span>
        <select
          className="gs-pl-select"
          data-print="duplex"
          value={state.duplex}
          disabled={fieldsDisabled}
          onChange={(e) => state.setDuplex(e.target.value as PrintLayoutDuplex)}
        >
          {DUPLEX_MODES.map((m) => (
            <option key={m} value={m}>
              {t(m === 'simplex' ? 'duplexOff' : m === 'longEdge' ? 'duplexLong' : 'duplexShort')}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}
