export declare const FSI_QUERY_PREFIX: string;
export function isFsiQueryUrl(value: string): boolean;
export function hasFsiQueryDeclaration(endpoints: unknown): boolean;
export function buildFsiQueryUrl(path: string, params?: Record<string, string>): string;
