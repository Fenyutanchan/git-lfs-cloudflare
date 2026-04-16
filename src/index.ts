import type { Env } from "./types";
import { authenticate, unauthorizedResponse } from "./auth";
import { handleBatch } from "./batch";
import { handleUpload, handleDownload, handleVerify } from "./objects";
import { LFS_CONTENT_TYPE } from "./utils";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    // Authenticate all requests
    if (!(await authenticate(request, env))) {
      return unauthorizedResponse();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Route: /:owner/:repo.git/info/lfs/objects/batch
    // Also support: /:owner/:repo/info/lfs/objects/batch
    const batchMatch = path.match(
      /^\/(.+?)(?:\.git)?\/info\/lfs\/objects\/batch$/,
    );
    if (batchMatch && request.method === "POST") {
      const repo = batchMatch[1];
      const authHeader = request.headers.get("Authorization");
      return addCorsHeaders(await handleBatch(request, env, repo, authHeader));
    }

    // Route: /:owner/:repo.git/info/lfs/objects/verify
    const verifyMatch = path.match(
      /^\/(.+?)(?:\.git)?\/info\/lfs\/objects\/verify$/,
    );
    if (verifyMatch && request.method === "POST") {
      const repo = verifyMatch[1];
      return addCorsHeaders(await handleVerify(request, env, repo));
    }

    // Route: /:owner/:repo.git/info/lfs/objects/:oid (also without .git)
    // Also matches the short form: /:owner/:repo/objects/:oid
    const objectMatch = path.match(
      /^\/(.+?)(?:\.git)?(?:\/info\/lfs)?\/objects\/([0-9a-f]{64})$/,
    );
    if (objectMatch) {
      const repo = objectMatch[1];
      const oid = objectMatch[2];

      if (request.method === "GET") {
        return addCorsHeaders(await handleDownload(request, env, repo, oid));
      }
      if (request.method === "PUT") {
        return addCorsHeaders(await handleUpload(request, env, repo, oid));
      }
    }

    return new Response(
      JSON.stringify({ message: "Not found" }),
      {
        status: 404,
        headers: { "Content-Type": LFS_CONTENT_TYPE },
      },
    );
  },
} satisfies ExportedHandler<Env>;

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders())) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}
