import { useState } from "react";
import { CancellablePromise } from "./FetchPromise";

export default function useQueries() {
    const [list, setList] = useState<CancellablePromise[]>([]);
    return {
        list,
        cancelAll: () => {
            const tempList = [...list];
            if (tempList.length > 0) {
                tempList.forEach(q => q.cancel());
                setList([]);
            }
        },
        add: (query: CancellablePromise) => {
            setList(prev => [...prev, query]);
        },
        remove: (query: CancellablePromise) => {
            setList(prev => prev.filter(q => q !== query));
        },
    };
}
