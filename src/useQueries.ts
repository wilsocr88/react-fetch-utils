import { useCallback, useRef, useState } from "react";
import { CancellablePromise } from "./FetchPromise";

export default function useQueries() {
    const listRef = useRef<CancellablePromise[]>([]);
    const [list, setList] = useState<CancellablePromise[]>([]);

    const syncList = useCallback(() => {
        setList([...listRef.current]);
    }, []);

    const cancelAll = useCallback(() => {
        if (listRef.current.length === 0) return;
        listRef.current.forEach(query => query.cancel());
        listRef.current = [];
        syncList();
    }, [syncList]);

    const add = useCallback(
        (query: CancellablePromise) => {
            listRef.current = [...listRef.current, query];
            syncList();
        },
        [syncList]
    );

    const remove = useCallback(
        (query: CancellablePromise) => {
            listRef.current = listRef.current.filter(activeQuery => activeQuery !== query);
            syncList();
        },
        [syncList]
    );

    return {
        list,
        cancelAll,
        add,
        remove,
    };
}
