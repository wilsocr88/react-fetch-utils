import { useCallback, useRef, useState } from "react";
import { CancellablePromise } from "./FetchPromise";

/**
 * Status of a tracked query
 */
export type QueryStatus = "idle" | "loading" | "success" | "error";

/**
 * Result object from useQueries hook
 */
export type UseQueriesResult = {
    /** Array of currently tracked queries */
    list: CancellablePromise[];
    /** Cancel all tracked queries and clear the list */
    cancelAll: () => void;
    /** Add a query to the tracked list */
    add: (query: CancellablePromise) => void;
    /** Remove a query from the tracked list */
    remove: (query: CancellablePromise) => void;
    /** Get aggregated status: 'idle' (empty), 'loading' (any loading), 'error' (any error), 'success' (all done) */
    getStatus: () => QueryStatus;
    /** Refetch all queries (re-execute all stored promises) */
    refetchAll: (queries: (() => CancellablePromise)[]) => void;
};

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
 * const status = queries.getStatus(); // 'loading', 'success', 'error', or 'idle'
 *
 * useEffect(() => {
 *   return () => queries.cancelAll(); // Clean up on unmount
 * }, [queries]);
 * ```
 */
export default function useQueries(): UseQueriesResult {
    const listRef = useRef<CancellablePromise[]>([]);
    const [list, setList] = useState<CancellablePromise[]>([]);
    const statusMapRef = useRef<Map<CancellablePromise, QueryStatus>>(new Map());

    const syncList = useCallback(() => {
        setList([...listRef.current]);
    }, []);

    /**
     * Cancel all tracked queries and clear the list
     */
    const cancelAll = useCallback(() => {
        if (listRef.current.length === 0) return;
        listRef.current.forEach(query => query.cancel());
        listRef.current = [];
        statusMapRef.current.clear();
        syncList();
    }, [syncList]);

    /**
     * Add a query to the tracked list
     * @param query - CancellablePromise to track
     */
    const add = useCallback(
        (query: CancellablePromise) => {
            listRef.current = [...listRef.current, query];
            statusMapRef.current.set(query, "loading");

            query
                .then(() => {
                    statusMapRef.current.set(query, "success");
                })
                .catch(() => {
                    statusMapRef.current.set(query, "error");
                });

            syncList();
        },
        [syncList]
    );

    /**
     * Remove a query from the tracked list
     * @param query - CancellablePromise to stop tracking
     */
    const remove = useCallback(
        (query: CancellablePromise) => {
            listRef.current = listRef.current.filter(activeQuery => activeQuery !== query);
            statusMapRef.current.delete(query);
            syncList();
        },
        [syncList]
    );

    /**
     * Get aggregated status of all tracked queries
     * @returns 'idle' if no queries, 'loading' if any loading, 'error' if any failed, 'success' if all done
     */
    const getStatus = useCallback((): QueryStatus => {
        if (listRef.current.length === 0) return "idle";
        const statuses = Array.from(statusMapRef.current.values());
        if (statuses.some(s => s === "loading")) return "loading";
        if (statuses.some(s => s === "error")) return "error";
        return "success";
    }, []);

    /**
     * Refetch all queries by re-executing the provided factory functions
     * @param queries - Array of query factory functions to execute
     */
    const refetchAll = useCallback(
        (queries: (() => CancellablePromise)[]) => {
            cancelAll();
            queries.forEach(factory => {
                const newQuery = factory();
                add(newQuery);
            });
        },
        [add, cancelAll]
    );

    return {
        list,
        cancelAll,
        add,
        remove,
        getStatus,
        refetchAll,
    };
}
