// Count UTF-16 code units, matching JavaScript string.length. Keep large values bounded.
export const MAX_COPY_TEXT_LENGTH = 1_048_576;

/** Clipboard writes are private to the trusted runtime UI, never an artifact SDK method. */
export function isCopyableText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_COPY_TEXT_LENGTH && value.trim().length > 0 && !value.includes("\0");
}

export async function writeCopyText(value: string): Promise<boolean> {
  if (!isCopyableText(value) || typeof document === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Some browser contexts deny the Clipboard API; try the user-click fallback.
    }
  }
  const parent = document.fullscreenElement ?? document.body;
  if (!parent || typeof document.execCommand !== "function") return false;
  const active = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.setAttribute("aria-hidden", "true");
  Object.assign(input.style, { position: "fixed", left: "0", top: "0", width: "1px", height: "1px", opacity: "0", fontSize: "16px" });
  parent.appendChild(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
    if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
