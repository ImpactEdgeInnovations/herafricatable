export const memberPageSize: number;
export function memberPageNumber(value: unknown): number;
export function memberDirectoryHref(options?: {page?: number; city?: string; goal?: string; search?: string; view?: 'find' | 'connections'}): string;
export function memberDirectoryWindow<T>(rows: T[], page?: number): {members: T[]; hasNextPage: boolean; first: number; last: number};
