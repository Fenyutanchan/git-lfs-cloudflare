import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

const VALID_OID = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const AUTH_HEADER = `Basic ${btoa("testuser:testpassword")}`;

function makeEnv(r2Bucket: Partial<R2Bucket> = {}): Env {
  return {
    LFS_BUCKET: r2Bucket as R2Bucket,
    LFS_AUTH_USER: "testuser",
    LFS_AUTH_PASSWORD: "testpassword",
  };
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: {
      Authorization: AUTH_HEADER,
      ...init?.headers,
    },
  });
}

describe("Worker fetch handler", () => {
  describe("authentication", () => {
    it("should return 401 without auth", async () => {
      const env = makeEnv();
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify({ operation: "upload", objects: [] }),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(401);
    });

    it("should return 401 with wrong credentials", async () => {
      const env = makeEnv();
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa("wrong:creds")}`,
          "Content-Type": "application/vnd.git-lfs+json",
        },
        body: JSON.stringify({ operation: "upload", objects: [] }),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(401);
    });
  });

  describe("CORS", () => {
    it("should handle OPTIONS preflight", async () => {
      const env = makeEnv();
      const req = new Request("http://localhost/test", { method: "OPTIONS" });
      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    it("should add CORS headers to responses", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = makeRequest("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("batch API", () => {
    it("should route POST /:owner/:repo/info/lfs/objects/batch", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = makeRequest("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
      const json = await res.json<any>();
      expect(json.transfer).toBe("basic");
    });

    it("should route with .git suffix", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = makeRequest("http://localhost/owner/repo.git/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
    });
  });

  describe("upload/download objects", () => {
    it("should route PUT /:owner/:repo/objects/:oid", async () => {
      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockHead = vi.fn().mockResolvedValue(null);
      const env = makeEnv({ head: mockHead, put: mockPut });

      const req = makeRequest(`http://localhost/owner/repo/objects/${VALID_OID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": "5",
        },
        body: "hello",
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
      expect(mockPut).toHaveBeenCalledOnce();
    });

    it("should route GET /:owner/:repo/objects/:oid", async () => {
      const env = makeEnv({
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
          size: 100,
        }),
      });

      const req = makeRequest(`http://localhost/owner/repo/objects/${VALID_OID}`, {
        method: "GET",
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
    });
  });

  describe("verify endpoint", () => {
    it("should route POST /:owner/:repo/info/lfs/objects/verify", async () => {
      const env = makeEnv({
        head: vi.fn().mockResolvedValue({ size: 100 }),
      });

      const req = makeRequest("http://localhost/owner/repo/info/lfs/objects/verify", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify({ oid: VALID_OID, size: 100 }),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
    });

    it("should route verify with .git suffix", async () => {
      const env = makeEnv({
        head: vi.fn().mockResolvedValue({ size: 100 }),
      });

      const req = makeRequest("http://localhost/owner/repo.git/info/lfs/objects/verify", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify({ oid: VALID_OID, size: 100 }),
      });

      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(200);
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const env = makeEnv();
      const req = makeRequest("http://localhost/unknown/path");
      const res = await worker.fetch(req, env, {} as ExecutionContext);
      expect(res.status).toBe(404);
    });
  });
});
