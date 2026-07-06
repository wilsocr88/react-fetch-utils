// src/FetchPromise.ts
var FetchPromise = (params) => {
  const controller = new AbortController();
  const signal = controller.signal;
  const promise = new Promise(async function(resolve, reject) {
    const headers = {
      Accept: params.respType === "raw" ? "blob" : "application/json",
      "Content-Type": "application/json"
    };
    await fetch(params.url, {
      method: params.method,
      signal,
      headers,
      body: JSON.stringify(params.body)
    }).then((response) => {
      if (response.status === 401) {
        reject({ reason: "Unauthorized", details: response });
      }
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      if (params.respType === "raw") {
        return response.blob();
      }
      return response.json();
    }).then((data) => {
      if (data !== void 0) resolve(data);
    }).catch((error) => {
      reject({ reason: "Unknown", details: error });
    });
  });
  promise.cancel = () => controller.abort();
  return promise;
};
var FetchPromise_default = FetchPromise;

// src/useQueries.ts
import { useState } from "react";
function useQueries() {
  const [list, setList] = useState([]);
  return {
    list,
    cancelAll: () => {
      const tempList = [...list];
      if (tempList.length > 0) {
        tempList.forEach((q) => q.cancel());
        setList([]);
      }
    },
    add: (query) => {
      setList((prev) => [...prev, query]);
    },
    remove: (query) => {
      setList((prev) => prev.filter((q) => q !== query));
    }
  };
}

// src/useRequest.ts
import { useState as useState2, useRef, useEffect } from "react";
var statusEnum = {
  0: "idle",
  1: "fetching",
  2: "done"
};
var useRequest = (fetchPromise, disableCache = false) => {
  const cache = useRef({});
  const queries = useQueries();
  const [status, setStatus] = useState2(0);
  const [response, setResponse] = useState2(null);
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
      query.then((res) => {
        queries.remove(query);
        cache.current[cacheKey] = res;
        setResponse(res);
        setStatus(2);
      });
    }
  }, []);
  return { status, response };
};
export {
  FetchPromise_default as FetchPromise,
  statusEnum,
  useQueries,
  useRequest
};
