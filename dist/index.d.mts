interface FetchPromiseParams {
    url: string;
    method: string;
    body?: object | null;
    respType?: "raw" | "json" | null;
}
interface CancellablePromise<T = unknown> extends Promise<T> {
    cancel: () => void;
}
/**
 * @param params - Request configuration
 * @returns A promise with a `.cancel()` method that calls `AbortController.abort()`
 */
declare const FetchPromise: <T = unknown>(params: FetchPromiseParams) => CancellablePromise<T>;

declare function useQueries(): {
    list: CancellablePromise<unknown>[];
    cancelAll: () => void;
    add: (query: CancellablePromise) => void;
    remove: (query: CancellablePromise) => void;
};

/**
 * Status enumerator.
 * 0 = "idle"
 * 1 = "fetching"
 * 2 = "done"
 */
declare const statusEnum: {
    readonly 0: "idle";
    readonly 1: "fetching";
    readonly 2: "done";
};
type Status = 0 | 1 | 2;
/**
 * @param fetchPromise - A factory function that returns a `CancellablePromise`
 * @param disableCache - Disable cache and force a re-fetch every time this hook runs
 * @returns `{ status, response }` where status is 0 (idle), 1 (fetching), or 2 (done)
 */
declare const useRequest: <T = unknown>(fetchPromise: (() => CancellablePromise<T>) | null | undefined, disableCache?: boolean) => {
    status: Status;
    response: T | null;
};

export { type CancellablePromise, FetchPromise, type FetchPromiseParams, type Status, statusEnum, useQueries, useRequest };
