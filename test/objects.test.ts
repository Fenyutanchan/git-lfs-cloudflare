import { describe, it, expect, vi } from "vitest";
import { handleUpload, handleDownload, handleVerify } from "../src/objects";
import type { Env } from "../src/types";

const VALID_OID = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const INVALID_OID = "not-valid";

function makeEnv(r2Bucket: Partial<R2Bucket> = {}): Env {
  return {
    LFS_BUCKET: r2Bucket as R2Bucket,
    LFS_AUTH_USER: "testuser",
    LFS_AUTH_PASSWORD: "testpassword",
  };
}

describe("handleUpload", () => {
  it("should reject invalid OID", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "5",
      },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", INVALID_OID);
    expect(res.status).toBe(400);
  });

  it("should reject missing Content-Length", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(400);
  });

  it("should reject invalid Content-Length", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "not-a-number",
      },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(400);
  });

  it("should reject negative Content-Length", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "-1",
      },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(400);
  });

  it("should reject null body", async () => {
    const env = makeEnv();
    // Create a request with no body
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "5",
      },
    });
    // body is null when not provided

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(400);
    const json = await res.json<{ message: string }>();
    expect(json.message).toContain("Request body is required");
  });

  it("should return 200 if object already exists", async () => {
    const env = makeEnv({
      head: vi.fn().mockResolvedValue({ size: 5 }),
    });
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "5",
      },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(200);
    // Should NOT have called put since object exists
    expect(env.LFS_BUCKET.put).toBeUndefined();
  });

  it("should upload new object to R2", async () => {
    const mockPut = vi.fn().mockResolvedValue(undefined);
    const mockHead = vi.fn().mockResolvedValue(null);
    const env = makeEnv({
      head: mockHead,
      put: mockPut,
    });
    const req = new Request("http://localhost/test", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "5",
      },
      body: "hello",
    });

    const res = await handleUpload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(200);
    expect(mockPut).toHaveBeenCalledOnce();

    // Verify the R2 key format
    const [key] = mockPut.mock.calls[0];
    expect(key).toBe(`owner/repo/2c/f2/${VALID_OID}`);
  });
});

describe("handleDownload", () => {
  it("should reject invalid OID", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", { method: "GET" });

    const res = await handleDownload(req, env, "owner/repo", INVALID_OID);
    expect(res.status).toBe(400);
  });

  it("should return 404 for missing object", async () => {
    const env = makeEnv({
      get: vi.fn().mockResolvedValue(null),
    });
    const req = new Request("http://localhost/test", { method: "GET" });

    const res = await handleDownload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(404);
  });

  it("should stream existing object", async () => {
    const mockBody = new ReadableStream();
    const env = makeEnv({
      get: vi.fn().mockResolvedValue({
        body: mockBody,
        size: 1024,
      }),
    });
    const req = new Request("http://localhost/test", { method: "GET" });

    const res = await handleDownload(req, env, "owner/repo", VALID_OID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Length")).toBe("1024");

    // Verify the R2 key format
    expect(env.LFS_BUCKET.get).toHaveBeenCalledWith(
      `owner/repo/2c/f2/${VALID_OID}`,
    );
  });
});

describe("handleVerify", () => {
  it("should reject invalid JSON body", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.git-lfs+json" },
      body: "not json",
    });

    const res = await handleVerify(req, env, "owner/repo");
    expect(res.status).toBe(400);
  });

  it("should reject invalid OID", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.git-lfs+json" },
      body: JSON.stringify({ oid: "bad-oid", size: 100 }),
    });

    const res = await handleVerify(req, env, "owner/repo");
    expect(res.status).toBe(400);
  });

  it("should return 404 for missing object", async () => {
    const env = makeEnv({
      head: vi.fn().mockResolvedValue(null),
    });
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.git-lfs+json" },
      body: JSON.stringify({ oid: VALID_OID, size: 100 }),
    });

    const res = await handleVerify(req, env, "owner/repo");
    expect(res.status).toBe(404);
  });

  it("should return 200 for matching size", async () => {
    const env = makeEnv({
      head: vi.fn().mockResolvedValue({ size: 100 }),
    });
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.git-lfs+json" },
      body: JSON.stringify({ oid: VALID_OID, size: 100 }),
    });

    const res = await handleVerify(req, env, "owner/repo");
    expect(res.status).toBe(200);
  });

  it("should return 422 for size mismatch", async () => {
    const env = makeEnv({
      head: vi.fn().mockResolvedValue({ size: 200 }),
    });
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.git-lfs+json" },
      body: JSON.stringify({ oid: VALID_OID, size: 100 }),
    });

    const res = await handleVerify(req, env, "owner/repo");
    expect(res.status).toBe(422);
    const json = await res.json<{ message: string }>();
    expect(json.message).toContain("Size mismatch");
  });
});
