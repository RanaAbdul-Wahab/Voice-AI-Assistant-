import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


/*
 * Renders an assistant message as Markdown.
 *
 * - remark-gfm adds GitHub-style extras: tables, task lists, strikethrough,
 *   and auto-linking of bare URLs (so a pasted link becomes clickable).
 * - react-markdown does NOT render raw HTML by default, so this is safe
 *   from HTML/script injection in model output.
 * - We override the <a> renderer so every link opens in a new tab with
 *   rel="noopener noreferrer" (safe, since links may come from web search).
 */
function MessageMarkdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}


export default MessageMarkdown;
