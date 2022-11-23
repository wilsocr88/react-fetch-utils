import { useState, useRef, useEffect } from "react";

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
 * @param {Promise} fetchPromise Promise function with fetch call
 * @param {Boolean} disableCache Disable cache and force a re-fetch every time this hook is consumed
 * @returns {Number, Object} { status, response }
 */
export const useRequest = (fetchPromise, disableCache = false) => {
    const cache = useRef({});
    const [status, setStatus] = useState(0);
    const [response, setResponse] = useState({});

    useEffect(() => {
        if (!fetchPromise) return;
        setStatus(1);
        if (cache.current[fetchPromise.name] && !disableCache) {
            setResponse(cache.current[fetchPromise.name]);
        } else {
            fetchPromise().then(res => {
                cache.current = res;
                setResponse(res);
                setStatus(2);
            });
        }
    }, []);

    return { status, response };
};
