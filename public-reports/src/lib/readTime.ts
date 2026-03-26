// Public-Reports/src/lib/readTime.ts
// Utility functions for calculating estimated reading time.

const WORDS_PER_MINUTE = 220; // average adult reading speed

/** Count words in a string */
export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Calculate read time in minutes for a block of text.
 * Always returns at least 1.
 */
export function calculateReadTime(text: string): number {
  const words = countWords(text);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Calculate read time for a report section including
 * its content, bullets, and statistics.
 */
export function calculateSectionReadTime(section: {
  content:    string;
  bullets?:   string[];
  statistics?: { value: string; context: string }[];
}): number {
  const contentWords = countWords(section.content);
  const bulletWords  = (section.bullets   ?? []).reduce((s, b) => s + countWords(b), 0);
  const statWords    = (section.statistics ?? []).reduce((s, st) => s + countWords(st.context), 0);
  const total = contentWords + bulletWords + statWords;
  return Math.max(1, Math.ceil(total / WORDS_PER_MINUTE));
}

/** Format minutes into a human-readable string: "1 min", "3 min" */
export function formatReadTime(minutes: number): string {
  if (minutes <= 1) return '1 min';
  return `${minutes} min`;
}

/**
 * Calculate total read time for all sections in a report.
 * Returns total minutes (unformatted).
 */
export function calculateTotalReadTime(sections: {
  content:  string;
  bullets?: string[];
}[]): number {
  return sections.reduce((total, section) => {
    return total + calculateSectionReadTime(section);
  }, 0);
}

/**
 * Returns a section's anchor ID — used by TOC + IntersectionObserver.
 * Prefers section.id; falls back to a slug from the title.
 */
export function getSectionAnchorId(
  section: { id?: string; title: string },
  index:   number,
): string {
  if (section.id && section.id.length > 0) {
    return `section-${section.id}`;
  }
  const slug = section.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `section-${slug || index}`;
}