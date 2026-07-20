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
    type CancellablePromise,
    type FetchClientDefaults,
    type FetchPromiseError,
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
- `useQueries` - Track multiple in-flight requests
- `useRequest` - React hook for fetch with caching & lifecycle management
- `STATUS` - Status constants (IDLE, LOADING, SUCCESS, ERROR)
- `statusEnum` - Reverse lookup map for status codes (legacy)
- `CancellablePromise` (type)
- `FetchClientDefaults` (type)
- `FetchPromiseError` (type)
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

### `useQueries`

Tracks active cancellable promises and provides list management helpers.

Signature:

```ts
function useQueries(): {
    list: CancellablePromise[];
    cancelAll: () => void;
    add: (query: CancellablePromise) => void;
    remove: (query: CancellablePromise) => void;
};
```

Example:

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

```ts
type FetchPromiseError = {
    reason: "Unauthorized" | "Timeout" | "Unknown";
    details: unknown;
    status?: number;
    response?: Response;
    originalError?: unknown;
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
