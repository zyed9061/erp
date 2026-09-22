import type { Translator } from "./translate";

/**
 * Minimal plural selection for the dictionaries: picks `${key}_one` when `count === 1`,
 * `${key}_other` otherwise, and exposes `{count}` to the message.
 */
export function tp(
  t: Translator,
  key: string,
  count: number,
  vars?: Record<string, string | number>,
): string {
  return t(`${key}_${count === 1 ? "one" : "other"}`, { count, ...vars });
}
