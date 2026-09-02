/**
 * Which plural form a number takes, in a given language.
 *
 * A port of the server's `lex-icu::plural`, rule for rule. The two must
 * agree exactly — a number that is `few` on the server and `other` here
 * would show the wrong sentence — so the conformance suite runs the same
 * cases against both.
 *
 * @packageDocumentation
 */
/** Language subtags grouped by the rule they share. */
const RULES = [
    ["invariant", ["ja", "zh", "ko", "vi", "th", "id", "ms", "my", "km", "lo"]],
    ["zeroAndOneAreSingular", ["fr", "pt", "hi", "fa", "am"]],
    ["eastSlavic", ["ru", "uk", "be", "sr", "hr", "bs"]],
    ["polish", ["pl"]],
    ["czech", ["cs", "sk"]],
    ["arabic", ["ar"]],
    ["romanian", ["ro", "mo"]],
    ["lithuanian", ["lt"]],
];
/**
 * The rule for a locale, defaulting to the English one.
 *
 * Only the language part is read: `fr-CA` and `fr` pluralise alike, and no
 * CLDR rule varies by region. An unknown language falls back rather than
 * failing — a wrong plural is cosmetic, a missing string is a broken screen.
 */
export function ruleFor(locale) {
    const language = locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
    for (const [rule, languages] of RULES) {
        if (languages.includes(language))
            return rule;
    }
    return "oneIsSingular";
}
/**
 * The operands of a number, given how many fraction digits it is shown with.
 */
export function operandsOf(value, digits = 0) {
    const absolute = Math.abs(value);
    return { n: absolute, i: Math.trunc(absolute), v: digits };
}
/** The category a number falls into under a rule. */
export function categorize(rule, operands) {
    const { i, v } = operands;
    const isInteger = v === 0;
    const last = i % 10;
    const lastTwo = i % 100;
    switch (rule) {
        case "invariant":
            return "other";
        case "oneIsSingular":
            return i === 1 && isInteger ? "one" : "other";
        case "zeroAndOneAreSingular":
            return i <= 1 ? "one" : "other";
        case "eastSlavic":
            if (!isInteger)
                return "other";
            if (last === 1 && lastTwo !== 11)
                return "one";
            if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14))
                return "few";
            return "many";
        case "polish":
            if (!isInteger)
                return "other";
            if (i === 1)
                return "one";
            if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14))
                return "few";
            return "many";
        case "czech":
            if (!isInteger)
                return "many";
            if (i === 1)
                return "one";
            return i >= 2 && i <= 4 ? "few" : "other";
        case "arabic":
            if (!isInteger)
                return "other";
            if (i === 0)
                return "zero";
            if (i === 1)
                return "one";
            if (i === 2)
                return "two";
            if (lastTwo >= 3 && lastTwo <= 10)
                return "few";
            if (lastTwo >= 11 && lastTwo <= 99)
                return "many";
            return "other";
        case "romanian":
            if (i === 1 && isInteger)
                return "one";
            if (!isInteger || i === 0 || (lastTwo >= 1 && lastTwo <= 19))
                return "few";
            return "other";
        case "lithuanian":
            if (!isInteger)
                return "many";
            if (lastTwo >= 11 && lastTwo <= 19)
                return "other";
            if (last === 1)
                return "one";
            return last >= 2 && last <= 9 ? "few" : "other";
    }
}
/**
 * The plural category of a value in a locale, in one call.
 *
 * @example
 * ```ts
 * pluralCategory("ru", 3);   // "few"
 * pluralCategory("fr", 0);   // "one"
 * pluralCategory("en", 0);   // "other"
 * ```
 */
export function pluralCategory(locale, value, digits = 0) {
    return categorize(ruleFor(locale), operandsOf(value, digits));
}
//# sourceMappingURL=plural.js.map