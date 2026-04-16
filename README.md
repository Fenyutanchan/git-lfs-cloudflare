# git-lfs-cloudflare

[![CI](https://github.com/Fenyutanchan/git-lfs-cloudflare/actions/workflows/ci.yml/badge.svg)](https://github.com/Fenyutanchan/git-lfs-cloudflare/actions/workflows/ci.yml)
[中文文档](README.zh-CN.md)

A Git LFS server implementation powered by Cloudflare Workers + R2.

## Architecture

```
Git LFS Client ←→ Cloudflare Worker (API + Auth) ←→ R2 (Object Storage)
```

- **Worker** implements the Git LFS Batch API, handles authentication, and streams uploads/downloads via R2 Binding
- **R2** stores LFS objects at `{repo}/{oid[0:2]}/{oid[2:4]}/{oid}` for key distribution
- **Basic Auth** with credentials stored in Worker Secrets

### API Routes

All routes also support the `.git` suffix variant (e.g. `/:owner/:repo.git/info/lfs/objects/batch`).

| Method | Path                                          | Description            |
| ------ | --------------------------------------------- | ---------------------- |
| POST   | `/:owner/:repo/info/lfs/objects/batch`        | LFS Batch API          |
| PUT    | `/:owner/:repo/objects/:oid`                  | Upload LFS object      |
| GET    | `/:owner/:repo/objects/:oid`                  | Download LFS object    |
| POST   | `/:owner/:repo/info/lfs/objects/verify`       | Verify upload integrity|

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Cloudflare account](https://dash.cloudflare.com/) with R2 enabled

## Deployment

### 1. Install dependencies

```bash
bun install
```

### 2. Create R2 Bucket

```bash
wrangler r2 bucket create git-lfs
```

### 3. Set authentication secrets

```bash
wrangler secret put LFS_AUTH_USER
# Enter username

wrangler secret put LFS_AUTH_PASSWORD
# Enter password
```

### 4. Deploy

```bash
bun run deploy
```

After deployment you will get a Worker URL, e.g. `https://git-lfs-cloudflare.<your-subdomain>.workers.dev`.

### 5. Local development

```bash
bun run dev
```

For local development, set environment variables in a `.dev.vars` file:

```ini
LFS_AUTH_USER=your-username
LFS_AUTH_PASSWORD=your-password
```

### 6. Testing

```bash
# Run all tests
bun run test

# Watch mode during development
bun run test:watch
```

Tests run automatically on push/PR via [GitHub Actions](.github/workflows/ci.yml).

## Git Client Configuration

Configure LFS in your Git repository to use this server:

```bash
# Set LFS URL (replace with your Worker URL and repo path)
git config lfs.url https://git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo

# Configure credentials (recommended: use git credential store or credential helper)
# Simplest approach:
git config lfs.url https://user:password@git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo
```

Or configure in `.lfsconfig` (without password):

```ini
[lfs]
    url = https://git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo
```

## Custom Domain

Add to `wrangler.toml`:

```toml
routes = [
  { pattern = "lfs.example.com/*", zone_name = "example.com" }
]
```

Or set up a Custom Domain via the Cloudflare Dashboard.

## Security

- All requests require Basic Auth with constant-time credential comparison (prevents timing attacks)
- R2 uploads are validated with SHA-256 checksums (the OID is the SHA-256 hash), preventing data tampering
- HTTPS by default (Workers always serve over HTTPS)
- For production, use strong passwords or integrate OAuth/Token authentication

## Limitations

- Max request duration: 30s (Free) / unlimited (Paid)
- Max single R2 object size: 5 TB
- Max single PUT size: 5 GB (larger files require multipart upload)
- Workers Free plan: 100,000 requests/day

## License

MIT
