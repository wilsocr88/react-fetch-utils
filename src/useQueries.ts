import { useCallback, useRef, useState } from "react";
import { CancellablePromise } from "./FetchPromise";

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
export default function useQueries() {
    const listRef = useRef<CancellablePromise[]>([]);
    const [list, setList] = useState<CancellablePromise[]>([]);

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
        syncList();
    }, [syncList]);

    /**
     * Add a query to the tracked list
     * @param query - CancellablePromise to track
     */
    const add = useCallback(
        (query: CancellablePromise) => {
            listRef.current = [...listRef.current, query];
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
            syncList();
        },
        [syncList]
    );

    return {
        /** Array of currently tracked queries */
        list,
        cancelAll,
        add,
        remove,
    };
}
