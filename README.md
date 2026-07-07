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
    statusEnum,
    type CancellablePromise,
    type FetchClientDefaults,
    type FetchPromiseError,
    type FetchPromiseParams,
    type FetchRequestConfig,
    type Status,
} from "react-fetch-utils";
```

## Exports

- `FetchPromise`
- `createFetchClient`
- `useQueries`
- `useRequest`
- `statusEnum`
- `CancellablePromise` (type)
- `FetchClientDefaults` (type)
- `FetchPromiseError` (type)
- `FetchPromiseParams` (type)
- `FetchRequestConfig` (type)
- `Status` (type)

## Quick Start

```tsx
import { useEffect } from "react";
import { FetchPromise, useRequest } from "react-fetch-utils";

type Todo = { id: number; title: string; completed: boolean };

function getTodo() {
    return FetchPromise<Todo>({
        url: "https://jsonplaceholder.typicode.com/todos/1",
        method: "GET",
    });
}

export function TodoCard() {
    const { status, response } = useRequest(getTodo);

    useEffect(() => {
        if (status !== 2 || !response) return;
        console.log("Loaded:", response.title);
    }, [status, response]);

    if (status === 0) return <p>Idle</p>;
    if (status === 1) return <p>Loading...</p>;
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
    respType?: "raw" | "json" | null;
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

- Backward compatible with existing `respType: "json" | "raw"`.
- New parsing modes via `parseAs`:
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
    respType: "raw",
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

Runs a cancellable request factory on mount, tracks status, and caches by factory function name.

Signature:

```ts
function useRequest<T = unknown>(
    fetchPromise: (() => CancellablePromise<T>) | null | undefined,
    disableCache?: boolean,
): { status: Status; response: T | null };
```

Behavior:

- Status transitions: `0` (idle) -> `1` (fetching) -> `2` (done)
- Uses `fetchPromise.name` as cache key.
- On cache hit and `disableCache === false`, returns cached data.
- On cache miss, cancels tracked queries, runs request, tracks/removes it, then stores response.
- Does not auto-run again on dependency changes; it executes once on mount for that hook instance.

Example (cached by default):

```tsx
import { useEffect } from "react";
import { FetchPromise, useRequest, statusEnum } from "react-fetch-utils";

type Profile = { name: string; role: string };

function loadProfile() {
    return FetchPromise<Profile>({
        url: "/api/profile",
        method: "GET",
    });
}

export function ProfilePanel() {
    const { status, response } = useRequest(loadProfile);

    useEffect(() => {
        if (status !== 2 || !response) return;
        console.log("Ready:", response.name);
    }, [status, response]);

    return <p>State: {statusEnum[status]}</p>;
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
type Status = 0 | 1 | 2;
```

Example:

```ts
import { type Status, statusEnum } from "react-fetch-utils";

const status: Status = 1;
console.log(statusEnum[status]); // "fetching"
```

## Notes

- `useRequest` is built on top of `useQueries`.
- For errors, attach `.catch(...)` where you create and consume `CancellablePromise` requests.
- `respType` is still supported for backward compatibility; prefer `parseAs` in new code.

## License

MIT

## CONTRIBUTING

See [CONTRIBUTING](https://github.com/wilsocr88/react-fetch-utils/blob/master/CONTRIBUTING.md)
