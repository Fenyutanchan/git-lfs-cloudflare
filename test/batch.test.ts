import { describe, it, expect, vi } from "vitest";
import { handleBatch } from "../src/batch";
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

describe("handleBatch", () => {
  describe("upload operation", () => {
    it("should return upload and verify actions", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(200);

      const json = await res.json<import("../src/types").LfsBatchResponse>();
      expect(json.transfer).toBe("basic");
      expect(json.hash_algo).toBe("sha256");
      expect(json.objects).toHaveLength(1);

      const obj = json.objects[0];
      expect(obj.oid).toBe(VALID_OID);
      expect(obj.size).toBe(100);
      expect(obj.authenticated).toBe(true);
      expect(obj.actions?.upload).toBeDefined();
      expect(obj.actions?.verify).toBeDefined();

      // Verify the verify URL contains /info/lfs/ (the fixed path)
      expect(obj.actions!.verify!.href).toContain("/info/lfs/objects/verify");
    });

    it("should include Authorization header in upload action", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      const json = await res.json<import("../src/types").LfsBatchResponse>();
      const headers = json.objects[0].actions!.upload!.header!;
      expect(headers["Authorization"]).toBe(AUTH_HEADER);
    });
  });

  describe("download operation", () => {
    it("should return download action for existing object", async () => {
      const env = makeEnv({
        head: vi.fn().mockResolvedValue({ size: 200 }),
      });
      const body = {
        operation: "download",
        objects: [{ oid: VALID_OID, size: 200 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      const json = await res.json<import("../src/types").LfsBatchResponse>();
      expect(json.objects[0].actions?.download).toBeDefined();
      expect(json.objects[0].actions?.download!.href).toContain(`/objects/${VALID_OID}`);
    });

    it("should return 404 error for missing object", async () => {
      const env = makeEnv({
        head: vi.fn().mockResolvedValue(null),
      });
      const body = {
        operation: "download",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      const json = await res.json<import("../src/types").LfsBatchResponse>();
      expect(json.objects[0].error).toBeDefined();
      expect(json.objects[0].error!.code).toBe(404);
    });
  });

  describe("validation", () => {
    it("should reject invalid JSON body", async () => {
      const env = makeEnv();
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: "not json",
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it("should reject invalid operation", async () => {
      const env = makeEnv();
      const body = {
        operation: "delete",
        objects: [{ oid: VALID_OID, size: 100 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(422);
      const json = await res.json<{ message: string }>();
      expect(json.message).toContain("Invalid operation");
    });

    it("should reject empty objects array", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(422);
    });

    it("should reject invalid OID format", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: "not-a-valid-oid", size: 100 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(422);
      const json = await res.json<{ message: string }>();
      expect(json.message).toContain("Invalid oid");
    });

    it("should reject negative size", async () => {
      const env = makeEnv();
      const body = {
        operation: "upload",
        objects: [{ oid: VALID_OID, size: -1 }],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      expect(res.status).toBe(422);
    });

    it("should handle multiple objects in one batch", async () => {
      const env = makeEnv();
      const oid2 = "a".repeat(64);
      const body = {
        operation: "upload",
        objects: [
          { oid: VALID_OID, size: 100 },
          { oid: oid2, size: 200 },
        ],
      };
      const req = new Request("http://localhost/owner/repo/info/lfs/objects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
        body: JSON.stringify(body),
      });

      const res = await handleBatch(req, env, "owner/repo", AUTH_HEADER);
      const json = await res.json<import("../src/types").LfsBatchResponse>();
      expect(json.objects).toHaveLength(2);
    });
  });
});
