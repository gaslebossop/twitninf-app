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
import { pluralCategory } from "./plural.js";
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
export function render(text, values, options) {
    if (typeof text === "string")
        return text;
    let out = "";
    for (const node of text)
        out += renderNode(node, values, options);
    return out;
}
/** Renders one node. */
function renderNode(node, values, options) {
    if (typeof node === "string")
        return node;
    if ("#" in node) {
        const value = values[node["#"]];
        if (value === undefined)
            return "#";
        return formatValue(minus(value, node.o ?? 0), undefined, options);
    }
    if ("a" in node) {
        const value = values[node.a];
        // A missing argument shows its own name, which is what it looked like
        // in the source and tells an author exactly what to pass.
        if (value === undefined)
            return `{${node.a}}`;
        return formatValue(value, node.f, options);
    }
    if ("p" in node) {
        return render(pluralBranch(node.p, node.o ?? 0, node.b, values, options), values, options);
    }
    return render(selectBranch(node.s, node.b, values), values, options);
}
/** The branch a plural selects: exact match, then category, then `other`. */
function pluralBranch(name, offset, branches, values, options) {
    const value = values[name];
    if (typeof value !== "number")
        return branches["other"] ?? [];
    const exact = branches[`=${value}`];
    if (exact !== undefined)
        return exact;
    const category = pluralCategory(options.locale, value - offset, fractionDigits(value - offset));
    return branches[category] ?? branches["other"] ?? [];
}
/** The branch a select takes, falling back to `other`. */
function selectBranch(name, branches, values) {
    const value = values[name];
    const key = value === undefined ? undefined : String(value);
    if (key !== undefined && branches[key] !== undefined)
        return branches[key];
    return branches["other"] ?? [];
}
/** A value minus an offset; only numbers have one applied. */
function minus(value, offset) {
    return typeof value === "number" ? value - offset : value;
}
/** How many fraction digits a number is written with. */
function fractionDigits(value) {
    if (Number.isInteger(value))
        return 0;
    return String(value).split(".")[1]?.length ?? 0;
}
/** Formats a value for insertion. */
function formatValue(value, format, options) {
    // Locale-aware formatting is the client's job, and here the client has
    // `Intl` — the platform's own formatter, with the user's settings.
    try {
        if (format === "number" && typeof value === "number") {
            return new Intl.NumberFormat(options.locale).format(value);
        }
        if ((format === "date" || format === "time") && !(typeof value === "boolean")) {
            const date = value instanceof Date ? value : new Date(value);
            if (!Number.isNaN(date.getTime())) {
                return format === "date"
                    ? new Intl.DateTimeFormat(options.locale, { dateStyle: "medium" }).format(date)
                    : new Intl.DateTimeFormat(options.locale, { timeStyle: "short" }).format(date);
            }
        }
    }
    catch {
        // An environment without `Intl`, or a locale it rejects: fall through
        // to the plain form rather than losing the text entirely.
    }
    return value instanceof Date ? value.toISOString() : String(value);
}
/**
 * Renders every key of a response.
 *
 * @example
 * ```ts
 * renderAll({ title: "Panier", items: [{ a: "n" }] }, { n: 3 }, { locale: "fr" });
 * // { title: "Panier", items: "3" }
 * ```
 */
export function renderAll(texts, values, options) {
    const out = {};
    for (const [key, text] of Object.entries(texts)) {
        out[key] = render(text, values, options);
    }
    return out;
}
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
export function groupEntries(texts, prefix, fields, newestFirst = false) {
    const groups = new Map();
    for (const [key, value] of Object.entries(texts)) {
        if (!key.startsWith(`${prefix}.`))
            continue;
        const rest = key.slice(prefix.length + 1);
        const cut = rest.lastIndexOf(".");
        if (cut < 1)
            continue;
        const id = rest.slice(0, cut);
        const field = rest.slice(cut + 1);
        if (!fields.includes(field))
            continue;
        const group = groups.get(id) ?? {};
        group[field] = value;
        groups.set(id, group);
    }
    return [...groups.entries()]
        .sort(([left], [right]) => newestFirst
        ? right.localeCompare(left, undefined, { numeric: true })
        : left.localeCompare(right, undefined, { numeric: true }))
        .map(([, entry]) => entry);
}
//# sourceMappingURL=render.js.map