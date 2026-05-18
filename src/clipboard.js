export async function copyTextToClipboard(
  text,
  {
    clipboard = globalThis.navigator?.clipboard,
    documentRef = globalThis.document,
  } = {},
) {
  const value = String(text || "");

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Embedded previews can deny navigator.clipboard; fall through to legacy copy.
    }
  }

  if (!documentRef?.createElement || !documentRef?.body || !documentRef?.execCommand) {
    return false;
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  documentRef.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = documentRef.execCommand("copy");
  } finally {
    documentRef.body.removeChild(textarea);
  }

  return copied;
}
