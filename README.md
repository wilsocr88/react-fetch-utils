# react-fetch-utils

![license](https://img.shields.io/npm/l/react-fetch-utils)
![version](https://img.shields.io/npm/v/react-fetch-utils)

Lightweight React hooks and utilities for fetch requests with cancellation support.

## Install

```bash
npm install react-fetch-utils
```

## Requirements

- React 16.8+
- Node 18+ (for package development/build tooling)

## Import

```ts
import {
    FetchPromise,
    createFetchClient,
    useQueries,
    useRequest,
    STATUS,           // Constants for readable status checks
    statusEnum,        // Legacy reverse lookup (0 -> "idle", etc.)
    isUnauthorizedError,  // Type guard for 401 errors
    isTimeoutError,       // Type guard for timeout errors
    isUnknownError,       // Type guard for other errors
    type CancellablePromise,
    type FetchClientDefaults,
    type FetchPromiseError,
    type FetchResponseConfig,
    type UnauthorizedError,
    type TimeoutError,
    type UnknownError,
    type FetchPromiseParams,
    type FetchRequestConfig,
    type Status,
    type UseRequestOptions,
    type UseRequestResult,
} from "react-fetch-utils";
```

## Exports

- `FetchPromise` - Create a cancellable fetch request
- `createFetchClient` - Create a reusable API client with defaults
- `useQueries` - Track multiple in-flight requests with status aggregation
- `useRequest` - React hook for fetch with caching & lifecycle management
- `STATUS` - Status constants (IDLE, LOADING, SUCCESS, ERROR)
- `statusEnum` - Reverse lookup map for status codes (legacy)
- `isUnauthorizedError` - Type guard for UnauthorizedError
- `isTimeoutError` - Type guard for TimeoutError
- `isUnknownError` - Type guard for UnknownError
- **Types:**
  - `CancellablePromise`
  - `FetchClientDefaults`
  - `FetchPromiseError` (discriminated union of error types)
  - `UnauthorizedError` (401 response)
  - `TimeoutError` (request timeout)
  - `UnknownError` (other failures)
  - `FetchResponseConfig` (passed to onResponse interceptor)
  - `FetchPromiseParams`
  - `FetchRequestConfig`
  - `Status`
  - `UseRequestOptions`
  - `UseRequestResult`
- `FetchPromiseParams` (type)
- `FetchRequestConfig` (type)
- `Status` (type)
- `UseRequestOptions` (type)
- `UseRequestResult` (type)

## Quick Start

```tsx
import { useEffect } from "react";
import { FetchPromise, useRequest, STATUS } from "react-fetch-utils";

type Todo = { id: number; title: string; completed: boolean };

function getTodo() {
    return FetchPromise<Todo>({
        url: "https://jsonplaceholder.typicode.com/todos/1",
        method: "GET",
    });
}

export function TodoCard() {
    const { status, response, error } = useRequest(getTodo);

    useEffect(() => {
        if (status !== STATUS.SUCCESS || !response) return;
        console.log("Loaded:", response.title);
    }, [status, response]);

    if (status === STATUS.IDLE) return <p>Idle</p>;
    if (status === STATUS.LOADING) return <p>Loading...</p>;
    if (status === STATUS.ERROR) return <p>Error: {String(error)}</p>;
    return <p>{response?.title}</p>;
}
```

## API

### `FetchPromise`

Creates a cancellable promise around `fetch`.

Signature:

```ts
function FetchPromise<T = unknown>(
    params: FetchPromiseParams,
): CancellablePromise<T>;
```

`FetchPromiseParams`:

```ts
type FetchPromiseParams = {
    url: string;
    method: string;
    body?: unknown;
    headers?: HeadersInit | Record<string, string>;
    timeoutMs?: number;
    baseUrl?: string;
    includeContentType?: boolean;
    parseAs?: "json" | "raw" | "text" | "response";
    onRequest?: (
        request: FetchRequestConfig,
    ) => FetchRequestConfig | void | Promise<FetchRequestConfig | void>;
    validateStatus?: (status: number, response: Response) => boolean;
    getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
    allowBodyForGetHead?: boolean;
};
```

Behavior:

- Parsing mode via `parseAs`:
  - `json` (default)
  - `raw` (`Blob`)
  - `text` (`string`)
  - `response` (`Response`)
- Supports request timeout with `timeoutMs` using `AbortController`.
- Supports base URL joining with `baseUrl`.
- Supports request customization with `headers`, `onRequest`, `validateStatus`, and `getAuthToken`.
- `Accept` is set automatically only when caller did not provide it.
- `Content-Type: application/json` is added only when:
  - there is a body,
  - method is `POST`/`PUT`/`PATCH`,
  - `includeContentType !== false`,
  - caller did not already provide `Content-Type`.
- Request body behavior:
  - `GET`/`HEAD` bodies are not sent by default.
  - use `allowBodyForGetHead: true` to allow body on `GET`/`HEAD`.
  - non-JSON bodies (`FormData`, `Blob`, `string`, `URLSearchParams`, etc.) are passed through unchanged.
  - plain objects/values are JSON-stringified when body is allowed.
- Error model:
  - `401` rejects with `{ reason: "Unauthorized", details: Response }`
  - timeout abort rejects with `{ reason: "Timeout", details: ... }`
  - other failures reject with `{ reason: "Unknown", details: ... }`
- Returned promise remains cancellable with `.cancel()` and is safe to call repeatedly.

Example (JSON):

```ts
import { FetchPromise } from "react-fetch-utils";

type User = { id: number; name: string };

export function getUser() {
    return FetchPromise<User>({
        url: "/user",
        method: "POST",
        baseUrl: "https://api.example.com/v1",
        body: { includeDetails: true },
        timeoutMs: 8000,
        getAuthToken: () => localStorage.getItem("token"),
    });
}
```

Example (`text` parse mode + custom status validation):

```ts
import { FetchPromise } from "react-fetch-utils";

export function getHealth() {
    return FetchPromise<string>({
        url: "/health",
        method: "GET",
        parseAs: "text",
        validateStatus: status => status >= 200 && status < 500,
    });
}
```

Example (full `Response` mode):

```ts
import { FetchPromise } from "react-fetch-utils";

export function getRawResponse() {
    return FetchPromise<Response>({
        url: "/diagnostics",
        method: "GET",
        parseAs: "response",
    });
}
```

Example (raw `Blob` + cancellation):

```ts
import { FetchPromise } from "react-fetch-utils";

const download = FetchPromise<Blob>({
    url: "/api/report",
    method: "GET",
    parseAs: "raw",
});

// Cancel if no longer needed
download.cancel();
```

### `createFetchClient`

Creates a reusable request function with merged defaults so app code does not need a custom API wrapper utility.

Signature:

```ts
function createFetchClient(
    defaults?: FetchClientDefaults,
): <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;
```

Example (replace a custom `APIRequest` utility):

```ts
import { createFetchClient } from "react-fetch-utils";

export const apiRequest = createFetchClient({
    baseUrl: "https://api.example.com/v1",
    timeoutMs: 10000,
    headers: {
        "X-App-Client": "web",
    },
    getAuthToken: async () => localStorage.getItem("access_token"),
    validateStatus: status => status >= 200 && status < 300,
    onRequest: request => {
        request.headers.set("X-Trace-Id", crypto.randomUUID());
    },
});

export const getProfile = () =>
    apiRequest<{ id: string; name: string }>({
        url: "/profile",
        method: "GET",
        parseAs: "json",
    });

export const downloadReport = () =>
    apiRequest<Blob>({
        url: "/reports/monthly",
        method: "GET",
        parseAs: "raw",
    });
```

Example (`FormData` upload without forced JSON content-type):

```ts
const formData = new FormData();
formData.append("file", file);

apiRequest({
    url: "/upload",
    method: "POST",
    body: formData,
});
```

Example (response interceptor for data transformation):

```ts
import { createFetchClient, type FetchResponseConfig } from "react-fetch-utils";

// Transform all responses to add a timestamp
export const apiRequest = createFetchClient({
    baseUrl: "https://api.example.com/v1",
    onResponse: async (response: FetchResponseConfig) => {
        // Wrap response data with metadata
        return {
            data: response.data,
            fetchedAt: new Date(),
            status: response.status,
        };
    },
});
```

Example (response interceptor for error handling):

```ts
// Add request/response logging and error transformation
export const apiRequest = createFetchClient({
    baseUrl: "https://api.example.com/v1",
    onRequest: (request) => {
        console.log("Request:", request.url, request.init.method);
        return request;
    },
    onResponse: async (response: FetchResponseConfig) => {
        console.log("Response:", response.status, response.data);
        // Custom error handling or transformation
        if (response.status >= 400) {
            throw new Error(`API Error: ${response.status}`);
        }
        return response.data;
    },
});
```

### `useQueries`

Tracks active cancellable promises with status aggregation and batch refetch.

Signature:

```ts
function useQueries(): {
    list: CancellablePromise[];
    cancelAll: () => void;
    add: (query: CancellablePromise) => void;
    remove: (query: CancellablePromise) => void;
    getStatus: () => "idle" | "loading" | "success" | "error";
    refetchAll: (queries: (() => CancellablePromise)[]) => void;
};
```

**Status aggregation:**

- `idle` - No active queries
- `loading` - At least one query is in progress
- `error` - At least one query failed
- `success` - All queries completed successfully

Example (basic tracking):

```tsx
import { useEffect } from "react";
import { FetchPromise, useQueries } from "react-fetch-utils";

export function SearchBox({ term }: { term: string }) {
    const queries = useQueries();

    useEffect(() => {
        // Cancel older in-flight requests before starting a new one
        queries.cancelAll();

        const query = FetchPromise({
            url: `/api/search?q=${encodeURIComponent(term)}`,
            method: "GET",
        });

        queries.add(query);

        query
            .then(result => {
                console.log(result);
            })
            .catch(error => {
                // Abort rejections are surfaced in error.details
                if (error?.details?.name === "AbortError") return;
                console.error(error);
            })
            .finally(() => {
                queries.remove(query);
            });
    }, [term]);

    return <div>Active queries: {queries.list.length}</div>;
}
```

Example (status aggregation and batch refetch):

```tsx
import { useEffect } from "react";
import { FetchPromise, useQueries } from "react-fetch-utils";

function fetchUser() {
    return FetchPromise({ url: "/api/user", method: "GET" });
}

function fetchPosts() {
    return FetchPromise({ url: "/api/posts", method: "GET" });
}

function fetchComments() {
    return FetchPromise({ url: "/api/comments", method: "GET" });
}

export function Dashboard() {
    const queries = useQueries();
    const status = queries.getStatus();

    const handleLoadAll = () => {
        queries.refetchAll([fetchUser, fetchPosts, fetchComments]);
    };

    useEffect(() => {
        handleLoadAll();
        return () => queries.cancelAll();
    }, []);

    if (status === "idle") return <p>Ready</p>;
    if (status === "loading") return <p>Loading...</p>;
    if (status === "error") return <p>Failed to load data</p>;
    
    return (
        <div>
            <p>All data loaded ({queries.list.length} queries)</p>
            <button onClick={handleLoadAll}>Refresh All</button>
        </div>
    );
}
```

### `useRequest`

Runs a cancellable request factory with error handling, cancellation, and optional dependency-driven reruns.

Signature:

```ts
function useRequest<T = unknown>(
    fetchPromise: (() => CancellablePromise<T>) | null | undefined,
    disableCacheOrOptions?: boolean | UseRequestOptions,
): UseRequestResult<T>;

type UseRequestOptions = {
    disableCache?: boolean;
    cacheKey?: string;
    enabled?: boolean;
    deps?: ReadonlyArray<unknown>;
    staleTimeMs?: number;
    dedupe?: boolean;
};

type UseRequestResult<T> = {
    status: Status;
    response: T | null;
    error: unknown;
    refetch: () => void;
    cancel: () => void;
    reset: () => void;
};
```

Behavior:

- Status transitions: `0` (idle) -> `1` (loading) -> `2` (success) or `3` (error)
- Handles promise rejections and exposes them through `error`.
- Uses `cacheKey` option when provided. Fallback key is derived from factory name (or function source hash for anonymous factories).
- Reuses fresh cache across hook instances unless `disableCache: true`.
- `staleTimeMs` controls cache freshness (default: `Infinity`).
- `dedupe` reuses in-flight requests that share the same `cacheKey` (default: `true`).
- Supports automatic reruns by passing `deps` and can be disabled with `enabled: false`.
- Exposes `refetch()`, `cancel()`, and `reset()` helpers.

Example (cached by default, with STATUS constants):

```tsx
import { useEffect } from "react";
import { FetchPromise, useRequest, STATUS } from "react-fetch-utils";

type Profile = { name: string; role: string };

function loadProfile() {
    return FetchPromise<Profile>({
        url: "/api/profile",
        method: "GET",
    });
}

export function ProfilePanel() {
    const { status, response, error, refetch } = useRequest(loadProfile, {
        cacheKey: "profile",
    });

    useEffect(() => {
        if (status !== STATUS.SUCCESS || !response) return;
        console.log("Ready:", response.name);
    }, [status, response]);

    if (status === STATUS.ERROR) {
        return (
            <div>
                <p>Failed to load profile.</p>
                <button onClick={refetch}>Retry</button>
                <pre>{String(error)}</pre>
            </div>
        );
    }

    if (status === STATUS.LOADING) {
        return <p>Loading...</p>;
    }

    return <p>Profile: {response?.name}</p>;
}
```

Example (disable cache):

```tsx
const { status, response } = useRequest(loadProfile, true);
```

### `statusEnum`

Maps `Status` values to labels.

```ts
const statusEnum = {
    0: "idle",
    1: "fetching",
    2: "done",
    3: "error",
} as const;
```

Example:

```ts
import { statusEnum, type Status } from "react-fetch-utils";

function labelFor(status: Status) {
    return statusEnum[status];
}
```

### `CancellablePromise` (type)

```ts
type CancellablePromise<T = unknown> = Promise<T> & {
    cancel: () => void;
};
```

Example:

```ts
import { type CancellablePromise, FetchPromise } from "react-fetch-utils";

const req: CancellablePromise<{ ok: boolean }> = FetchPromise({
    url: "/api/health",
    method: "GET",
});

req.cancel();
```

### `FetchPromiseParams` (type)

Example:

```ts
import { type FetchPromiseParams, FetchPromise } from "react-fetch-utils";

const request: FetchPromiseParams = {
    url: "/api/items",
    method: "POST",
    body: { page: 1 },
    headers: { Authorization: "Bearer token" },
    timeoutMs: 5000,
    parseAs: "json",
};

FetchPromise(request);
```

### `FetchPromiseError` (type)

Discriminated union of error types. Use type guards to handle errors precisely:

```ts
import { 
    type FetchPromiseError,
    isUnauthorizedError,
    isTimeoutError,
    isUnknownError
} from "react-fetch-utils";

const handleError = (error: FetchPromiseError) => {
    if (isUnauthorizedError(error)) {
        // 401 Unauthorized - handle auth failure
        console.error("Auth failed:", error.status, error.response);
        redirectToLogin();
    } else if (isTimeoutError(error)) {
        // Request timeout
        console.error("Timeout after", error.timeoutMs, "ms");
        showRetryUI();
    } else if (isUnknownError(error)) {
        // Network error, parse error, or invalid status
        console.error("Request failed:", error.details);
        showErrorUI(error);
    }
};
```

**Error types:**

```ts
// 401 Unauthorized response
interface UnauthorizedError {
    reason: "Unauthorized";
    status: 401;
    response: Response;
    details: unknown;
    originalError?: unknown;
}

// Request timeout (exceeded timeoutMs)
interface TimeoutError {
    reason: "Timeout";
    timeoutMs?: number;
    details: unknown;
    originalError: unknown;
}

// Other failures (network error, parsing error, failed status validation, etc.)
interface UnknownError {
    reason: "Unknown";
    status?: number;
    response?: Response;
    details: unknown;
    originalError?: unknown;
}

type FetchPromiseError = UnauthorizedError | TimeoutError | UnknownError;
```

### `FetchResponseConfig` (type)

```ts
type FetchResponseConfig = {
    /** HTTP status code */
    status: number;
    /** Response headers */
    headers: Headers;
    /** Parsed/raw response data */
    data: unknown;
    /** Original fetch Response object */
    response: Response;
};
```

### `FetchRequestConfig` (type)

```ts
type FetchRequestConfig = {
    url: string;
    init: RequestInit;
    headers: Headers;
};
```

### `FetchClientDefaults` (type)

```ts
type FetchClientDefaults = Omit<FetchPromiseParams, "url" | "method"> & {
    method?: string;
};
```

### `Status` (type)

```ts
type Status = 0 | 1 | 2 | 3;
```

Example:

```ts
import { type Status, statusEnum } from "react-fetch-utils";

const status: Status = 1;
console.log(statusEnum[status]); // "fetching"
```

## Notes

- Use `cacheKey` with `useRequest` when a request has dynamic arguments to avoid collisions.
- Set `staleTimeMs: 0` to force revalidation on each mount while still allowing in-flight dedupe.

## Error Handling

Use type guards to handle different error types precisely:

```tsx
import { 
    FetchPromise,
    isUnauthorizedError,
    isTimeoutError,
    isUnknownError,
} from "react-fetch-utils";

async function loadData() {
    try {
        const data = await FetchPromise({ url: "/api/data", method: "GET" });
        return data;
    } catch (error) {
        if (isUnauthorizedError(error)) {
            // Handle 401 - redirect to login
            window.location.href = "/login";
        } else if (isTimeoutError(error)) {
            // Handle timeout - show retry button
            console.error(`Request timed out after ${error.timeoutMs}ms`);
        } else if (isUnknownError(error)) {
            // Handle other errors
            console.error(`Request failed: ${error.details}`);
        }
    }
}
```

Or with `useRequest`:

```tsx
import { 
    useRequest,
    isUnauthorizedError,
    isTimeoutError,
} from "react-fetch-utils";

export function MyComponent() {
    const { status, error, response } = useRequest(() =>
        FetchPromise({ url: "/api/data", method: "GET" })
    );

    if (error) {
        if (isUnauthorizedError(error)) {
            return <p>Please log in again</p>;
        }
        if (isTimeoutError(error)) {
            return <p>Request timed out. Please try again.</p>;
        }
        return <p>Error: {String(error.details)}</p>;
    }

    // ... rest of component
}
```

## Troubleshooting

### Request is stuck in loading state

**Problem**: `status === STATUS.LOADING` never transitions to SUCCESS or ERROR.

**Possible causes:**

- The factory function is not being called. Check that `enabled` is `true` (default).
- The promise never resolves or rejects. Ensure your fetch returns valid JSON or use `parseAs: "text"` / `parseAs: "raw"`.
- Network request is hanging. Add a `timeoutMs` to auto-abort long requests:

  ```ts
  const { status } = useRequest(() =>
    FetchPromise({ url: "/api/data", method: "GET", timeoutMs: 5000 })
  );
  ```

### Cache is not being cleared

**Problem**: Stale data persists after mutation or page change.

**Solutions:**

- Explicitly call `refetch()` after mutations to bypass cache:

  ```ts
  const { refetch } = useRequest(fetchData);
  await submitForm(data);
  refetch(); // Force fresh data
  ```

- Use different cache keys for different data sets:

  ```ts
  const userId = props.userId;
  const { response } = useRequest(() => fetchUser(userId), {
    cacheKey: `user-${userId}` // Unique per user
  });
  ```

- Disable caching for specific requests:

  ```ts
  const { response } = useRequest(fetchData, { disableCache: true });
  ```

### Multiple requests firing for the same data

**Problem**: The same request runs multiple times instead of being deduplicated.

**Causes & solutions:**

- Anonymous functions create new references on every render. Use named functions or `useCallback`:

  ```tsx
  // ❌ Bad: new function on every render
  const { response } = useRequest(() => FetchPromise({ url, method }));

  // ✅ Good: stable function reference
  const fetchData = useCallback(() => 
    FetchPromise({ url, method }), [url, method]
  );
  const { response } = useRequest(fetchData);
  ```

- Deduplication is enabled by default. Disable it only if you need parallel requests:

  ```ts
  const { response } = useRequest(fetchData, { dedupe: false });
  ```

### Authorization / 401 errors

**Problem**: Requests are rejected with `reason: "Unauthorized"`.

**Solutions:**

- Provide a `getAuthToken` function to auto-inject bearer tokens:

  ```ts
  FetchPromise({
    url: "/api/protected",
    method: "GET",
    getAuthToken: () => localStorage.getItem("token")
  });
  ```

- Handle 401 in `onRequest` to refresh tokens:

  ```ts
  const client = createFetchClient({
    onRequest: async (request) => {
      const token = await refreshTokenIfNeeded();
      request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    }
  });
  ```

### Request timeouts are not working

**Problem**: Request runs past `timeoutMs` without aborting.

**Solution**: Ensure `timeoutMs` is set and is a positive number:

```ts
FetchPromise({
  url: "/api/slow",
  method: "GET",
  timeoutMs: 3000 // Abort after 3 seconds
});
```

Check error handling to catch timeout errors:

```ts
promise.catch(err => {
  if (err.reason === "Timeout") {
    console.error("Request timed out after", err.details.timeoutMs, "ms");
  }
});
```

### TypeScript errors with response type

**Problem**: TypeScript complains about response type mismatch.

**Solution**: Explicitly type the generic parameter:

```ts
type ApiResponse = { id: number; name: string };

const { response } = useRequest<ApiResponse>(() =>
  FetchPromise<ApiResponse>({
    url: "/api/data",
    method: "GET"
  })
);
```

## License

MIT

## CONTRIBUTING

See [CONTRIBUTING](https://github.com/wilsocr88/react-fetch-utils/blob/master/CONTRIBUTING.md)
