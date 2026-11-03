/**
 * TranslatedText helpers for websites built on the RentalWise API.
 *
 * A TranslatedText is a map from the account's language codes to text:
 *   { en: "Sea view villa", fr: "Villa vue mer" }
 * Only keys that were saved exist, a value may be null or "", and records saved before a field
 * became translatable may still be a plain string (the default-language value).
 *
 * Resolution order: page locale -> account default language -> first non-blank value -> undefined.
 * Dependency-free; safe to import from server and client code (contains no credentials).
 */

export type TranslatedText = Record<string, string | null | undefined> | string | null | undefined;

/** One record of `POST language/query`. */
export interface RentalWiseLanguage {
    id: number;
    /** Two-letter lowercase code; the key used in TranslatedText maps and in sort/where locales. */
    locale: string;
    /** e.g. "en_US"; format with toBcp47() before giving it to Intl. */
    iso_locale: string;
    original_name: string;
    international_name: string;
    is_default: boolean;
}

const isBlank = (text: unknown): boolean =>
    text === undefined || text === null || (typeof text === 'string' && text.trim().length === 0);

/** Coerce a legacy plain string or a malformed value into a map. */
export function normalizeTranslated(value: TranslatedText, defaultLocale: string): Record<string, string | null | undefined> {
    if (typeof value === 'string') {
        return { [defaultLocale]: value };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}

export interface ResolveOptions {
    /** When neither the page locale nor the default has text, return the first non-blank value (default true). */
    anyLanguage?: boolean;
}

/**
 * Resolve a TranslatedText for the page.
 *
 *   resolveTranslated(property.name, locale, defaultLocale) ?? ''
 *
 * `defaultLocale` is the account's `is_default` language from language/query, not a constant.
 */
export function resolveTranslated(
    value: TranslatedText,
    locale: string,
    defaultLocale: string,
    { anyLanguage = true }: ResolveOptions = {},
): string | undefined {
    const map = normalizeTranslated(value, defaultLocale);

    for (const key of [locale, defaultLocale]) {
        const text = map[key];
        if (!isBlank(text)) {
            return text as string;
        }
    }

    if (anyLanguage) {
        const text = Object.values(map).find((candidate) => !isBlank(candidate));
        if (text) {
            return text;
        }
    }

    return undefined;
}

/** True when the map has non-blank text in exactly that language (no fallback). */
export function hasTranslation(value: TranslatedText, locale: string, defaultLocale: string): boolean {
    return !isBlank(normalizeTranslated(value, defaultLocale)[locale]);
}

/** Which language a resolved text actually came from; lets the page show "shown in English". */
export function resolvedLocale(value: TranslatedText, locale: string, defaultLocale: string): string | undefined {
    const map = normalizeTranslated(value, defaultLocale);
    for (const key of [locale, defaultLocale, ...Object.keys(map)]) {
        if (!isBlank(map[key])) {
            return key;
        }
    }
    return undefined;
}

/**
 * Sanitise a locale before it reaches a request (sort[].locale, where ... { locale }) or a URL.
 * Accepts "fr", "fr-FR", "FR", "fr_ca": keeps the language part and lower-cases it. Anything that
 * is not an offered language (a framework sentinel such as "__default", a typo, a language the
 * account has not enabled) becomes the default language.
 */
export function pickLocale(requested: string | null | undefined, offered: readonly string[], defaultLocale: string): string {
    if (!requested) {
        return defaultLocale;
    }
    const language = requested.trim().toLowerCase().split(/[-_]/)[0];
    return offered.includes(language) ? language : defaultLocale;
}

/** The account's default language code, from the language/query result. */
export function defaultLocaleOf(languages: readonly RentalWiseLanguage[]): string {
    return languages.find((language) => language.is_default)?.locale ?? languages[0]?.locale ?? 'en';
}

/** "en_US" -> "en-US" for Intl.* and <html lang>. Falls back to the two-letter locale. */
export function toBcp47(isoLocale: string | null | undefined, locale?: string): string {
    if (isoLocale && /^[a-z]{2}[_-][A-Za-z]{2}$/.test(isoLocale)) {
        const [language, region] = isoLocale.split(/[_-]/);
        return `${language.toLowerCase()}-${region.toUpperCase()}`;
    }
    return locale ?? 'en';
}
