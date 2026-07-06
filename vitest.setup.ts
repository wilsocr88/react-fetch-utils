import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    vi.restoreAllMocks();
});