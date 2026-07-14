import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { CancellablePromise } from "./FetchPromise";

/**
 * Status enumerator.
 * 0 = "idle"
 * 1 = "fetching"
 * 2 = "done"
 * 3 = "error"
 */
export const statusEnum = {
    0: "idle",
    1: "fetching",
    2: "done",
    3: "error",
} as const;

export type Status = 0 | 1 | 2 | 3;

export type UseRequestOptions = {
    disableCache?: boolean;
    cacheKey?: string;
    enabled?: boolean;
    deps?: ReadonlyArray<unknown>;
    staleTimeMs?: number;
    dedupe?: boolean;
};

export type UseRequestResult<T> = {
    status: Status;
    response: T | null;
    error: unknown;
    refetch: () => void;
    cancel: () => void;
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
 * @param fetchPromise - A factory function that returns a `CancellablePromise`
 * @param disableCacheOrOptions - Disable cache via boolean (legacy) or provide options
 * @returns Hook state and controls for request status, response, and retries
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
