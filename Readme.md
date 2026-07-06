# react-fetch-utils

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
    useQueries,
    useRequest,
    statusEnum,
    type CancellablePromise,
    type FetchPromiseParams,
    type Status,
} from "react-fetch-utils";
```

## Exports

- `FetchPromise`
- `useQueries`
- `useRequest`
- `statusEnum`
- `CancellablePromise` (type)
- `FetchPromiseParams` (type)
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
    body?: object | null;
    respType?: "raw" | "json" | null;
};
```

Behavior:

- Sends JSON body with `JSON.stringify(params.body)`.
- Sends headers:
    - `Accept: application/json` (or `blob` when `respType: "raw"`)
    - `Content-Type: application/json`
- Resolves with `response.json()` by default.
- Resolves with `response.blob()` when `respType: "raw"`.
- Rejects `401` with `{ reason: "Unauthorized", details: Response }`.
- Rejects all other failures as `{ reason: "Unknown", details: error }`.
- Returns a promise with `.cancel()` that aborts the underlying request.

Example (JSON):

```ts
import { FetchPromise } from "react-fetch-utils";

type User = { id: number; name: string };

export function getUser() {
    return FetchPromise<User>({
        url: "/api/user",
        method: "POST",
        body: { includeDetails: true },
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
    respType: "json",
};

FetchPromise(request);
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

## License

MIT
