import { describe, expect, it } from 'vitest'
import {
  PRACTICAL_HTML_TEMPLATES,
  findPracticalHtmlTemplate,
} from '../src/renderer/templates/practical-templates'

describe('practical HTML templates', () => {
  it('ships 5 offline 1-page templates with @page rules and zero external URLs', () => {
    expect(PRACTICAL_HTML_TEMPLATES.map((t) => t.id)).toEqual([
      'meeting-minutes',
      'project-prd',
      'performance-summary',
      'team-okr',
      'quote-invoice',
    ])
    for (const tpl of PRACTICAL_HTML_TEMPLATES) {
      expect(tpl.html).toContain('<!DOCTYPE html>')
      expect(tpl.html).toContain('@page')
      expect(tpl.html).not.toMatch(/https?:\/\//i)
      expect(tpl.html).not.toMatch(/cdn\./i)
      expect(findPracticalHtmlTemplate(tpl.id)?.id).toBe(tpl.id)
    }
  })
})
