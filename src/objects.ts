import type { Env } from "./types";
import { OID_REGEX, r2Key, lfsError } from "./utils";

export async function handleUpload(
  request: Request,
  env: Env,
  repo: string,
  oid: string,
): Promise<Response> {
  if (!OID_REGEX.test(oid)) {
    return lfsError(400, "Invalid OID");
  }

  const contentLength = request.headers.get("Content-Length");
  if (!contentLength) {
    return lfsError(400, "Content-Length header is required");
  }

  const size = parseInt(contentLength, 10);
  if (isNaN(size) || size < 0) {
    return lfsError(400, "Invalid Content-Length");
  }

  if (!request.body) {
    return lfsError(400, "Request body is required");
  }

  const key = r2Key(repo, oid);

  // Check if object already exists
  const existing = await env.LFS_BUCKET.head(key);
  if (existing) {
    return new Response(null, { status: 200 });
  }

  // Stream the body directly to R2
  await env.LFS_BUCKET.put(key, request.body, {
    httpMetadata: {
      contentType: "application/octet-stream",
    },
    customMetadata: {
      oid,
      size: size.toString(),
    },
    sha256: hexToArrayBuffer(oid),
  });

  return new Response(null, { status: 200 });
}

export async function handleDownload(
  _request: Request,
  env: Env,
  repo: string,
  oid: string,
): Promise<Response> {
  if (!OID_REGEX.test(oid)) {
    return lfsError(400, "Invalid OID");
  }

  const key = r2Key(repo, oid);
  const object = await env.LFS_BUCKET.get(key);

  if (!object) {
    return lfsError(404, "Object not found");
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": object.size.toString(),
    },
  });
}

export async function handleVerify(
  request: Request,
  env: Env,
  repo: string,
): Promise<Response> {
  let body: { oid: string; size: number };
  try {
    body = await request.json();
  } catch {
    return lfsError(400, "Invalid JSON body");
  }

  if (!body.oid || !OID_REGEX.test(body.oid)) {
    return lfsError(400, "Invalid OID");
  }

  const key = r2Key(repo, body.oid);
  const head = await env.LFS_BUCKET.head(key);

  if (!head) {
    return lfsError(404, "Object not found");
  }

  if (head.size !== body.size) {
    return lfsError(422, `Size mismatch: expected ${body.size}, got ${head.size}`);
  }

  return new Response(null, { status: 200 });
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
