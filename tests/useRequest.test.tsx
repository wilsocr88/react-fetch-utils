import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CancellablePromise } from "../src/FetchPromise";
import { useRequest, type UseRequestOptions, type UseRequestResult } from "../src/useRequest";

type ProbeProps<T> = {
    fetchPromise: (() => CancellablePromise<T>) | null;
    options?: boolean | UseRequestOptions;
    onRender: (state: UseRequestResult<T>) => void;
};

function createDeferredPromise<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    }) as CancellablePromise<T>;
    promise.cancel = vi.fn();
    return { promise, resolve, reject };
}

function RequestProbe<T>({ fetchPromise, options = false, onRender }: ProbeProps<T>) {
    const state = useRequest(fetchPromise, options);

    useEffect(() => {
        onRender(state);
    }, [onRender, state]);

    return null;
}

describe("useRequest", () => {
    let container: HTMLDivElement;
    let root: Root;

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        container?.remove();
        vi.restoreAllMocks();
    });

    it("fetches once and publishes the resolved response", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const deferred = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi.fn(function loadMessage() {
            return deferred.promise;
        });
        const renders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={true}
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        expect(fetchPromise).toHaveBeenCalledTimes(1);
        expect(renders[0]).toMatchObject({ status: 0, response: null, error: null });

        await act(async () => {
            await Promise.resolve();
        });

        expect(renders.some(render => render.status === 1)).toBe(true);

        await act(async () => {
            deferred.resolve({ message: "loaded" });
            await Promise.resolve();
        });

        expect(renders[renders.length - 1]).toMatchObject({
            status: 2,
            response: { message: "loaded" },
            error: null,
        });
    });

    it("publishes error state when request rejects", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const deferred = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi.fn(function loadMessage() {
            return deferred.promise;
        });
        const renders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={true}
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        await act(async () => {
            deferred.reject(new Error("request failed"));
            await Promise.resolve();
        });

        expect(renders[renders.length - 1]).toMatchObject({
            status: 3,
            response: null,
        });
        expect((renders[renders.length - 1].error as Error).message).toBe("request failed");
    });

    it("supports manual refetch", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const first = createDeferredPromise<{ message: string }>();
        const second = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi
            .fn(function loadMessage() {
                return first.promise;
            })
            .mockImplementationOnce(function loadMessage() {
                return first.promise;
            })
            .mockImplementationOnce(function loadMessageRefetch() {
                return second.promise;
            });

        const renders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={true}
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        await act(async () => {
            first.resolve({ message: "first" });
            await Promise.resolve();
        });

        expect(renders[renders.length - 1]).toMatchObject({ status: 2, response: { message: "first" } });

        await act(async () => {
            renders[renders.length - 1].refetch();
            await Promise.resolve();
        });

        await act(async () => {
            second.resolve({ message: "second" });
            await Promise.resolve();
        });

        expect(fetchPromise).toHaveBeenCalledTimes(2);
        expect(renders[renders.length - 1]).toMatchObject({ status: 2, response: { message: "second" } });
    });

    it("cancels in-flight request on unmount", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const deferred = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi.fn(function loadMessage() {
            return deferred.promise;
        });

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={true}
                    onRender={() => {
                        return;
                    }}
                />
            );
        });

        await act(async () => {
            root.unmount();
        });

        expect(deferred.promise.cancel).toHaveBeenCalledTimes(1);
    });

    it("dedupes in-flight requests that share a cache key", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const deferred = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi.fn(function loadSharedMessage() {
            return deferred.promise;
        });

        const firstRenders: Array<UseRequestResult<{ message: string }>> = [];
        const secondRenders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <>
                    <RequestProbe
                        fetchPromise={fetchPromise}
                        options={{ cacheKey: "shared-key", dedupe: true }}
                        onRender={state => {
                            firstRenders.push(state);
                        }}
                    />
                    <RequestProbe
                        fetchPromise={fetchPromise}
                        options={{ cacheKey: "shared-key", dedupe: true }}
                        onRender={state => {
                            secondRenders.push(state);
                        }}
                    />
                </>
            );
        });

        expect(fetchPromise).toHaveBeenCalledTimes(1);

        await act(async () => {
            deferred.resolve({ message: "shared" });
            await Promise.resolve();
        });

        expect(firstRenders[firstRenders.length - 1]).toMatchObject({ status: 2, response: { message: "shared" } });
        expect(secondRenders[secondRenders.length - 1]).toMatchObject({ status: 2, response: { message: "shared" } });
    });

    it("reuses fresh shared cache across hook instances", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const first = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi
            .fn(function loadSharedCache() {
                return first.promise;
            })
            .mockImplementationOnce(function loadSharedCache() {
                return first.promise;
            });

        const firstRenders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={{ cacheKey: "profile-cache" }}
                    onRender={state => {
                        firstRenders.push(state);
                    }}
                />
            );
        });

        await act(async () => {
            first.resolve({ message: "cached" });
            await Promise.resolve();
        });

        expect(firstRenders[firstRenders.length - 1]).toMatchObject({ status: 2, response: { message: "cached" } });

        await act(async () => {
            root.unmount();
        });

        const secondContainer = document.createElement("div");
        document.body.appendChild(secondContainer);
        const secondRoot = createRoot(secondContainer);
        const secondRenders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            secondRoot.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={{ cacheKey: "profile-cache" }}
                    onRender={state => {
                        secondRenders.push(state);
                    }}
                />
            );
        });

        expect(fetchPromise).toHaveBeenCalledTimes(1);
        expect(secondRenders[secondRenders.length - 1]).toMatchObject({
            status: 2,
            response: { message: "cached" },
            error: null,
        });

        await act(async () => {
            secondRoot.unmount();
        });
        secondContainer.remove();
    });

    it("treats cache as stale when staleTimeMs has elapsed", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const first = createDeferredPromise<{ message: string }>();
        const second = createDeferredPromise<{ message: string }>();
        const fetchPromise = vi
            .fn(function loadWithStaleTime() {
                return first.promise;
            })
            .mockImplementationOnce(function loadWithStaleTime() {
                return first.promise;
            })
            .mockImplementationOnce(function loadWithStaleTimeAgain() {
                return second.promise;
            });

        const firstRenders: Array<UseRequestResult<{ message: string }>> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={{ cacheKey: "stale-cache", staleTimeMs: 0 }}
                    onRender={state => {
                        firstRenders.push(state);
                    }}
                />
            );
        });

        await act(async () => {
            first.resolve({ message: "first" });
            await Promise.resolve();
        });

        expect(firstRenders[firstRenders.length - 1]).toMatchObject({ status: 2, response: { message: "first" } });

        await act(async () => {
            root.unmount();
        });

        const secondContainer = document.createElement("div");
        document.body.appendChild(secondContainer);
        const secondRoot = createRoot(secondContainer);

        await act(async () => {
            secondRoot.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    options={{ cacheKey: "stale-cache", staleTimeMs: 0 }}
                    onRender={() => {
                        return;
                    }}
                />
            );
        });

        expect(fetchPromise).toHaveBeenCalledTimes(2);

        await act(async () => {
            second.resolve({ message: "second" });
            await Promise.resolve();
        });

        await act(async () => {
            secondRoot.unmount();
        });
        secondContainer.remove();
    });
});