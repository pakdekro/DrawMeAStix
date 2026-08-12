/**
 * Déclaration committée du module généré par scripts/build-validators.mjs
 * (le .mjs lui-même est produit par les hooks predev/prebuild/pretest et
 * n'est pas versionné).
 */

export type ValidateFn = ((data: unknown) => boolean) & {
  errors?: { instancePath: string; message?: string }[] | null;
};

/** type STIX (« attack-pattern », « ipv4-addr », …) → validateur OASIS */
export declare const validators: Record<string, ValidateFn | undefined>;
