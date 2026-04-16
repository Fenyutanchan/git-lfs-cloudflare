# git-lfs-cloudflare

[![CI](https://github.com/Fenyutanchan/git-lfs-cloudflare/actions/workflows/ci.yml/badge.svg)](https://github.com/Fenyutanchan/git-lfs-cloudflare/actions/workflows/ci.yml)
[English](README.md)

基于 Cloudflare Workers + R2 的 Git LFS 服务器实现。

## 架构

```
Git LFS Client ←→ Cloudflare Worker (API + Auth) ←→ R2 (Object Storage)
```

- **Worker** 实现 Git LFS Batch API，处理认证，并通过 R2 Binding 流式代理上传/下载
- **R2** 按 `{repo}/{oid[0:2]}/{oid[2:4]}/{oid}` 路径结构存储 LFS 对象
- **Basic Auth** 认证，凭证存于 Worker Secrets

### API 路由

所有路由均支持 `.git` 后缀变体（例如 `/:owner/:repo.git/info/lfs/objects/batch`）。

| 方法   | 路径                                          | 说明               |
| ------ | --------------------------------------------- | ------------------ |
| POST   | `/:owner/:repo/info/lfs/objects/batch`        | LFS Batch API      |
| PUT    | `/:owner/:repo/objects/:oid`                  | 上传 LFS 对象      |
| GET    | `/:owner/:repo/objects/:oid`                  | 下载 LFS 对象      |
| POST   | `/:owner/:repo/info/lfs/objects/verify`       | 验证上传完整性     |

## 前置条件

- [Bun](https://bun.sh/) >= 1.0
- [Cloudflare 账户](https://dash.cloudflare.com/)，已开通 R2

## 部署步骤

### 1. 安装依赖

```bash
bun install
```

### 2. 创建 R2 Bucket

```bash
wrangler r2 bucket create git-lfs
```

### 3. 设置认证密钥

```bash
wrangler secret put LFS_AUTH_USER
# 输入用户名

wrangler secret put LFS_AUTH_PASSWORD
# 输入密码
```

### 4. 部署

```bash
bun run deploy
```

部署后会得到一个 Worker URL，例如 `https://git-lfs-cloudflare.<your-subdomain>.workers.dev`。

### 5. 本地开发

```bash
bun run dev
```

本地开发时需在 `.dev.vars` 文件中设置环境变量：

```ini
LFS_AUTH_USER=your-username
LFS_AUTH_PASSWORD=your-password
```

### 6. 测试

```bash
# 运行全部测试
bun run test

# 开发时使用监听模式
bun run test:watch
```

测试在每次推送/PR 时通过 [GitHub Actions](.github/workflows/ci.yml) 自动运行。

## Git 客户端配置

在你的 Git 仓库中配置 LFS 使用此服务器：

```bash
# 设置 LFS URL（替换为你的 Worker URL 和仓库路径）
git config lfs.url https://git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo

# 配置凭证（推荐使用 git credential store 或 credential helper）
# 最简单的方式：
git config lfs.url https://user:password@git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo
```

或在 `.lfsconfig` 中配置（不含密码）：

```ini
[lfs]
    url = https://git-lfs-cloudflare.your-subdomain.workers.dev/owner/repo
```

## 自定义域名

在 `wrangler.toml` 中添加：

```toml
routes = [
  { pattern = "lfs.example.com/*", zone_name = "example.com" }
]
```

或通过 Cloudflare Dashboard 设置 Custom Domain。

## 安全说明

- 所有请求都需要 Basic Auth 认证，使用常量时间比较防止时序攻击
- R2 对象上传时使用 SHA-256 校验（OID 即为 SHA-256 哈希），防止数据篡改
- 建议通过 HTTPS 访问（Workers 默认 HTTPS）
- 生产环境建议使用强密码或集成 OAuth/Token 认证

## 限制

- Worker 单次请求最长执行时间：30s (Free) / 无限制 (Paid)
- R2 单个对象最大：5 TB
- R2 单次 PUT 最大：5 GB（超大文件需要 multipart upload）
- Workers Free 计划每日 100,000 请求

## License

MIT
