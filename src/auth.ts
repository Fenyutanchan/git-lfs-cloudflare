import type { Env } from "./types";
import { timingSafeEqual } from "./utils";

/**
 * Validate Basic Auth credentials.
 * Returns true if authenticated, false otherwise.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function authenticate(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  // Git LFS uses Basic auth
  if (!authHeader.startsWith("Basic ")) return false;

  const decoded = atob(authHeader.slice(6));
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return false;

  const user = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  const userMatch = await timingSafeEqual(user, env.LFS_AUTH_USER);
  const passMatch = await timingSafeEqual(password, env.LFS_AUTH_PASSWORD);
  return userMatch && passMatch;
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ message: "Credentials needed" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/vnd.git-lfs+json",
        "WWW-Authenticate": 'Basic realm="Git LFS"',
      },
    },
  );
}
