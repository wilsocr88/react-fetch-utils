import { afterEach, describe, expect, it, vi } from "vitest";
import FetchPromise from "../src/FetchPromise";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("FetchPromise", () => {
    it("sends JSON requests and resolves parsed responses", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ id: 42, name: "Ada" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await FetchPromise<{ id: number; name: string }>({
            url: "/api/user",
            method: "POST",
            body: { includeDetails: true },
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/user",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ includeDetails: true }),
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            })
        );
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
});