/** Configuration parameters for FetchPromise requests */
export interface FetchPromiseParams {
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
    onRequest?: (
        request: FetchRequestConfig
    ) => FetchRequestConfig | void | Promise<FetchRequestConfig | void>;
    /** Custom status validation. Return true to treat as success */
    validateStatus?: (status: number, response: Response) => boolean;
    /** Async function to retrieve auth token for Authorization header */
    getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
    /** Allow request body for GET/HEAD methods (default: false) */
    allowBodyForGetHead?: boolean;
}

/** Request config object passed to onRequest interceptor */
export interface FetchRequestConfig {
    /** Final resolved URL */
    url: string;
    /** Fetch RequestInit object */
    init: RequestInit;
    /** Headers object for inspection/modification */
    headers: Headers;
}

/** Error object returned when FetchPromise rejects */
export interface FetchPromiseError {
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
export type FetchClientDefaults = Omit<FetchPromiseParams, "url" | "method"> & {
    /** Default HTTP method (can be overridden per request) */
    method?: string;
};

/** Promise with a cancel() method for aborting the underlying fetch request */
export interface CancellablePromise<T = unknown> extends Promise<T> {
    /** Abort the in-flight request. This will cause the promise to reject */
    cancel: () => void;
}

const METHODS_WITH_DEFAULT_BODY = new Set(["POST", "PUT", "PATCH"]);
const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

const isBodyInitLike = (value: unknown): value is BodyInit => {
    if (typeof value === "string") return true;
    if (typeof Blob !== "undefined" && value instanceof Blob) return true;
    if (typeof FormData !== "undefined" && value instanceof FormData) return true;
    if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
    if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) return true;
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) return true;
    return false;
};

const mapParseMode = (
    parseAs: FetchPromiseParams["parseAs"],
    respType: FetchPromiseParams["respType"]
): "json" | "raw" | "text" | "response" => {
    if (parseAs) return parseAs;
    if (respType === "raw") return "raw";
    return "json";
};

const mergeHeaders = (
    defaults?: HeadersInit | Record<string, string>,
    overrides?: HeadersInit | Record<string, string>
): Headers => {
    const headers = new Headers(defaults ?? {});
    if (overrides) {
        new Headers(overrides).forEach((value, key) => {
            headers.set(key, value);
        });
    }
    return headers;
};

const resolveUrl = (url: string, baseUrl?: string): string => {
    if (!baseUrl) return url;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) || url.startsWith("//")) {
        return url;
    }
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = url.startsWith("/") ? url : `/${url}`;
    return `${normalizedBase}${normalizedPath}`;
};

const parseJsonSafely = async <T>(response: Response): Promise<T> => {
    if (response.status === 204 || response.status === 205) {
        return undefined as T;
    }
    const text = await response.text();
    if (!text.trim()) {
        return undefined as T;
    }
    return JSON.parse(text) as T;
};

const normalizeErrorDetails = (error: unknown) => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return error;
};

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
const FetchPromise = <T = unknown>(params: FetchPromiseParams): CancellablePromise<T> => {
    const controller = new AbortController();
    const signal = controller.signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let cancelled = false;

    const promise = new Promise<T>(async function (resolve, reject) {
        try {
            const method = params.method.toUpperCase();
            const parseAs = mapParseMode(params.parseAs, params.respType);
            const headers = mergeHeaders(undefined, params.headers);

            if (!headers.has("Accept")) {
                if (parseAs === "raw") {
                    headers.set("Accept", "blob");
                } else if (parseAs === "json") {
                    headers.set("Accept", "application/json");
                } else {
                    headers.set("Accept", "*/*");
                }
            }

            if (!headers.has("Authorization") && params.getAuthToken) {
                const token = await params.getAuthToken();
                if (token) {
                    headers.set("Authorization", `Bearer ${token}`);
                }
            }

            const hasBodyValue = params.body !== undefined && params.body !== null;
            const allowsBody = !METHODS_WITHOUT_BODY.has(method) || params.allowBodyForGetHead === true;
            const shouldSendBody = hasBodyValue && allowsBody;

            let body: BodyInit | undefined;
            let isJsonBody = false;
            if (shouldSendBody) {
                if (isBodyInitLike(params.body)) {
                    body = params.body;
                } else {
                    body = JSON.stringify(params.body);
                    isJsonBody = true;
                }
            }

            if (
                shouldSendBody &&
                isJsonBody &&
                params.includeContentType !== false &&
                !headers.has("Content-Type") &&
                METHODS_WITH_DEFAULT_BODY.has(method)
            ) {
                headers.set("Content-Type", "application/json");
            }

            const requestConfig: FetchRequestConfig = {
                url: resolveUrl(params.url, params.baseUrl),
                init: {
                    method,
                    signal,
                    headers,
                    body,
                },
                headers,
            };

            if (params.onRequest) {
                const maybeUpdatedConfig = await params.onRequest(requestConfig);
                if (maybeUpdatedConfig) {
                    requestConfig.url = maybeUpdatedConfig.url;
                    requestConfig.init = maybeUpdatedConfig.init;
                    requestConfig.headers = maybeUpdatedConfig.headers;
                }
            }

            if (typeof params.timeoutMs === "number" && params.timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    timedOut = true;
                    controller.abort();
                }, params.timeoutMs);
            }

            const response = await fetch(requestConfig.url, {
                ...requestConfig.init,
                signal,
                headers: requestConfig.headers,
            });

            if (response.status === 401) {
                reject({ reason: "Unauthorized", details: response, status: 401, response } satisfies FetchPromiseError);
                return;
            }

            const isValid = params.validateStatus
                ? params.validateStatus(response.status, response)
                : response.ok;

            if (!isValid) {
                reject({
                    reason: "Unknown",
                    details: {
                        status: response.status,
                        statusText: response.statusText,
                        response,
                    },
                    status: response.status,
                    response,
                } satisfies FetchPromiseError);
                return;
            }

            if (parseAs === "response") {
                resolve(response as T);
                return;
            }

            if (parseAs === "raw") {
                resolve((await response.blob()) as unknown as T);
                return;
            }

            if (parseAs === "text") {
                resolve((await response.text()) as unknown as T);
                return;
            }

            resolve(await parseJsonSafely<T>(response));
        } catch (error) {
            if (timedOut && (error as { name?: string } | null)?.name === "AbortError") {
                reject({
                    reason: "Timeout",
                    details: {
                        timeoutMs: params.timeoutMs,
                        abortError: normalizeErrorDetails(error),
                    },
                    originalError: error,
                } satisfies FetchPromiseError);
                return;
            }

            reject({
                reason: "Unknown",
                details: normalizeErrorDetails(error),
                originalError: error,
            } satisfies FetchPromiseError);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }) as CancellablePromise<T>;

    promise.cancel = () => {
        if (cancelled) return;
        cancelled = true;
        controller.abort();
    };

    return promise;
};

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
export const createFetchClient = (defaults: FetchClientDefaults = {}) => {
    return <T = unknown>(params: FetchPromiseParams): CancellablePromise<T> => {
        const runDefaultOnRequest = defaults.onRequest;
        const runParamOnRequest = params.onRequest;

        return FetchPromise<T>({
            ...defaults,
            ...params,
            method: params.method ?? defaults.method ?? "GET",
            headers: mergeHeaders(defaults.headers, params.headers),
            onRequest: async request => {
                let nextRequest = request;
                if (runDefaultOnRequest) {
                    const maybeDefaultUpdated = await runDefaultOnRequest(nextRequest);
                    if (maybeDefaultUpdated) {
                        nextRequest = maybeDefaultUpdated;
                    }
                }
                if (runParamOnRequest) {
                    const maybeParamUpdated = await runParamOnRequest(nextRequest);
                    if (maybeParamUpdated) {
                        nextRequest = maybeParamUpdated;
                    }
                }
                return nextRequest;
            },
            validateStatus: params.validateStatus ?? defaults.validateStatus,
            getAuthToken: params.getAuthToken ?? defaults.getAuthToken,
        });
    };
};

export default FetchPromise;
