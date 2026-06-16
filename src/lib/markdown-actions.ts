export type MarkdownAction =
  | "clear"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bold"
  | "italic"
  | "strikethrough"
  | "inline-code"
  | "quote"
  | "checkbox"
  | "link"
  | "image"
  | "table"
  | "bullet-list"
  | "ordered-list"
  | "code-block"
  | "separator";

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface Selection {
  value: string;
  start: number;
  end: number;
}

function replace(
  { value, start, end }: Selection,
  replacement: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): TextEdit {
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: start + selectionStart,
    selectionEnd: start + selectionEnd,
  };
}

function wrap(selection: Selection, before: string, after: string, fallback: string) {
  const selected = selection.value.slice(selection.start, selection.end);
  const text = selected || fallback;
  return replace(
    selection,
    `${before}${text}${after}`,
    before.length,
    before.length + text.length,
  );
}

function lineRange(selection: Selection) {
  const start = selection.value.lastIndexOf("\n", selection.start - 1) + 1;
  const nextBreak = selection.value.indexOf("\n", selection.end);
  const end = nextBreak === -1 ? selection.value.length : nextBreak;
  return { ...selection, start, end };
}

function prefixLines(selection: Selection, prefix: string | ((index: number) => string)) {
  const range = lineRange(selection);
  const lines = range.value.slice(range.start, range.end).split("\n");
  const replacement = lines
    .map((line, index) => `${typeof prefix === "function" ? prefix(index) : prefix}${line}`)
    .join("\n");
  return replace(range, replacement, 0, replacement.length);
}

function heading(selection: Selection, level: number) {
  const range = lineRange(selection);
  const line = range.value.slice(range.start, range.end).replace(/^#{1,6}\s+/, "");
  const replacement = `${"#".repeat(level)} ${line || "Título"}`;
  const titleStart = level + 1;
  return replace(range, replacement, titleStart, replacement.length);
}

function clearFormatting(selection: Selection) {
  const selected = selection.value.slice(selection.start, selection.end);
  if (!selected) return selectionToEdit(selection);
  const cleaned = selected
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:>\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/gm, "")
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return replace(selection, cleaned, 0, cleaned.length);
}

function selectionToEdit(selection: Selection): TextEdit {
  return {
    value: selection.value,
    selectionStart: selection.start,
    selectionEnd: selection.end,
  };
}

export function applyMarkdownAction(
  value: string,
  start: number,
  end: number,
  action: MarkdownAction,
): TextEdit {
  const selection = { value, start, end };
  switch (action) {
    case "clear":
      return clearFormatting(selection);
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return heading(selection, Number(action.slice(1)));
    case "bold":
      return wrap(selection, "**", "**", "texto");
    case "italic":
      return wrap(selection, "*", "*", "texto");
    case "strikethrough":
      return wrap(selection, "~~", "~~", "texto");
    case "inline-code":
      return wrap(selection, "`", "`", "código");
    case "quote":
      return prefixLines(selection, "> ");
    case "checkbox":
      return prefixLines(selection, "- [ ] ");
    case "bullet-list":
      return prefixLines(selection, "- ");
    case "ordered-list":
      return prefixLines(selection, (index) => `${index + 1}. `);
    case "code-block":
      return wrap(selection, "```\n", "\n```", "código");
    case "link":
      return wrap(selection, "[", "](https://)", "enlace");
    case "image":
      return replace(selection, "![descripción](https://)", 2, 13);
    case "table": {
      const table =
        "| Columna 1 | Columna 2 |\n| --- | --- |\n| Valor 1 | Valor 2 |";
      return replace(selection, table, 2, 11);
    }
    case "separator":
      return replace(selection, "\n\n---\n\n", 7);
  }
}
