import { describe, it, expect } from "vitest";
import { OID_REGEX, r2Key, lfsError, timingSafeEqual, LFS_CONTENT_TYPE } from "../src/utils";

describe("OID_REGEX", () => {
  it("should match a valid 64-char hex string", () => {
    const validOid = "a".repeat(64);
    expect(OID_REGEX.test(validOid)).toBe(true);
  });

  it("should match a real SHA-256 hash", () => {
    const oid = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    expect(OID_REGEX.test(oid)).toBe(true);
  });

  it("should reject too short strings", () => {
    expect(OID_REGEX.test("abc123")).toBe(false);
  });

  it("should reject uppercase hex", () => {
    expect(OID_REGEX.test("A".repeat(64))).toBe(false);
  });

  it("should reject non-hex characters", () => {
    expect(OID_REGEX.test("g".repeat(64))).toBe(false);
  });

  it("should reject empty string", () => {
    expect(OID_REGEX.test("")).toBe(false);
  });
});

describe("r2Key", () => {
  const oid = "abcdef1234567890".repeat(4); // 64 chars

  it("should format key as {repo}/{oid[0:2]}/{oid[2:4]}/{oid}", () => {
    expect(r2Key("owner/repo", oid)).toBe(
      `owner/repo/ab/cd/${oid}`,
    );
  });

  it("should handle simple repo name", () => {
    expect(r2Key("my-repo", oid)).toBe(`my-repo/ab/cd/${oid}`);
  });
});

describe("lfsError", () => {
  it("should return correct status code", async () => {
    const res = lfsError(404, "Not found");
    expect(res.status).toBe(404);
  });

  it("should return JSON with message", async () => {
    const res = lfsError(422, "Validation failed");
    const body = await res.json<{ message: string }>();
    expect(body.message).toBe("Validation failed");
  });

  it("should set correct Content-Type header", () => {
    const res = lfsError(400, "Bad request");
    expect(res.headers.get("Content-Type")).toBe(LFS_CONTENT_TYPE);
  });
});

describe("timingSafeEqual", () => {
  it("should return true for equal strings", async () => {
    expect(await timingSafeEqual("hello", "hello")).toBe(true);
  });

  it("should return false for different strings", async () => {
    expect(await timingSafeEqual("hello", "world")).toBe(false);
  });

  it("should return false for different length strings", async () => {
    expect(await timingSafeEqual("short", "much-longer-string")).toBe(false);
  });

  it("should return false for empty vs non-empty", async () => {
    expect(await timingSafeEqual("", "nonempty")).toBe(false);
  });

  it("should handle empty strings", async () => {
    expect(await timingSafeEqual("", "")).toBe(true);
  });
});
