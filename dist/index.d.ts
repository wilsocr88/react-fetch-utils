/** Configuration parameters for FetchPromise requests */
interface FetchPromiseParams {
    /** Request URL (relative or absolute) */
    url: string;
    /** HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, etc.) */
    method: string;
    /** Request body (will be JSON-stringified if not already BodyInit type) */
    body?: unknown;
    /** Deprecated: use parseAs instead. Determines response parsing mode */
    respType?: "raw" | "json" | null;
    /** Request headers */
    headers?: HeadersInit | Record<string, string>;
    /** Request timeout in milliseconds. If exceeded, request is aborted */
    timeoutMs?: number;
    /** Base URL to resolve relative URLs against */
    baseUrl?: string;
    /** Auto-set Content-Type header for JSON bodies (default: true) */
    includeContentType?: boolean;
    /** How to parse the response: 'json' (default), 'raw' (blob), 'text', or 'response' */
    parseAs?: "json" | "raw" | "text" | "response";
    /** Intercept and modify request config before sending */
    onRequest?: (request: FetchRequestConfig) => FetchRequestConfig | void | Promise<FetchRequestConfig | void>;
    /** Custom status validation. Return true to treat as success */
    validateStatus?: (status: number, response: Response) => boolean;
    /** Async function to retrieve auth token for Authorization header */
    getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
    /** Allow request body for GET/HEAD methods (default: false) */
    allowBodyForGetHead?: boolean;
}
/** Request config object passed to onRequest interceptor */
interface FetchRequestConfig {
    /** Final resolved URL */
    url: string;
    /** Fetch RequestInit object */
    init: RequestInit;
    /** Headers object for inspection/modification */
    headers: Headers;
}
/** Error object returned when FetchPromise rejects */
interface FetchPromiseError {
    /** Error category: 'Unauthorized' (401), 'Timeout' (request exceeded timeoutMs), or 'Unknown' */
    reason: "Unauthorized" | "Timeout" | "Unknown";
    /** Error details (status info, parsed error response, etc.) */
    details: unknown;
    /** HTTP status code if available */
    status?: number;
    /** Response object if available */
    response?: Response;
    /** Original error thrown by fetch or timeout handler */
    originalError?: unknown;
}
/** Default configuration for all requests made by a FetchClient instance */
type FetchClientDefaults = Omit<FetchPromiseParams, "url" | "method"> & {
    /** Default HTTP method (can be overridden per request) */
    method?: string;
};
/** Promise with a cancel() method for aborting the underlying fetch request */
interface CancellablePromise<T = unknown> extends Promise<T> {
    /** Abort the in-flight request. This will cause the promise to reject */
    cancel: () => void;
}
/**
 * Creates a cancellable promise around the native fetch API.
 *
 * Handles:
 * - Request timeout with automatic abort
 * - Authorization header injection
 * - Request/response interception via onRequest hook
 * - Multiple response parsing modes (json, raw blob, text, raw response)
 * - Custom status validation
 * - Proper error categorization (Unauthorized, Timeout, Unknown)
 *
 * @template T - Type of the parsed response
 * @param params - Request configuration (url, method, headers, etc.)
 * @returns Promise with .cancel() method to abort the request
 *
 * @example
 * ```ts
 * const promise = FetchPromise<User>({
 *   url: '/api/users/1',
 *   method: 'GET',
 *   timeoutMs: 5000,
 *   getAuthToken: () => localStorage.getItem('token')
 * });
 * const user = await promise;
 * promise.cancel(); // Abort mid-flight
 * ```
 */
declare const FetchPromise: <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;
/**
 * Creates a reusable fetch client with default configuration.
 *
 * Merges default config (baseUrl, headers, interceptors, etc.) with request-specific params.
 * Useful for API clients with consistent settings.
 *
 * @param defaults - Default configuration applied to all requests
 * @returns Function with same signature as FetchPromise but with defaults pre-applied
 *
 * @example
 * ```ts
 * const apiClient = createFetchClient({
 *   baseUrl: 'https://api.example.com',
 *   headers: { 'X-API-Key': 'secret' },
 *   getAuthToken: () => localStorage.getItem('token'),
 *   timeoutMs: 10000
 * });
 *
 * const user = await apiClient<User>({
 *   url: '/users/1',
 *   method: 'GET'
 * });
 * ```
 */
declare const createFetchClient: (defaults?: FetchClientDefaults) => <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;

/**
 * React hook for managing a collection of in-flight requests.
 *
 * Useful for scenarios where you need to track multiple concurrent requests
 * and cancel them together (e.g., cancel all on component unmount or user navigation).
 *
 * @returns Object with list of active queries and control methods
 *
 * @example
 * ```ts
 * const queries = useQueries();
 *
 * const handleLoadMultiple = async () => {
 *   queries.add(fetchUser());
 *   queries.add(fetchPosts());
 *   queries.add(fetchComments());
 * };
 *
 * const handleCancel = () => {
 *   queries.cancelAll();
 * };
 *
 * useEffect(() => {
 *   return () => queries.cancelAll(); // Clean up on unmount
 * }, [queries]);
 * ```
 */
declare function useQueries(): {
    /** Array of currently tracked queries */
    list: CancellablePromise<unknown>[];
    cancelAll: () => void;
    add: (query: CancellablePromise) => void;
    remove: (query: CancellablePromise) => void;
};

/**
 * Status enumerator for reverse lookup.
 * Maps status codes to human-readable strings:
 * - 0 = "idle"
 * - 1 = "fetching"
 * - 2 = "done"
 * - 3 = "error"
 */
declare const statusEnum: {
    readonly 0: "idle";
    readonly 1: "fetching";
    readonly 2: "done";
    readonly 3: "error";
};
/**
 * Status constants for use in request hooks.
 * Recommended for better readability.
 * @example
 * ```ts
 * if (status === STATUS.LOADING) {
 *   return <Spinner />;
 * }
 * ```
 */
declare const STATUS: {
    /** No request has been made or hook is disabled */
    readonly IDLE: 0;
    /** Request is in progress */
    readonly LOADING: 1;
    /** Request completed successfully */
    readonly SUCCESS: 2;
    /** Request failed with an error */
    readonly ERROR: 3;
};
/** Request status type. One of: 0 (idle), 1 (loading), 2 (success), 3 (error) */
type Status = 0 | 1 | 2 | 3;
/** Configuration options for the useRequest hook */
type UseRequestOptions = {
    /** Disable caching for this request (default: false) */
    disableCache?: boolean;
    /** Explicit cache key; defaults to function name or hashed function string */
    cacheKey?: string;
    /** Enable or disable the request (default: true) */
    enabled?: boolean;
    /** Dependency array; re-runs request when dependencies change (default: []) */
    deps?: ReadonlyArray<unknown>;
    /** Cache validity duration in milliseconds (default: Infinity) */
    staleTimeMs?: number;
    /** Deduplicate concurrent requests with the same cache key (default: true) */
    dedupe?: boolean;
};
/** Result object returned by useRequest hook */
type UseRequestResult<T> = {
    /** Current request status (0=idle, 1=loading, 2=success, 3=error) */
    status: Status;
    /** Parsed response data from successful request, or null */
    response: T | null;
    /** Error object from failed request, or null */
    error: unknown;
    /** Refetch the data, bypassing cache */
    refetch: () => void;
    /** Cancel the in-flight request if any */
    cancel: () => void;
    /** Reset to initial idle state, clearing response and error */
    reset: () => void;
};
/**
 * React hook for managing fetch requests with caching, deduplication, and lifecycle management.
 *
 * @template T - Type of the successful response data
 * @param fetchPromise - Factory function that returns a CancellablePromise. Called on mount and when deps change. Pass null/undefined to disable.
 * @param disableCacheOrOptions - Either a boolean to disable caching (legacy), or UseRequestOptions object for granular control
 * @returns Hook state object with status, response, error, and control methods (refetch, cancel, reset)
 *
 * @example
 * ```ts
 * const { status, response, error, refetch } = useRequest(
 *   () => FetchPromise({ url: '/api/user', method: 'GET' }),
 *   { cacheKey: 'user', staleTimeMs: 5000 }
 * );
 * ```
 */
declare const useRequest: <T = unknown>(fetchPromise: (() => CancellablePromise<T>) | null | undefined, disableCacheOrOptions?: boolean | UseRequestOptions) => UseRequestResult<T>;

export { type CancellablePromise, type FetchClientDefaults, FetchPromise, type FetchPromiseError, type FetchPromiseParams, type FetchRequestConfig, STATUS, type Status, type UseRequestOptions, type UseRequestResult, createFetchClient, statusEnum, useQueries, useRequest };
