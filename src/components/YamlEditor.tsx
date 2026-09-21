'use client'

import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'
import { forwardRef } from 'react'

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '12.5px', height: '100%' },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-faint)',
      border: 'none',
      fontFamily: 'var(--font-mono)',
    },
    // foldGutter's placeholder ships a white chip; it has to follow the surface.
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--color-surface-2)',
      color: 'var(--color-muted)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'var(--color-code-active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-muted)' },
    '.cm-cursor': { borderLeftColor: 'var(--color-accent)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--color-code-selection)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
)

/**
 * The default dark highlight style renders YAML string values at roughly 2:1
 * against this surface, which is unreadable for the part of the document that is
 * actually being edited. Values get the brightest ink; keys and structure recede.
 */
const highlight = HighlightStyle.define([
  { tag: [t.string, t.content], color: 'var(--color-code-string)' },
  { tag: [t.propertyName, t.definition(t.propertyName), t.keyword], color: 'var(--color-code-key)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--color-code-literal)' },
  { tag: [t.comment, t.lineComment], color: 'var(--color-code-comment)', fontStyle: 'italic' },
  { tag: [t.punctuation, t.separator], color: 'var(--color-code-punctuation)' },
  { tag: t.invalid, color: 'var(--color-bad)' },
])

export const YamlEditor = forwardRef<ReactCodeMirrorRef, { value: string; onChange: (v: string) => void }>(
  function YamlEditor({ value, onChange }, ref) {
    return (
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        // Default is theme="light", which paints .cm-editor white over the theme below.
        theme="none"
        // Prec.highest: basicSetup ships defaultHighlightStyle, which otherwise wins.
        extensions={[yaml(), theme, Prec.highest(syntaxHighlighting(highlight)), EditorView.lineWrapping]}
        basicSetup={{ foldGutter: true, highlightActiveLine: true, autocompletion: false }}
        height="100%"
        className="h-full"
      />
    )
  },
)
