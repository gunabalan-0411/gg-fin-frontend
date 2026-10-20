import { useRef, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  source: string;
  /** A checklist box was clicked in the preview: the n-th one in document order. Without it the boxes are read-only. */
  onToggleTask?: (ordinal: number) => void;
}

/**
 * Markdown -> React elements (GitHub flavour: tables, task lists, strikethrough, autolinks). No raw HTML is ever rendered
 * (react-markdown does not parse it) and `javascript:` addresses are dropped by its default URL filter, so pasted text cannot run code.
 */
export function MarkdownPreview({ source, onToggleTask }: Props) {
  const root = useRef<HTMLDivElement>(null);

  // Which box was clicked = its position among the boxes on screen (document order). Looked up at click time from the DOM: counting
  // while rendering breaks under React StrictMode, which renders every component twice.
  const clicked = (box: HTMLInputElement) => {
    const boxes = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []);
    const ordinal = boxes.indexOf(box);
    if (ordinal >= 0) onToggleTask?.(ordinal);
  };

  return (
    <div ref={root} data-testid="md-preview" className="md-preview">
      {source.trim() === "" ? (
        <p className="italic text-muted-foreground">Nothing to preview yet.</p>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // an address react-markdown refused (javascript: …) comes back empty: show the words, not a dead link
            a: ({ node: _n, href, children, ...p }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) =>
              href ? <a {...p} href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> : <span>{children}</span>,
            input: ({ node: _n, type, checked, ...p }: ComponentPropsWithoutRef<"input"> & { node?: unknown }) => {
              if (type !== "checkbox") return <input type={type} {...p} />;
              return (
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  disabled={!onToggleTask}
                  onChange={(e) => clicked(e.currentTarget)}
                  aria-label="Checklist item"
                />
              );
            },
          }}
        >
          {source}
        </ReactMarkdown>
      )}
    </div>
  );
}
