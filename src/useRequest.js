import { useState, useRef, useEffect } from "react";
import useQueries from "./useQueries";

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
};

/**
 *
 * @param {FetchPromise} fetchPromise A promise with a .cancel() method which calls AbortController.abort()
 * @param {Boolean} disableCache Disable cache and force a re-fetch every time this hook is consumed
 * @returns {Number, Object} { status, response }
 */
export const useRequest = (fetchPromise, disableCache = false) => {
    const cache = useRef({});
    const queries = useQueries();
    const [status, setStatus] = useState(0);
    const [response, setResponse] = useState({});

    useEffect(() => {
        if (!fetchPromise) return;
        setStatus(1);
        if (cache.current[fetchPromise.name] && !disableCache) {
            setResponse(cache.current[fetchPromise.name]);
        } else {
            queries.cancelAll();
            const query = fetchPromise();
            queries.add(query);
            query.then(res => {
                queries.remove(query);
                cache.current = res;
                setResponse(res);
                setStatus(2);
            });
        }
    }, []);

    return { status, response };
};
