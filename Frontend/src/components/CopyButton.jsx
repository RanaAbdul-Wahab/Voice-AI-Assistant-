import { useState } from "react";


/*
 * A small "copy to clipboard" button for an assistant message.
 * Shows a brief "Copied" confirmation, then reverts.
 */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);
      window.setTimeout(
        () => setCopied(false),
        1500,
      );
    } catch {
      // Clipboard can be unavailable (e.g. non-HTTPS context). Ignore.
    }
  }

  return (
    <button
      type="button"
      className="copy-button"
      onClick={handleCopy}
      aria-label="Copy message"
      title="Copy message"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}

      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}


export default CopyButton;
