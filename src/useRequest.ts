import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { CancellablePromise } from "./FetchPromise";

/**
 * Status enumerator for reverse lookup.
 * Maps status codes to human-readable strings:
 * - 0 = "idle"
 * - 1 = "fetching"
 * - 2 = "done"
 * - 3 = "error"
 */
export const statusEnum = {
    0: "idle",
    1: "fetching",
    2: "done",
    3: "error",
} as const;

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
export const STATUS = {
    /** No request has been made or hook is disabled */
    IDLE: 0,
    /** Request is in progress */
    LOADING: 1,
    /** Request completed successfully */
    SUCCESS: 2,
    /** Request failed with an error */
    ERROR: 3,
} as const;

/** Request status type. One of: 0 (idle), 1 (loading), 2 (success), 3 (error) */
export type Status = 0 | 1 | 2 | 3;

/** Configuration options for the useRequest hook */
export type UseRequestOptions = {
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
export type UseRequestResult<T> = {
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

const hashString = (value: string): string => {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
};

const resolveCacheKey = (
    fetchPromise: (() => CancellablePromise<unknown>) | null | undefined,
    explicitCacheKey?: string
) => {
    if (explicitCacheKey) return explicitCacheKey;
    if (!fetchPromise) return "";
    const functionName = fetchPromise.name?.trim();
    if (functionName) return `fn:${functionName}`;
    return `anon:${hashString(fetchPromise.toString())}`;
};

const isAbortError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;
    const maybeError = error as {
        name?: string;
        details?: { name?: string; abortError?: { name?: string } };
    };
    if (maybeError.name === "AbortError") return true;
    if (maybeError.details?.name === "AbortError") return true;
    if (maybeError.details?.abortError?.name === "AbortError") return true;
    return false;
};

type CacheEntry = {
    value: unknown;
    updatedAt: number;
};

const sharedCache = new Map<string, CacheEntry>();
const inFlightByKey = new Map<string, CancellablePromise<unknown>>();

const isCacheFresh = (entry: CacheEntry | undefined, staleTimeMs: number): boolean => {
    if (!entry) return false;
    if (!Number.isFinite(staleTimeMs)) return true;
    return Date.now() - entry.updatedAt <= staleTimeMs;
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
export const useRequest = <T = unknown>(
    fetchPromise: (() => CancellablePromise<T>) | null | undefined,
    disableCacheOrOptions: boolean | UseRequestOptions = false
): UseRequestResult<T> => {
    const options = useMemo<UseRequestOptions>(
        () =>
            typeof disableCacheOrOptions === "boolean"
                ? { disableCache: disableCacheOrOptions }
                : disableCacheOrOptions,
        [disableCacheOrOptions]
    );
    const disableCache = options.disableCache ?? false;
    const enabled = options.enabled ?? true;
    const staleTimeMs = options.staleTimeMs ?? Number.POSITIVE_INFINITY;
    const dedupe = options.dedupe ?? true;
    const deps = options.deps ?? [];
    const cacheKey = useMemo(
        () => resolveCacheKey(fetchPromise as (() => CancellablePromise<unknown>) | null | undefined, options.cacheKey),
        [fetchPromise, options.cacheKey]
    );
    const currentQueryRef = useRef<CancellablePromise<T> | null>(null);
    const ownsCurrentQueryRef = useRef(false);
    const requestIdRef = useRef(0);
    const mountedRef = useRef(false);

    const [status, setStatus] = useState<Status>(0);
    const [response, setResponse] = useState<T | null>(null);
    const [error, setError] = useState<unknown>(null);

    const cancel = useCallback(() => {
        if (ownsCurrentQueryRef.current) {
            currentQueryRef.current?.cancel();
        }
        currentQueryRef.current = null;
        ownsCurrentQueryRef.current = false;
    }, []);

    const execute = useCallback(
        (force = false) => {
            if (!fetchPromise || !enabled) return;

            const key = cacheKey;
            const sharedEntry = key.length > 0 ? sharedCache.get(key) : undefined;

            if (!disableCache && !force && isCacheFresh(sharedEntry, staleTimeMs)) {
                setError(null);
                setResponse(sharedEntry?.value as T);
                setStatus(2);
                return;
            }

            requestIdRef.current += 1;
            const activeRequestId = requestIdRef.current;

            cancel();

            const sharedInFlight = dedupe && key.length > 0 ? inFlightByKey.get(key) : undefined;
            const query = (sharedInFlight ?? fetchPromise()) as CancellablePromise<T>;
            const ownsQuery = !sharedInFlight;

            if (ownsQuery && dedupe && key.length > 0) {
                inFlightByKey.set(key, query as CancellablePromise<unknown>);
            }

            currentQueryRef.current = query;
            ownsCurrentQueryRef.current = ownsQuery;

            setStatus(1);
            setError(null);

            query
                .then(res => {
                    if (!mountedRef.current || requestIdRef.current !== activeRequestId) return;
                    if (key.length > 0) {
                        sharedCache.set(key, { value: res, updatedAt: Date.now() });
                    }
                    setResponse(res);
                    setStatus(2);
                })
                .catch(err => {
                    if (!mountedRef.current || requestIdRef.current !== activeRequestId) return;
                    if (isAbortError(err)) {
                        setStatus(0);
                        return;
                    }
                    setError(err);
                    setStatus(3);
                })
                .then(() => {
                    if (ownsQuery && key.length > 0 && inFlightByKey.get(key) === query) {
                        inFlightByKey.delete(key);
                    }
                    if (currentQueryRef.current === query) {
                        currentQueryRef.current = null;
                        ownsCurrentQueryRef.current = false;
                    }
                });
        },
        [cacheKey, cancel, dedupe, disableCache, enabled, fetchPromise, staleTimeMs]
    );

    const refetch = useCallback(() => {
        execute(true);
    }, [execute]);

    const reset = useCallback(() => {
        cancel();
        setError(null);
        setResponse(null);
        setStatus(0);
    }, [cancel]);

    useEffect(() => {
        mountedRef.current = true;
        execute(false);

        return () => {
            mountedRef.current = false;
            cancel();
        };
    }, [cancel, execute, ...deps]);

    return {
        status,
        response,
        error,
        refetch,
        cancel,
        reset,
    };
};
