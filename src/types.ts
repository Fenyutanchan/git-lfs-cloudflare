export interface Env {
  LFS_BUCKET: R2Bucket;
  LFS_AUTH_USER: string;
  LFS_AUTH_PASSWORD: string;
}

// Git LFS Batch API types
// https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md

export interface LfsBatchRequest {
  operation: "upload" | "download";
  transfers?: string[];
  ref?: { name: string };
  objects: LfsObject[];
  hash_algo?: string;
}

export interface LfsObject {
  oid: string;
  size: number;
}

export interface LfsBatchResponse {
  transfer?: string;
  objects: LfsBatchResponseObject[];
  hash_algo?: string;
}

export interface LfsBatchResponseObject {
  oid: string;
  size: number;
  authenticated?: boolean;
  actions?: {
    upload?: LfsAction;
    download?: LfsAction;
    verify?: LfsAction;
  };
  error?: LfsError;
}

export interface LfsAction {
  href: string;
  header?: Record<string, string>;
  expires_in?: number;
}

export interface LfsError {
  code: number;
  message: string;
}
