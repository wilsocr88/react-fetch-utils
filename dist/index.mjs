var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

// src/FetchPromise.ts
var METHODS_WITH_DEFAULT_BODY = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH"]);
var METHODS_WITHOUT_BODY = /* @__PURE__ */ new Set(["GET", "HEAD"]);
var isBodyInitLike = (value) => {
  if (typeof value === "string") return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) return true;
  return false;
};
var mapParseMode = (parseAs, respType) => {
  if (parseAs) return parseAs;
  if (respType === "raw") return "raw";
  return "json";
};
var mergeHeaders = (defaults, overrides) => {
  const headers = new Headers(defaults != null ? defaults : {});
  if (overrides) {
    new Headers(overrides).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
};
var resolveUrl = (url, baseUrl) => {
  if (!baseUrl) return url;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) || url.startsWith("//")) {
    return url;
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
};
var parseJsonSafely = async (response) => {
  if (response.status === 204 || response.status === 205) {
    return void 0;
  }
  const text = await response.text();
  if (!text.trim()) {
    return void 0;
  }
  return JSON.parse(text);
};
var normalizeErrorDetails = (error) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return error;
};
var FetchPromise = (params) => {
  const controller = new AbortController();
  const signal = controller.signal;
  let timeoutId;
  let timedOut = false;
  let cancelled = false;
  const promise = new Promise(async function(resolve, reject) {
    try {
      const method = params.method.toUpperCase();
      const parseAs = mapParseMode(params.parseAs, params.respType);
      const headers = mergeHeaders(void 0, params.headers);
      if (!headers.has("Accept")) {
        if (parseAs === "raw") {
          headers.set("Accept", "blob");
        } else if (parseAs === "json") {
          headers.set("Accept", "application/json");
        } else {
          headers.set("Accept", "*/*");
        }
      }
      if (!headers.has("Authorization") && params.getAuthToken) {
        const token = await params.getAuthToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }
      const hasBodyValue = params.body !== void 0 && params.body !== null;
      const allowsBody = !METHODS_WITHOUT_BODY.has(method) || params.allowBodyForGetHead === true;
      const shouldSendBody = hasBodyValue && allowsBody;
      let body;
      let isJsonBody = false;
      if (shouldSendBody) {
        if (isBodyInitLike(params.body)) {
          body = params.body;
        } else {
          body = JSON.stringify(params.body);
          isJsonBody = true;
        }
      }
      if (shouldSendBody && isJsonBody && params.includeContentType !== false && !headers.has("Content-Type") && METHODS_WITH_DEFAULT_BODY.has(method)) {
        headers.set("Content-Type", "application/json");
      }
      const requestConfig = {
        url: resolveUrl(params.url, params.baseUrl),
        init: {
          method,
          signal,
          headers,
          body
        },
        headers
      };
      if (params.onRequest) {
        const maybeUpdatedConfig = await params.onRequest(requestConfig);
        if (maybeUpdatedConfig) {
          requestConfig.url = maybeUpdatedConfig.url;
          requestConfig.init = maybeUpdatedConfig.init;
          requestConfig.headers = maybeUpdatedConfig.headers;
        }
      }
      if (typeof params.timeoutMs === "number" && params.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, params.timeoutMs);
      }
      const response = await fetch(requestConfig.url, __spreadProps(__spreadValues({}, requestConfig.init), {
        signal,
        headers: requestConfig.headers
      }));
      if (response.status === 401) {
        reject({ reason: "Unauthorized", details: response, status: 401, response });
        return;
      }
      const isValid = params.validateStatus ? params.validateStatus(response.status, response) : response.ok;
      if (!isValid) {
        reject({
          reason: "Unknown",
          details: {
            status: response.status,
            statusText: response.statusText,
            response
          },
          status: response.status,
          response
        });
        return;
      }
      if (parseAs === "response") {
        resolve(response);
        return;
      }
      if (parseAs === "raw") {
        resolve(await response.blob());
        return;
      }
      if (parseAs === "text") {
        resolve(await response.text());
        return;
      }
      resolve(await parseJsonSafely(response));
    } catch (error) {
      if (timedOut && (error == null ? void 0 : error.name) === "AbortError") {
        reject({
          reason: "Timeout",
          details: {
            timeoutMs: params.timeoutMs,
            abortError: normalizeErrorDetails(error)
          },
          originalError: error
        });
        return;
      }
      reject({
        reason: "Unknown",
        details: normalizeErrorDetails(error),
        originalError: error
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  });
  promise.cancel = () => {
    if (cancelled) return;
    cancelled = true;
    controller.abort();
  };
  return promise;
};
var createFetchClient = (defaults = {}) => {
  return (params) => {
    var _a, _b, _c, _d;
    const runDefaultOnRequest = defaults.onRequest;
    const runParamOnRequest = params.onRequest;
    return FetchPromise(__spreadProps(__spreadValues(__spreadValues({}, defaults), params), {
      method: (_b = (_a = params.method) != null ? _a : defaults.method) != null ? _b : "GET",
      headers: mergeHeaders(defaults.headers, params.headers),
      onRequest: async (request) => {
        let nextRequest = request;
        if (runDefaultOnRequest) {
          const maybeDefaultUpdated = await runDefaultOnRequest(nextRequest);
          if (maybeDefaultUpdated) {
            nextRequest = maybeDefaultUpdated;
          }
        }
        if (runParamOnRequest) {
          const maybeParamUpdated = await runParamOnRequest(nextRequest);
          if (maybeParamUpdated) {
            nextRequest = maybeParamUpdated;
          }
        }
        return nextRequest;
      },
      validateStatus: (_c = params.validateStatus) != null ? _c : defaults.validateStatus,
      getAuthToken: (_d = params.getAuthToken) != null ? _d : defaults.getAuthToken
    }));
  };
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
  createFetchClient,
  statusEnum,
  useQueries,
  useRequest
};
