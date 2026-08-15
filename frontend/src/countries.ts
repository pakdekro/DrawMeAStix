/**
 * ISO 3166-1 countries: canonical name and alpha-2 code.
 *
 * A `location` identifier is derived from the NAME (`norm(name)` plus the
 * location type), never from the country code. "FR", "France" and "French
 * Republic" are therefore three distinct objects, and no platform will ever
 * merge them, ours included. The list exists so that the analyst is handed one
 * canonical spelling instead of inventing one, which is the same reason the
 * ATT&CK dataset exists for groups and techniques.
 *
 * Loaded on demand from `public/countries.json` (9 KB), built by
 * `backend/scripts/build_countries_dataset.py`. It lives beside the app rather
 * than inside the bundle for the same reason the ATT&CK dataset does: nobody
 * pays for it until a location is typed.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, the value the `country` property of the spec wants */
  code: string;
  /** short English name, the value that lands on the node and drives its id */
  name: string;
}

export interface CountryDataset {
  source: string;
  entries: Country[];
}

let cache: Promise<CountryDataset> | null = null;

export function loadCountries(): Promise<CountryDataset> {
  cache ??= fetch("/countries.json").then((r) => {
    if (!r.ok) {
      cache = null;
      throw new Error(`country list unavailable (${r.status})`);
    }
    return r.json() as Promise<CountryDataset>;
  });
  return cache;
}

/**
 * Search by name or by code, best matches first.
 *
 * The code is matched only on a WHOLE query: two letters are a country code
 * ("FR"), but they are also the start of a hundred names, and someone typing
 * "in" wants India before Indonesia and not Iran because its code is IR.
 */
export function searchCountries(
  entries: Country[],
  query: string,
  limit = 6,
): Country[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { score: number; country: Country }[] = [];
  for (const country of entries) {
    const name = country.name.toLowerCase();
    const code = country.code.toLowerCase();
    let score: number | null = null;
    if (name === q) score = 0;
    else if (code === q) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    if (score !== null) scored.push({ score, country });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name),
  );
  return scored.slice(0, limit).map((s) => s.country);
}
