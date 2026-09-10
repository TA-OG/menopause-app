'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { useCallback, useEffect, useState } from 'react'
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered,
  Quote, Link2, Undo2, Redo2, Unlink,
} from 'lucide-react'

/**
 * The writing surface for a Learn article.
 *
 * Pamela is a menopause specialist, not an editor — she should not have to
 * know that `##` makes a heading. So this is a normal formatting toolbar, and
 * Markdown is what it saves underneath, because Markdown is what the reader
 * app already renders (`react-markdown` in /learn/[slug]).
 *
 * Two deliberate constraints, both about what a reader can be shown:
 *
 *   • `html: false` on the Markdown extension. Raw HTML is neither kept on
 *     paste nor produced on save. The reader renders with react-markdown and
 *     no `rehype-raw`, so HTML would be shown as literal text anyway — and
 *     keeping it out of the stored body means a pasted <script> or styled
 *     block can never become one.
 *   • Links are restricted to http, https and mailto. `javascript:` and
 *     `data:` URLs cannot be created here.
 */

interface RichTextEditorProps {
  /** Markdown to start from. Read once, on mount. */
  initialMarkdown: string
  /** Called with the full Markdown body on every change. */
  onChange: (_markdown: string) => void
  disabled?: boolean
}

/** Protocols a link in an article may use. */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (ALLOWED_PROTOCOLS as readonly string[]).includes(url.protocol)
  } catch {
    return false
  }
}

/**
 * Read the Markdown body out of the editor.
 *
 * `editor.storage` is an open record, so the Markdown extension's slice is
 * narrowed here rather than reached for with `any` at each call site.
 */
function markdownOf(editor: Editor): string {
  const storage = editor.storage as { markdown?: MarkdownStorage }
  return storage.markdown?.getMarkdown() ?? ''
}

export default function RichTextEditor({
  initialMarkdown,
  onChange,
  disabled = false,
}: RichTextEditorProps) {
  const [linkBarOpen, setLinkBarOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  const editor = useEditor({
    // Next.js renders this on the server first; rendering the editor
    // immediately would mismatch hydration.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,       // clicking a link in the editor edits it
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer' },
        },
        // No code blocks: an article is prose, and a stray fenced block in
        // health copy reads as a formatting accident.
        codeBlock: false,
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
        linkify: true,
        breaks: false,
      }),
    ],
    content: initialMarkdown,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[24rem] focus:outline-none ' +
          'prose-headings:text-brand-900 prose-a:text-brand-600 px-4 py-3',
      },
    },
    onUpdate: ({ editor: current }) => onChange(markdownOf(current)),
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  const openLinkBar = useCallback(() => {
    if (!editor) return
    setLinkValue(editor.getAttributes('link').href ?? 'https://')
    setLinkError(null)
    setLinkBarOpen(true)
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor) return
    const value = linkValue.trim()

    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setLinkBarOpen(false)
      return
    }

    if (!isSafeUrl(value)) {
      setLinkError('Links must start with https://, http:// or mailto:')
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
    setLinkBarOpen(false)
  }, [editor, linkValue])

  if (!editor) {
    return (
      <div className="border border-gray-200 rounded-xl bg-white">
        <div className="h-11 border-b border-gray-100 bg-gray-50 rounded-t-xl" />
        <div className="min-h-[24rem] px-4 py-3 text-sm text-gray-400">
          Loading the editor…
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/*
          Headings start at level 2: the article's own title is the h1 on the
          reader page, so an h1 inside the body would give the page two.
        */}
        <ToolbarButton
          label="Section heading"
          active={editor.isActive('heading', { level: 2 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Sub-heading"
          active={editor.isActive('heading', { level: 3 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Quote"
          active={editor.isActive('blockquote')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          label="Add link"
          active={editor.isActive('link')}
          disabled={disabled}
          onClick={openLinkBar}
        >
          <Link2 className="w-4 h-4" />
        </ToolbarButton>

        {editor.isActive('link') && (
          <ToolbarButton
            label="Remove link"
            disabled={disabled}
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          >
            <Unlink className="w-4 h-4" />
          </ToolbarButton>
        )}

        <div className="flex-1" />

        <ToolbarButton
          label="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {linkBarOpen && (
        <div className="border-b border-gray-100 bg-brand-50/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <label htmlFor="article-link-url" className="text-xs text-gray-600 whitespace-nowrap">
              Link to
            </label>
            <input
              id="article-link-url"
              type="url"
              value={linkValue}
              autoFocus
              onChange={(e) => { setLinkValue(e.target.value); setLinkError(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                if (e.key === 'Escape') setLinkBarOpen(false)
              }}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1"
              placeholder="https://www.nhs.uk/…"
            />
            <button
              type="button"
              onClick={applyLink}
              className="text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setLinkBarOpen(false)}
              className="text-xs text-gray-500 px-2 py-1.5 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {linkError && <p className="text-xs text-red-600 mt-1">{linkError}</p>}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden="true" />
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'p-1.5 rounded-lg transition-colors',
        active ? 'bg-brand-900 text-white' : 'text-gray-600 hover:bg-gray-200',
        disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
