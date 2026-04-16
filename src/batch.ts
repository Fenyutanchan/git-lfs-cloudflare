import type { Env, LfsBatchRequest, LfsBatchResponse, LfsBatchResponseObject } from "./types";
import { OID_REGEX, r2Key, lfsError } from "./utils";

const EXPIRES_IN = 3600; // 1 hour

function validateBatchRequest(body: LfsBatchRequest): string | null {
  if (!body.operation || !["upload", "download"].includes(body.operation)) {
    return "Invalid operation";
  }
  if (!Array.isArray(body.objects) || body.objects.length === 0) {
    return "Objects array is required and must not be empty";
  }
  for (const obj of body.objects) {
    if (!obj.oid || !OID_REGEX.test(obj.oid)) {
      return `Invalid oid: ${obj.oid}`;
    }
    if (typeof obj.size !== "number" || obj.size < 0) {
      return `Invalid size for oid ${obj.oid}`;
    }
  }
  return null;
}

export async function handleBatch(
  request: Request,
  env: Env,
  repo: string,
  authHeader: string | null,
): Promise<Response> {
  let body: LfsBatchRequest;
  try {
    body = await request.json();
  } catch {
    return lfsError(400, "Invalid JSON body");
  }

  const validationError = validateBatchRequest(body);
  if (validationError) {
    return lfsError(422, validationError);
  }

  const baseUrl = new URL(request.url);
  const origin = baseUrl.origin;

  const objects: LfsBatchResponseObject[] = [];

  for (const obj of body.objects) {
    const key = r2Key(repo, obj.oid);

    if (body.operation === "upload") {
      objects.push(buildUploadObject(origin, repo, obj.oid, obj.size, authHeader));
    } else {
      // download
      const head = await env.LFS_BUCKET.head(key);
      if (!head) {
        objects.push({
          oid: obj.oid,
          size: obj.size,
          error: { code: 404, message: "Object not found" },
        });
      } else {
        objects.push(buildDownloadObject(origin, repo, obj.oid, head.size, authHeader));
      }
    }
  }

  const response: LfsBatchResponse = {
    transfer: "basic",
    objects,
    hash_algo: "sha256",
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/vnd.git-lfs+json" },
  });
}

function buildUploadObject(
  origin: string,
  repo: string,
  oid: string,
  size: number,
  authHeader: string | null,
): LfsBatchResponseObject {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  if (authHeader) headers["Authorization"] = authHeader;

  return {
    oid,
    size,
    authenticated: true,
    actions: {
      upload: {
        href: `${origin}/${repo}/objects/${oid}`,
        header: headers,
        expires_in: EXPIRES_IN,
      },
      verify: {
        href: `${origin}/${repo}/info/lfs/objects/verify`,
        header: authHeader ? { Authorization: authHeader } : undefined,
        expires_in: EXPIRES_IN,
      },
    },
  };
}

function buildDownloadObject(
  origin: string,
  repo: string,
  oid: string,
  size: number,
  authHeader: string | null,
): LfsBatchResponseObject {
  const headers: Record<string, string> = {};
  if (authHeader) headers["Authorization"] = authHeader;

  return {
    oid,
    size,
    authenticated: true,
    actions: {
      download: {
        href: `${origin}/${repo}/objects/${oid}`,
        header: Object.keys(headers).length > 0 ? headers : undefined,
        expires_in: EXPIRES_IN,
      },
    },
  };
}
