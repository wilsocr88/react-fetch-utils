export interface FetchPromiseParams {
    url: string;
    method: string;
    body?: object | null;
    respType?: "raw" | "json" | null;
}

export interface CancellablePromise<T = unknown> extends Promise<T> {
    cancel: () => void;
}

/**
 * @param params - Request configuration
 * @returns A promise with a `.cancel()` method that calls `AbortController.abort()`
 */
const FetchPromise = <T = unknown>(params: FetchPromiseParams): CancellablePromise<T> => {
    const controller = new AbortController();
    const signal = controller.signal;
    const promise = new Promise<T>(async function (resolve, reject) {
        const headers: Record<string, string> = {
            Accept: params.respType === "raw" ? "blob" : "application/json",
            "Content-Type": "application/json",
        };
        await fetch(params.url, {
            method: params.method,
            signal,
            headers,
            body: JSON.stringify(params.body),
        })
            .then(response => {
                if (response.status === 401) {
                    reject({ reason: "Unauthorized", details: response });
                }
                if (!response.ok) {
                    throw new Error(response.statusText);
                }
                if (params.respType === "raw") {
                    return response.blob() as unknown as T;
                }
                return response.json() as Promise<T>;
            })
            .then(data => {
                if (data !== undefined) resolve(data);
            })
            .catch(error => {
                reject({ reason: "Unknown", details: error });
            });
    }) as CancellablePromise<T>;
    promise.cancel = () => controller.abort();
    return promise;
};

export default FetchPromise;
