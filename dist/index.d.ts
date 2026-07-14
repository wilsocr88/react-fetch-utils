interface FetchPromiseParams {
    url: string;
    method: string;
    body?: unknown;
    respType?: "raw" | "json" | null;
    headers?: HeadersInit | Record<string, string>;
    timeoutMs?: number;
    baseUrl?: string;
    includeContentType?: boolean;
    parseAs?: "json" | "raw" | "text" | "response";
    onRequest?: (request: FetchRequestConfig) => FetchRequestConfig | void | Promise<FetchRequestConfig | void>;
    validateStatus?: (status: number, response: Response) => boolean;
    getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
    allowBodyForGetHead?: boolean;
}
interface FetchRequestConfig {
    url: string;
    init: RequestInit;
    headers: Headers;
}
interface FetchPromiseError {
    reason: "Unauthorized" | "Timeout" | "Unknown";
    details: unknown;
    status?: number;
    response?: Response;
    originalError?: unknown;
}
type FetchClientDefaults = Omit<FetchPromiseParams, "url" | "method"> & {
    method?: string;
};
interface CancellablePromise<T = unknown> extends Promise<T> {
    cancel: () => void;
}
/**
 * @param params - Request configuration
 * @returns A promise with a `.cancel()` method that calls `AbortController.abort()`
 */
declare const FetchPromise: <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;
declare const createFetchClient: (defaults?: FetchClientDefaults) => <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;

declare function useQueries(): {
    list: CancellablePromise<unknown>[];
    cancelAll: () => void;
    add: (query: CancellablePromise) => void;
    remove: (query: CancellablePromise) => void;
};

/**
 * Status enumerator.
 * 0 = "idle"
 * 1 = "fetching"
 * 2 = "done"
 * 3 = "error"
 */
declare const statusEnum: {
    readonly 0: "idle";
    readonly 1: "fetching";
    readonly 2: "done";
    readonly 3: "error";
};
type Status = 0 | 1 | 2 | 3;
type UseRequestOptions = {
    disableCache?: boolean;
    cacheKey?: string;
    enabled?: boolean;
    deps?: ReadonlyArray<unknown>;
    staleTimeMs?: number;
    dedupe?: boolean;
};
type UseRequestResult<T> = {
    status: Status;
    response: T | null;
    error: unknown;
    refetch: () => void;
    cancel: () => void;
    reset: () => void;
};
/**
 * @param fetchPromise - A factory function that returns a `CancellablePromise`
 * @param disableCacheOrOptions - Disable cache via boolean (legacy) or provide options
 * @returns Hook state and controls for request status, response, and retries
 */
declare const useRequest: <T = unknown>(fetchPromise: (() => CancellablePromise<T>) | null | undefined, disableCacheOrOptions?: boolean | UseRequestOptions) => UseRequestResult<T>;

export { type CancellablePromise, type FetchClientDefaults, FetchPromise, type FetchPromiseError, type FetchPromiseParams, type FetchRequestConfig, type Status, type UseRequestOptions, type UseRequestResult, createFetchClient, statusEnum, useQueries, useRequest };
