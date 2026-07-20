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
        reject({
          reason: "Unauthorized",
          status: 401,
          response,
          details: response
        });
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
      let responseData;
      if (parseAs === "response") {
        responseData = response;
      } else if (parseAs === "raw") {
        responseData = await response.blob();
      } else if (parseAs === "text") {
        responseData = await response.text();
      } else {
        responseData = await parseJsonSafely(response);
      }
      if (params.onResponse) {
        const interceptedData = await params.onResponse({
          status: response.status,
          headers: response.headers,
          data: responseData,
          response
        });
        responseData = interceptedData;
      }
      resolve(responseData);
    } catch (error) {
      if (timedOut && (error == null ? void 0 : error.name) === "AbortError") {
        reject({
          reason: "Timeout",
          timeoutMs: params.timeoutMs,
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
    const runDefaultOnResponse = defaults.onResponse;
    const runParamOnResponse = params.onResponse;
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
      onResponse: async (response) => {
        let nextData = response.data;
        if (runDefaultOnResponse) {
          nextData = await runDefaultOnResponse(response);
        }
        if (runParamOnResponse) {
          nextData = await runParamOnResponse(__spreadProps(__spreadValues({}, response), { data: nextData }));
        }
        return nextData;
      },
      validateStatus: (_c = params.validateStatus) != null ? _c : defaults.validateStatus,
      getAuthToken: (_d = params.getAuthToken) != null ? _d : defaults.getAuthToken
    }));
  };
};
var isUnauthorizedError = (error) => {
  return typeof error === "object" && error !== null && error.reason === "Unauthorized";
};
var isTimeoutError = (error) => {
  return typeof error === "object" && error !== null && error.reason === "Timeout";
};
var isUnknownError = (error) => {
  return typeof error === "object" && error !== null && error.reason === "Unknown";
};
var FetchPromise_default = FetchPromise;

// src/useQueries.ts
import { useCallback, useRef, useState } from "react";
function useQueries() {
  const listRef = useRef([]);
  const [list, setList] = useState([]);
  const statusMapRef = useRef(/* @__PURE__ */ new Map());
  const syncList = useCallback(() => {
    setList([...listRef.current]);
  }, []);
  const cancelAll = useCallback(() => {
    if (listRef.current.length === 0) return;
    listRef.current.forEach((query) => query.cancel());
    listRef.current = [];
    statusMapRef.current.clear();
    syncList();
  }, [syncList]);
  const add = useCallback(
    (query) => {
      listRef.current = [...listRef.current, query];
      statusMapRef.current.set(query, "loading");
      query.then(() => {
        statusMapRef.current.set(query, "success");
      }).catch(() => {
        statusMapRef.current.set(query, "error");
      });
      syncList();
    },
    [syncList]
  );
  const remove = useCallback(
    (query) => {
      listRef.current = listRef.current.filter((activeQuery) => activeQuery !== query);
      statusMapRef.current.delete(query);
      syncList();
    },
    [syncList]
  );
  const getStatus = useCallback(() => {
    if (listRef.current.length === 0) return "idle";
    const statuses = Array.from(statusMapRef.current.values());
    if (statuses.some((s) => s === "loading")) return "loading";
    if (statuses.some((s) => s === "error")) return "error";
    return "success";
  }, []);
  const refetchAll = useCallback(
    (queries) => {
      cancelAll();
      queries.forEach((factory) => {
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
    refetchAll
  };
}

// src/useRequest.ts
import { useState as useState2, useRef as useRef2, useEffect, useMemo, useCallback as useCallback2 } from "react";
var statusEnum = {
  0: "idle",
  1: "fetching",
  2: "done",
  3: "error"
};
var STATUS = {
  /** No request has been made or hook is disabled */
  IDLE: 0,
  /** Request is in progress */
  LOADING: 1,
  /** Request completed successfully */
  SUCCESS: 2,
  /** Request failed with an error */
  ERROR: 3
};
var hashString = (value) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = hash * 33 ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};
var resolveCacheKey = (fetchPromise, explicitCacheKey) => {
  var _a;
  if (explicitCacheKey) return explicitCacheKey;
  if (!fetchPromise) return "";
  const functionName = (_a = fetchPromise.name) == null ? void 0 : _a.trim();
  if (functionName) return `fn:${functionName}`;
  return `anon:${hashString(fetchPromise.toString())}`;
};
var isAbortError = (error) => {
  var _a, _b, _c;
  if (!error || typeof error !== "object") return false;
  const maybeError = error;
  if (maybeError.name === "AbortError") return true;
  if (((_a = maybeError.details) == null ? void 0 : _a.name) === "AbortError") return true;
  if (((_c = (_b = maybeError.details) == null ? void 0 : _b.abortError) == null ? void 0 : _c.name) === "AbortError") return true;
  return false;
};
var sharedCache = /* @__PURE__ */ new Map();
var inFlightByKey = /* @__PURE__ */ new Map();
var isCacheFresh = (entry, staleTimeMs) => {
  if (!entry) return false;
  if (!Number.isFinite(staleTimeMs)) return true;
  return Date.now() - entry.updatedAt <= staleTimeMs;
};
var useRequest = (fetchPromise, disableCacheOrOptions = false) => {
  var _a, _b, _c, _d, _e;
  const options = useMemo(
    () => typeof disableCacheOrOptions === "boolean" ? { disableCache: disableCacheOrOptions } : disableCacheOrOptions,
    [disableCacheOrOptions]
  );
  const disableCache = (_a = options.disableCache) != null ? _a : false;
  const enabled = (_b = options.enabled) != null ? _b : true;
  const staleTimeMs = (_c = options.staleTimeMs) != null ? _c : Number.POSITIVE_INFINITY;
  const dedupe = (_d = options.dedupe) != null ? _d : true;
  const deps = (_e = options.deps) != null ? _e : [];
  const cacheKey = useMemo(
    () => resolveCacheKey(fetchPromise, options.cacheKey),
    [fetchPromise, options.cacheKey]
  );
  const currentQueryRef = useRef2(null);
  const ownsCurrentQueryRef = useRef2(false);
  const requestIdRef = useRef2(0);
  const mountedRef = useRef2(false);
  const [status, setStatus] = useState2(0);
  const [response, setResponse] = useState2(null);
  const [error, setError] = useState2(null);
  const cancel = useCallback2(() => {
    var _a2;
    if (ownsCurrentQueryRef.current) {
      (_a2 = currentQueryRef.current) == null ? void 0 : _a2.cancel();
    }
    currentQueryRef.current = null;
    ownsCurrentQueryRef.current = false;
  }, []);
  const execute = useCallback2(
    (force = false) => {
      if (!fetchPromise || !enabled) return;
      const key = cacheKey;
      const sharedEntry = key.length > 0 ? sharedCache.get(key) : void 0;
      if (!disableCache && !force && isCacheFresh(sharedEntry, staleTimeMs)) {
        setError(null);
        setResponse(sharedEntry == null ? void 0 : sharedEntry.value);
        setStatus(2);
        return;
      }
      requestIdRef.current += 1;
      const activeRequestId = requestIdRef.current;
      cancel();
      const sharedInFlight = dedupe && key.length > 0 ? inFlightByKey.get(key) : void 0;
      const query = sharedInFlight != null ? sharedInFlight : fetchPromise();
      const ownsQuery = !sharedInFlight;
      if (ownsQuery && dedupe && key.length > 0) {
        inFlightByKey.set(key, query);
      }
      currentQueryRef.current = query;
      ownsCurrentQueryRef.current = ownsQuery;
      setStatus(1);
      setError(null);
      query.then((res) => {
        if (!mountedRef.current || requestIdRef.current !== activeRequestId) return;
        if (key.length > 0) {
          sharedCache.set(key, { value: res, updatedAt: Date.now() });
        }
        setResponse(res);
        setStatus(2);
      }).catch((err) => {
        if (!mountedRef.current || requestIdRef.current !== activeRequestId) return;
        if (isAbortError(err)) {
          setStatus(0);
          return;
        }
        setError(err);
        setStatus(3);
      }).then(() => {
        if (ownsQuery && key.length > 0 && inFlightByKey.get(key) === query) {
          inFlightByKey.delete(key);
        }
        if (currentQueryRef.current === query) {
          currentQueryRef.current = null;
          ownsCurrentQueryRef.current = false;
        }
      });
    },
    [cacheKey, cancel, dedupe, disableCache, enabled, fetchPromise, staleTimeMs]
  );
  const refetch = useCallback2(() => {
    execute(true);
  }, [execute]);
  const reset = useCallback2(() => {
    cancel();
    setError(null);
    setResponse(null);
    setStatus(0);
  }, [cancel]);
  useEffect(() => {
    mountedRef.current = true;
    execute(false);
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel, execute, ...deps]);
  return {
    status,
    response,
    error,
    refetch,
    cancel,
    reset
  };
};
export {
  FetchPromise_default as FetchPromise,
  STATUS,
  createFetchClient,
  isTimeoutError,
  isUnauthorizedError,
  isUnknownError,
  statusEnum,
  useQueries,
  useRequest
};
