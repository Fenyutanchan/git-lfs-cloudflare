export const OID_REGEX = /^[0-9a-f]{64}$/;

export const LFS_CONTENT_TYPE = "application/vnd.git-lfs+json";

export function r2Key(repo: string, oid: string): string {
  // Store as {repo}/{oid[0:2]}/{oid[2:4]}/{oid} for better key distribution
  return `${repo}/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
}

export function lfsError(code: number, message: string): Response {
  return new Response(
    JSON.stringify({ message }),
    {
      status: code,
      headers: { "Content-Type": LFS_CONTENT_TYPE },
    },
  );
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    return false;
  }
  const aHash = await crypto.subtle.digest("SHA-256", aBuf);
  const bHash = await crypto.subtle.digest("SHA-256", bBuf);
  const aArr = new Uint8Array(aHash);
  const bArr = new Uint8Array(bHash);
  return aArr.every((val, i) => val === bArr[i]);
}
