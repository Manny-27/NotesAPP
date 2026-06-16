import { applyMarkdownAction, type MarkdownAction } from "./markdown-actions";

export function runEditorAction(
  editor: HTMLTextAreaElement | null,
  action: MarkdownAction,
  onChange: (value: string) => void,
) {
  if (!editor || editor.disabled) return;
  const edit = applyMarkdownAction(
    editor.value,
    editor.selectionStart,
    editor.selectionEnd,
    action,
  );
  onChange(edit.value);
  requestAnimationFrame(() => {
    editor.focus();
    editor.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
}

export function runHistoryAction(
  editor: HTMLTextAreaElement | null,
  action: "undo" | "redo",
) {
  if (!editor || editor.disabled) return;
  editor.focus();
  document.execCommand(action);
}
