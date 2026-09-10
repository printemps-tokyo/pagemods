// Regular-expression helpers shared by the mods.
//
// Patterns typed by the user are compiled leniently: an empty or broken
// pattern matches nothing instead of throwing somewhere far from the input
// that caused it.

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Escape a literal so it can be spliced into a pattern. */
export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIALS, "\\$&");
}

/** Compile a pattern; null when it is empty or invalid. */
export function compilePattern(source: string): RegExp | null {
  if (source.trim() === "") return null;
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}
