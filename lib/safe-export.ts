const FORMULA_PREFIX = /^[\s]*[=+\-@]/u;

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

export function safeSpreadsheetText(value: unknown): string {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function escapeCsvCell(value: unknown): string {
  const text = typeof value === 'number'
    ? String(value)
    : safeSpreadsheetText(value);
  return `"${text.replace(/"/g, '""')}"`;
}
