import { useState, useRef, useEffect } from "react";
import useQueries from "./useQueries";
import { CancellablePromise } from "./FetchPromise";

/**
 * Status enumerator.
 * 0 = "idle"
 * 1 = "fetching"
 * 2 = "done"
 */
export const statusEnum = {
    0: "idle",
    1: "fetching",
    2: "done",
} as const;

export type Status = 0 | 1 | 2;

/**
 * @param fetchPromise - A factory function that returns a `CancellablePromise`
 * @param disableCache - Disable cache and force a re-fetch every time this hook runs
 * @returns `{ status, response }` where status is 0 (idle), 1 (fetching), or 2 (done)
 */
export const useRequest = <T = unknown>(
    fetchPromise: (() => CancellablePromise<T>) | null | undefined,
    disableCache = false
): { status: Status; response: T | null } => {
    const cache = useRef<Record<string, T>>({});
    const queries = useQueries();
    const [status, setStatus] = useState<Status>(0);
    const [response, setResponse] = useState<T | null>(null);

    useEffect(() => {
        if (!fetchPromise) return;
        setStatus(1);
        const cacheKey = fetchPromise.name;
        if (cache.current[cacheKey] && !disableCache) {
            setResponse(cache.current[cacheKey]);
            setStatus(2);
        } else {
            queries.cancelAll();
            const query = fetchPromise();
            queries.add(query);
            query.then(res => {
                queries.remove(query);
                cache.current[cacheKey] = res;
                setResponse(res);
                setStatus(2);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { status, response };
};
