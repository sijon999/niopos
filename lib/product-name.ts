const PLACEHOLDER_ONLY_NAME = /^[\s?\uFFFD\u25A1\u25A0\u25AF\u25FB\u25FC]+$/u;

export function isValidProductName(name: string | null | undefined): name is string {
  if (typeof name !== 'string') return false;
  const trimmedName = name.trim();
  return trimmedName.length > 0 && !PLACEHOLDER_ONLY_NAME.test(trimmedName);
}
