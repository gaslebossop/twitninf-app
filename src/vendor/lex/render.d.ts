/**
 * Running a compiled message against values.
 *
 * This is the interpreter the whole design turns on: about two hundred
 * lines, because the server already did the parsing. It mirrors
 * `lex-icu::render` exactly, and the conformance suite runs the same cases
 * against both.
 *
 * It never throws. A missing argument renders as its own name in braces, a
 * plural with no matching branch falls back to `other`. A message with a
 * mistake in it shows slightly wrong text — never a blank, never a crash.
 *
 * @packageDocumentation
 */
import type { LexValue, Text } from "./types.js";
/** The values a program is rendered against. */
export interface Values {
    readonly [name: string]: LexValue | undefined;
}
/** How a value is formatted when it is inserted. */
export interface FormatOptions {
    /** The locale to format numbers and dates in. */
    readonly locale: string;
}
/**
 * Renders a message.
 *
 * @example
 * ```ts
 * render([{ p: "n", b: { one: [{ "#": "n" }, " item"], other: [{ "#": "n" }, " items"] } }],
 *        { n: 3 }, { locale: "en" });
 * // "3 items"
 * ```
 */
export declare function render(text: Text, values: Values, options: FormatOptions): string;
/**
 * Renders every key of a response.
 *
 * @example
 * ```ts
 * renderAll({ title: "Panier", items: [{ a: "n" }] }, { n: 3 }, { locale: "fr" });
 * // { title: "Panier", items: "3" }
 * ```
 */
export declare function renderAll(texts: Readonly<Record<string, Text>>, values: Values, options: FormatOptions): Record<string, string>;
/**
 * Groups a wildcard's keys into ordered entries.
 *
 * A query selecting `news.entry.*` gets back everything under that prefix,
 * without the app knowing how many there are. Adding one in the panel makes
 * it appear — no list to extend, no constant to bump, nothing to ship.
 *
 * Keys read `<prefix>.<id>.<field>`. Sorting on the id is what puts them in
 * order, so a numeric id grows with time and a new entry lands where the
 * caller asked — at the top with `newestFirst`, at the bottom without.
 *
 * @example
 * ```ts
 * groupEntries(text, "news.entry", ["date", "title"], true);
 * // [{ date: "September", title: "…" }, { date: "August", title: "…" }]
 * ```
 */
export declare function groupEntries(texts: Readonly<Record<string, string>>, prefix: string, fields: readonly string[], newestFirst?: boolean): Array<Record<string, string>>;
//# sourceMappingURL=render.d.ts.map