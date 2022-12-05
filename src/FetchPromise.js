const FetchPromiseParams = {
    url: String,
    method: String,
    body: Object || null,
    respType: String || null,
};

/**
 * @param {FetchPromiseParams} params
 * @returns {FetchPromise} A promise with a .cancel() method which calls AbortController.abort()
 */
const FetchPromise = params => {
    const controller = new AbortController();
    const signal = controller.signal;
    const promise = new Promise(async function (resolve, reject) {
        const headers = {
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
                    throw Error(response);
                }
                if (params.respType === "raw") {
                    return response.blob();
                }
                return response.json();
            })
            .then(data => {
                resolve(data);
            })
            .catch(error => {
                reject({ reason: "Unknown", details: error });
            });
    });
    promise.cancel = () => controller.abort();
    return promise;
};
export default FetchPromise;
