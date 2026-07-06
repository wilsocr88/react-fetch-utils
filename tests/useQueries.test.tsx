import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CancellablePromise } from "../src/FetchPromise";
import useQueries from "../src/useQueries";

type QueryProbeProps = {
    onRender: (state: ReturnType<typeof useQueries>) => void;
};

function createMockQuery(): CancellablePromise<string> {
    const promise = Promise.resolve("ok") as CancellablePromise<string>;
    promise.cancel = vi.fn();
    return promise;
}

function QueriesProbe({ onRender }: QueryProbeProps) {
    const state = useQueries();

    useEffect(() => {
        onRender(state);
    }, [onRender, state]);

    return null;
}

describe("useQueries", () => {
    let container: HTMLDivElement;
    let root: Root;

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        container?.remove();
        vi.restoreAllMocks();
    });

    it("adds and removes queries from the list", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const renders: Array<ReturnType<typeof useQueries>> = [];
        const firstQuery = createMockQuery();

        await act(async () => {
            root.render(
                <QueriesProbe
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        expect(renders[0].list).toEqual([]);

        await act(async () => {
            renders[renders.length - 1].add(firstQuery);
        });

        expect(renders[renders.length - 1].list).toEqual([firstQuery]);

        await act(async () => {
            renders[renders.length - 1].remove(firstQuery);
        });

        expect(renders[renders.length - 1].list).toEqual([]);
    });

    it("cancels all tracked queries and clears the list", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        const renders: Array<ReturnType<typeof useQueries>> = [];
        const firstQuery = createMockQuery();
        const secondQuery = createMockQuery();

        await act(async () => {
            root.render(
                <QueriesProbe
                    onRender={state => {
                        renders.push(state);
                    }}
                />
            );
        });

        await act(async () => {
            const latest = renders[renders.length - 1];
            latest.add(firstQuery);
            latest.add(secondQuery);
        });

        expect(renders[renders.length - 1].list).toEqual([firstQuery, secondQuery]);

        await act(async () => {
            renders[renders.length - 1].cancelAll();
        });

        expect(firstQuery.cancel).toHaveBeenCalledTimes(1);
        expect(secondQuery.cancel).toHaveBeenCalledTimes(1);
        expect(renders[renders.length - 1].list).toEqual([]);
    });
});