import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CancellablePromise } from "../src/FetchPromise";
import { useRequest } from "../src/useRequest";

type ProbeProps<T> = {
    fetchPromise: (() => CancellablePromise<T>) | null;
    onRender: (state: { status: number; response: T | null }) => void;
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

function RequestProbe<T>({ fetchPromise, onRender }: ProbeProps<T>) {
    const state = useRequest(fetchPromise, false);

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
        const renders: Array<{ status: number; response: { message: string } | null }> = [];

        await act(async () => {
            root.render(
                <RequestProbe
                    fetchPromise={fetchPromise}
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        expect(fetchPromise).toHaveBeenCalledTimes(1);
        expect(renders[0]).toEqual({ status: 0, response: null });

        await act(async () => {
            await Promise.resolve();
        });

        expect(renders.some(render => render.status === 1)).toBe(true);

        await act(async () => {
            deferred.resolve({ message: "loaded" });
            await Promise.resolve();
        });

        expect(renders[renders.length - 1]).toEqual({ status: 2, response: { message: "loaded" } });
    });
});