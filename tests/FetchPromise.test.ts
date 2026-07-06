import { afterEach, describe, expect, it, vi } from "vitest";
import FetchPromise, { createFetchClient } from "../src/FetchPromise";

const createAbortError = () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    return err;
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("FetchPromise", () => {
    it("sends JSON requests and resolves parsed responses", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: vi.fn().mockResolvedValue('{"id":42,"name":"Ada"}'),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await FetchPromise<{ id: number; name: string }>({
            url: "/api/user",
            method: "POST",
            body: { includeDetails: true },
        });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);

        expect(fetchMock).toHaveBeenCalledWith("/api/user", expect.any(Object));
        expect(requestInit.method).toBe("POST");
        expect(requestInit.body).toBe(JSON.stringify({ includeDetails: true }));
        expect(headers.get("Accept")).toBe("application/json");
        expect(headers.get("Content-Type")).toBe("application/json");
        expect(result).toEqual({ id: 42, name: "Ada" });
    });

    it("rejects unauthorized responses with a reason payload", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: "Unauthorized",
            })
        );

        await expect(
            FetchPromise({
                url: "/api/private",
                method: "GET",
            })
        ).rejects.toMatchObject({ reason: "Unauthorized" });
    });

    it("rejects with Timeout reason when request exceeds timeoutMs", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_: string, init?: RequestInit) => {
                return new Promise((_, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(createAbortError());
                    });
                });
            })
        );

        const request = FetchPromise({
            url: "/api/slow",
            method: "GET",
            timeoutMs: 25,
        });
        const rejection = expect(request).rejects.toMatchObject({ reason: "Timeout" });

        await vi.advanceTimersByTimeAsync(30);

        await rejection;
    });

    it("does not set Content-Type for GET/body-less requests", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({ url: "/api/items", method: "GET" });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(headers.has("Content-Type")).toBe(false);
    });

    it("adds Content-Type for JSON body on POST", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({ url: "/api/items", method: "POST", body: { page: 1 } });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("uses caller provided headers over defaults", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({
            url: "/api/items",
            method: "GET",
            headers: { Accept: "text/plain" },
            parseAs: "text",
        });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(headers.get("Accept")).toBe("text/plain");
    });

    it("injects Authorization from getAuthToken callback when header is absent", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({
            url: "/api/items",
            method: "GET",
            getAuthToken: async () => "my-token",
        });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(headers.get("Authorization")).toBe("Bearer my-token");
    });

    it("does not override existing Authorization header", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({
            url: "/api/items",
            method: "GET",
            headers: { Authorization: "Bearer custom-token" },
            getAuthToken: async () => "fallback-token",
        });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(headers.get("Authorization")).toBe("Bearer custom-token");
    });

    it("does not send body for GET by default even when body is provided", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await FetchPromise({
            url: "/api/items",
            method: "GET",
            body: { ignored: true },
        });

        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(requestInit.body).toBeUndefined();
    });

    it("passes FormData and string body through without JSON stringify", async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));
        vi.stubGlobal("fetch", fetchMock);

        const formData = new FormData();
        formData.append("file", new Blob(["abc"]), "test.txt");

        await FetchPromise({ url: "/api/upload", method: "POST", body: formData });
        await FetchPromise({ url: "/api/text", method: "POST", body: "plain text" });

        const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(firstInit.body).toBe(formData);
        expect(secondInit.body).toBe("plain text");
    });

    it("supports raw parse mode and returns Blob", async () => {
        const responseBlob = new Blob(["binary-data"]);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(responseBlob, { status: 200 })));

        const result = await FetchPromise<Blob>({
            url: "/api/file",
            method: "GET",
            parseAs: "raw",
        });

        expect(result).toBeInstanceOf(Blob);
    });

    it("supports text parse mode and returns string", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello", { status: 200 })));

        const result = await FetchPromise<string>({
            url: "/api/text",
            method: "GET",
            parseAs: "text",
        });

        expect(result).toBe("hello");
    });

    it("supports response parse mode and returns full Response", async () => {
        const response = new Response('{"ok":true}', { status: 200 });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

        const result = await FetchPromise<Response>({
            url: "/api/response",
            method: "GET",
            parseAs: "response",
        });

        expect(result).toBe(response);
    });

    it("handles empty json response body safely", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

        const result = await FetchPromise({
            url: "/api/no-content",
            method: "GET",
            parseAs: "json",
        });

        expect(result).toBeUndefined();
    });

    it("maps non-401 failures to Unknown", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Server Error",
            })
        );

        await expect(FetchPromise({ url: "/api/fail", method: "GET" })).rejects.toMatchObject({
            reason: "Unknown",
            status: 500,
        });
    });

    it("maps fetch failures to Unknown with error details", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

        await expect(FetchPromise({ url: "/api/fail", method: "GET" })).rejects.toMatchObject({
            reason: "Unknown",
            details: expect.objectContaining({
                message: "network down",
            }),
        });
    });

    it("keeps cancel function safe to call multiple times", async () => {
        const fetchMock = vi.fn().mockImplementation((_: string, init?: RequestInit) => {
            return new Promise((_, reject) => {
                init?.signal?.addEventListener("abort", () => reject(createAbortError()));
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const query = FetchPromise({ url: "/api/abort", method: "GET" });
        query.cancel();
        query.cancel();

        await expect(query).rejects.toMatchObject({ reason: "Unknown" });
    });

    it("keeps backward compatibility for respType raw and json", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(new Blob(["file"]), { status: 200 }))
            .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const rawResult = await FetchPromise<Blob>({
            url: "/api/raw",
            method: "GET",
            respType: "raw",
        });
        const jsonResult = await FetchPromise<{ ok: boolean }>({
            url: "/api/json",
            method: "GET",
            respType: "json",
        });

        expect(rawResult).toBeInstanceOf(Blob);
        expect(jsonResult).toEqual({ ok: true });
    });

    it("applies createFetchClient defaults and allows per-request overrides", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const client = createFetchClient({
            baseUrl: "https://api.example.com/v1",
            timeoutMs: 5000,
            headers: { "X-App": "web", Authorization: "Bearer default" },
            getAuthToken: async () => "token-from-callback",
        });

        await client({
            url: "/users",
            method: "GET",
            headers: { Authorization: "Bearer override" },
        });

        const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(requestInit.headers);
        expect(url).toBe("https://api.example.com/v1/users");
        expect(headers.get("X-App")).toBe("web");
        expect(headers.get("Authorization")).toBe("Bearer override");
    });
});