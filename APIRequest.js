const APIRequest = params => {
    const controller = new AbortController();
    const signal = controller.signal;
    const promise = new Promise(async function (resolve, reject) {
        const { apiUrl } = window["runConfig"];
        const headers = {
            Accept: params.respType === "raw" ? "blob" : "application/json",
            "Content-Type": "application/json",
        };
        await fetch(apiUrl + params.url, {
            method: params.method,
            signal,
            headers: headers,
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
export default APIRequest;
