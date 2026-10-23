# Installation Guide — A + C / Day 1

当前可运行 React 账号页面、Python 认证 API 和 PostgreSQL 数据库；共享匹配与排序可由后端调用并单独测试。公司、岗位、申请、推荐页面接入与预约仍待实现。本指南的 seed 只生成认证演示账号，不是最终项目的完整业务数据集。

## Prerequisites and Versions

- 本机开发：Python 3.11 或 3.12、Node.js 22（至少 22.12，低于 23）、npm 10/11、PostgreSQL 17。
- 容器运行：Docker Engine/Desktop 和 Docker Compose v2；镜像为 `node:22-bookworm-slim`、`python:3.12-slim-bookworm`、`postgres:17-bookworm`。所有依赖镜像均在 Dockerfile/compose.yaml 显式声明。
- Python 完整版本锁在 `requirements.lock`，直接依赖范围在 `requirements.in`；React/构建/测试依赖锁在 `frontend/package-lock.json`。
- 核心功能、单元测试和浏览器测试均不使用第三方模型或付费 API。

## Environment Variables

在仓库根目录复制配置（Windows PowerShell）：

```powershell
Copy-Item .env.example .env
```

macOS/Linux 使用 `cp .env.example .env`。修改 `.env` 的 `DJANGO_SECRET_KEY` 与 `POSTGRES_PASSWORD` 占位值；可用 `python -c "import secrets; print(secrets.token_urlsafe(48))"` 生成本地随机值。`.env` 不提交，manage.py 和 Compose 均读取它。

| 变量 | 用途 / 本地值 |
|---|---|
| `DJANGO_DEBUG` | 本地为 `1`；共享部署设 `0` |
| `DJANGO_SECRET_KEY` | 稳定的本地秘密；DEBUG=0 时必须至少 50 字符且不能是示例占位值 |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1`，逗号分隔 |
| `DATABASE_ENGINE` | 默认 `postgresql`；`sqlite` 仅为显式的轻量开发选项 |
| `POSTGRES_DB` / `POSTGRES_USER` | 默认均为 `superball` |
| `POSTGRES_PASSWORD` | 本地数据库密码，与数据库创建时一致 |
| `POSTGRES_HOST` / `POSTGRES_PORT` | 本机默认 `127.0.0.1:5432`；Compose 自动覆盖为 `db:5432` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 默认允许本地 Vite 的 `http://localhost:5173,http://127.0.0.1:5173` |
| `DJANGO_SECURE_COOKIES` | HTTP 本机为 `0`，HTTPS 环境应为 `1` |
| `SEED_AUTH_DEMO` | Compose 设 `1` 时启动生成公开的本地演示账号；否则不自动 seed |
| `TEST_DATABASE_ENGINE` | 默认独立 SQLite 内存测试库；`postgresql` 时使用独立 `test_<POSTGRES_DB>` 库 |

## Docker Build and Startup

在根目录准备好 `.env` 后执行：

```bash
docker compose pull db
docker compose build app
docker compose up -d
docker compose ps
```

打开 **http://127.0.0.1:8000**。应用镜像构建时执行前端单元测试并打包 React；启动时自动迁移，按 `SEED_AUTH_DEMO` 生成演示账号，然后用 Gunicorn 在同一站点提供前端与 API。数据库健康后才启动应用。

应用本身的独立构建命令为 `docker build -t superball-app .`；完整环境仍按上面的 Compose 命令启动数据库与应用，依赖镜像不隐式下载。

常用命令：

```bash
docker compose logs app
docker compose exec app python manage.py migrate --noinput
docker compose exec app python manage.py seed_auth_demo
docker compose exec app python -m pytest tests/unit -q
docker compose exec -e TEST_DATABASE_ENGINE=postgresql app python -m pytest tests/unit -q
docker compose down
```

`postgres_data` 卷在普通 `down` 后保留。仅需完全重置本地 Compose 演示库时执行 `docker compose down --volumes`，然后重新 `docker compose up -d`；该操作会清空此 Compose 项目的数据库卷。

完整应用镜像构建仍待验证；仅启动 PostgreSQL 测试容器不能代替应用 Dockerfile/Compose 的完整构建与启动验证。

## Local Development

### 1. 数据库

安装 PostgreSQL 17（Windows 官方入口：https://www.postgresql.org/download/windows/）。使用本地管理员账号进入 `psql` 后执行一次，密码应与 `.env` 一致：

```sql
CREATE ROLE superball LOGIN PASSWORD 'replace-with-a-local-database-password' CREATEDB;
CREATE DATABASE superball OWNER superball;
```

`CREATEDB` 供本地 PostgreSQL 隔离测试库使用。也可以用 `docker compose up -d db` 只启动数据库。本机已有数据库时填入对应用户、数据库和端口，避免端口冲突。

### 2. 后端（终端一，仓库根目录）

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py seed_auth_demo
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

macOS/Linux 对应命令：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_auth_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

`GET http://127.0.0.1:8000/api/health/` 应返回 `data.status=ok`、`data.database=postgresql`。它执行真实查询；初始化表仍需上面的 migrate 命令。

### 3. 前端（终端二）

```bash
cd frontend
npm ci
npm run dev
```

PowerShell 执行策略阻止 npm.ps1 时使用 `npm.cmd`。打开 **http://127.0.0.1:5173**。Vite 把 `/api/` 转发到 `127.0.0.1:8000`，保持浏览器同源 Cookie 和 CSRF。

后端端口变化时，在启动 Vite 前设置 `API_PROXY_TARGET`。前端端口变化还需同步 `DJANGO_CSRF_TRUSTED_ORIGINS` 并重启后端。生产构建命令为 `npm run build`，输出 `frontend/dist`；Dockerfile 将它复制到 `/app/frontend_dist`。

## Demo Accounts and Seed

以下密码均为公开的 **local/demo** 凭证：

| 用户名 | 身份 | 密码 |
|---|---|---|
| `candidate1`、`candidate2` | Candidate | `LocalDemo!2026` |
| `employer1`、`employer2` | Employer | `LocalDemo!2026` |

邮箱为 `<username>@example.test`。`python manage.py seed_auth_demo` 可重复执行，会更新这四个保留演示账号并重设演示密码，不删除其他用户，也不重置未来 B/C 的业务数据。

最终项目的一条完整重置/seed 命令、岗位、匹配案例、四种申请状态和预约竞争数据仍由 B/C 共同补齐。

## Running Unit Tests

后端（根目录；不需要运行开发服务器）：

```powershell
.\.venv\Scripts\python.exe -m pytest tests/unit -q
```

默认测试使用独立 SQLite 内存库。验证实际 PostgreSQL 时，确保 `.env` 配置的 PostgreSQL 可用，然后：

```powershell
$env:TEST_DATABASE_ENGINE = 'postgresql'
.\.venv\Scripts\python.exe -m pytest tests/unit -q
Remove-Item Env:TEST_DATABASE_ENGINE
```

macOS/Linux 为 `TEST_DATABASE_ENGINE=postgresql .venv/bin/python -m pytest tests/unit -q`。pytest-django 仅创建/清理 `test_<POSTGRES_DB>`，不使用应用演示库做单元测试。

前端（frontend 目录）：

```bash
npm test
npm run build
```

单独运行 C 的匹配测试（macOS/Linux，仓库根目录）：

```bash
.venv/bin/python -m pytest tests/unit/test_matching.py -v
```

未实现的候选人业务、雇主业务和预约测试明确标记为 skipped，不是已完成需求。测试失败会返回非零退出码。

## Continuous Integration

`.github/workflows/ci.yml` 在 push、PR 和手动触发时运行：

- Python 3.12、锁定依赖、Django 配置与迁移检查，以及 `python -m pytest tests/unit -v -ra`。
- 临时 PostgreSQL 17 service，使用公开的 CI-only 凭证；测试库为独立 `test_superball_ci`，不使用本地 `.env` 或演示数据。
- Node 22，`npm ci`、`npm test`、`npm run build`。

工作流配置不要求 GitHub Secrets。业务未实现的 skip 在日志中保留明确原因，不作为需求通过证据。当前配置尚未推送，因此尚无远程 Actions 运行记录。后端测试库隔离与服务容器配置分别参考 [Django 测试文档](https://docs.djangoproject.com/en/5.2/topics/testing/overview/) 和 [GitHub PostgreSQL service 文档](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)。

## Optional Browser Smoke Test

先迁移并 seed 本地演示库，再启动上述后端和前端，在 frontend 目录执行：

```bash
npx playwright install chromium
npm run test:e2e
```

测试访问本地演示环境，验证登录、刷新恢复、角色检查、退出、注册、防重复以及手机布局。它会创建 `e2e_` 前缀的保留测试账号，使用可重置的本地演示库；不连接外部服务。

已有 Edge 的 Windows 可不下载 Chromium：

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run test:e2e
```

`APP_URL` 可指定另一个本地入口，例如 Compose 的 `http://127.0.0.1:8000`。截图位于被 Git 忽略的 `frontend/test-results/`。

## Troubleshooting

- 数据库连接失败：确认 PostgreSQL 正在运行，`.env` 的主机、端口和密码与数据库一致；本机默认和 Compose 容器内端口配置不同。
- 关系/表不存在：先执行 `manage.py migrate --noinput`；不要提交自己的数据库文件或修改已共享的初始迁移。
- 登录/注册 403 `csrf_failed`：用同一个站点主机完成操作，不混用 localhost 和 127.0.0.1；使用公共请求函数，确认 Cookie 与 Origin 配置。
- 401：未登录或会话已失效。重新登录；改了 SECRET_KEY 会使旧会话失效。
- Node 引擎不兼容：使用 Node 22.12+（22 系列）。若 npm 10 安装出现 `edgesOut` 内部错误，可执行 `npx --yes npm@11 ci`，无需全局改动。
- 后端直接访问 `/` 返回 `frontend_not_built`：本机开发使用 Vite 的 5173 入口；容器构建会复制并提供前端文件。
- 端口占用：先确认运行中的本地实例，再调整端口与对应代理/CSRF 配置。
