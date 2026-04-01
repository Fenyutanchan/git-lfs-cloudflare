import type { Env } from "./types";

/**
 * Validate Basic Auth credentials.
 * Returns true if authenticated, false otherwise.
 */
export function authenticate(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  // Git LFS uses Basic auth
  if (!authHeader.startsWith("Basic ")) return false;

  const decoded = atob(authHeader.slice(6));
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return false;

  const user = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  return (
    user === env.LFS_AUTH_USER &&
    password === env.LFS_AUTH_PASSWORD
  );
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
