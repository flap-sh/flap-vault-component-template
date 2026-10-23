export declare const FSI_QUERY_PREFIX: string;
export declare const FSI_QUERY_PREFIXES: readonly string[];
export function isFsiQueryUrl(value: string): boolean;
export function resolveFsiQueryPrefix(endpoints: unknown): string | null;
export function hasFsiQueryDeclaration(endpoints: unknown): boolean;
export function buildFsiQueryUrl(path: string, params?: Record<string, string>, prefix?: string): string;
