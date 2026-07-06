"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  FetchPromise: () => FetchPromise_default,
  statusEnum: () => statusEnum,
  useQueries: () => useQueries,
  useRequest: () => useRequest
});
module.exports = __toCommonJS(index_exports);

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
var import_react = require("react");
function useQueries() {
  const [list, setList] = (0, import_react.useState)([]);
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
var import_react2 = require("react");
var statusEnum = {
  0: "idle",
  1: "fetching",
  2: "done"
};
var useRequest = (fetchPromise, disableCache = false) => {
  const cache = (0, import_react2.useRef)({});
  const queries = useQueries();
  const [status, setStatus] = (0, import_react2.useState)(0);
  const [response, setResponse] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FetchPromise,
  statusEnum,
  useQueries,
  useRequest
});
