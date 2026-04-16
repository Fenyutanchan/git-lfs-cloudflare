import { describe, it, expect } from "vitest";
import { authenticate, unauthorizedResponse } from "../src/auth";
import type { Env } from "../src/types";

const VALID_ENV: Env = {
  LFS_BUCKET: {} as R2Bucket,
  LFS_AUTH_USER: "testuser",
  LFS_AUTH_PASSWORD: "testpassword",
};

function makeAuthHeader(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

function makeRequest(url: string, authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers["Authorization"] = authHeader;
  return new Request(url, { headers });
}

describe("authenticate", () => {
  it("should authenticate with correct credentials", async () => {
    const req = makeRequest(
      "http://localhost/test",
      makeAuthHeader("testuser", "testpassword"),
    );
    expect(await authenticate(req, VALID_ENV)).toBe(true);
  });

  it("should reject wrong password", async () => {
    const req = makeRequest(
      "http://localhost/test",
      makeAuthHeader("testuser", "wrongpassword"),
    );
    expect(await authenticate(req, VALID_ENV)).toBe(false);
  });

  it("should reject wrong username", async () => {
    const req = makeRequest(
      "http://localhost/test",
      makeAuthHeader("wronguser", "testpassword"),
    );
    expect(await authenticate(req, VALID_ENV)).toBe(false);
  });

  it("should reject request without Authorization header", async () => {
    const req = makeRequest("http://localhost/test");
    expect(await authenticate(req, VALID_ENV)).toBe(false);
  });

  it("should reject non-Basic auth scheme", async () => {
    const req = makeRequest(
      "http://localhost/test",
      "Bearer some-token",
    );
    expect(await authenticate(req, VALID_ENV)).toBe(false);
  });

  it("should reject malformed Basic auth (no colon)", async () => {
    const req = makeRequest(
      "http://localhost/test",
      `Basic ${btoa("justastring")}`,
    );
    expect(await authenticate(req, VALID_ENV)).toBe(false);
  });

  it("should handle username with colon in password", async () => {
    const env: Env = {
      ...VALID_ENV,
      LFS_AUTH_PASSWORD: "pass:with:colons",
    };
    const req = makeRequest(
      "http://localhost/test",
      makeAuthHeader("testuser", "pass:with:colons"),
    );
    expect(await authenticate(req, env)).toBe(true);
  });
});

describe("unauthorizedResponse", () => {
  it("should return 401 status", () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
  });

  it("should set WWW-Authenticate header", () => {
    const res = unauthorizedResponse();
    expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Git LFS"');
  });

  it("should return JSON error message", async () => {
    const res = unauthorizedResponse();
    const body = await res.json<{ message: string }>();
    expect(body.message).toBe("Credentials needed");
  });
});
