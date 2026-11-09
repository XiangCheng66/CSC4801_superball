# Installation Guide

当前可运行账号、资料/私有简历/岗位推荐、投递与本人申请、公司/岗位管理与雇主面试时段。雇主申请人/状态和候选人预约创建已接通；统一 seed_demo 已提供完整业务重置和演示数据。

## Prerequisites and Versions

- 本机开发：Python 3.11 或 3.12、Node.js 22（至少 22.12，低于 23）、npm 10/11、PostgreSQL 17。
- 容器运行：Docker Engine/Desktop 和支持 `docker compose up --wait` 的 Compose。镜像为 `node:22-bookworm-slim`、`python:3.12-slim-bookworm`、`postgres:17-bookworm`，均在 Dockerfile/compose.yaml 显式声明。只使用容器时无需在宿主机安装 Node、Python 或 PostgreSQL。
- Python 完整版本锁在 `requirements.lock`，直接依赖范围在 `requirements.in`；React/构建/测试依赖锁在 `frontend/package-lock.json`。
- 核心功能、单元测试和浏览器测试均不使用第三方模型或付费 API。

## Environment Variables

在仓库根目录复制配置（Windows PowerShell）：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

macOS/Linux 使用 `test -f .env || cp .env.example .env`。用随机值替换 `.env` 的 `DJANGO_SECRET_KEY` 与 `POSTGRES_PASSWORD` 占位值，可用密码管理器生成，或使用已有 Python 执行 `python -c "import secrets; print(secrets.token_urlsafe(48))"`。`.env` 不提交，manage.py 和 Compose 均读取它。

| 变量 | 用途 / 本地值 |
|---|---|
| `DJANGO_DEBUG` | 示例默认 `0`；仅本机开发排查时设 `1` |
| `DJANGO_SECRET_KEY` | 稳定的本地秘密；DEBUG=0 时必须至少 50 字符且不能是示例占位值 |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1`，逗号分隔 |
| `DATABASE_ENGINE` | 默认 `postgresql`；`sqlite` 仅为显式的轻量开发选项 |
| `POSTGRES_DB` / `POSTGRES_USER` | 默认均为 `superball` |
| `POSTGRES_PASSWORD` | 本地数据库密码，与数据库创建时一致 |
| `POSTGRES_HOST` / `POSTGRES_PORT` | 本机默认 `127.0.0.1:5432`；`POSTGRES_PORT` 同时控制 Compose 的宿主机映射，app 容器仍连接 `db:5432` |
| `APP_PORT` | Compose 的宿主机网站端口，默认 `8000`；与本机 Vite 或其他副本隔离时修改 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 默认允许本地 Vite 的 `http://localhost:5173,http://127.0.0.1:5173` |
| `DJANGO_SECURE_COOKIES` | HTTP 本机为 `0`，HTTPS 环境应为 `1` |
| `SEED_AUTH_DEMO` | 默认 `0`；本地设 `1` 时，启动只补齐缺失的四个演示账号，保留已有账号与密码 |
| `TEST_DATABASE_ENGINE` | 默认独立 SQLite 内存测试库；`postgresql` 时使用独立 `test_<POSTGRES_DB>` 库 |

## Docker Build and Startup

从目标提交的干净 checkout 开始，在根目录准备好 `.env` 后执行：

```bash
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
docker compose exec -T app python manage.py seed_demo
docker compose ps
```

打开 **http://127.0.0.1:8000**（或配置的 `APP_PORT`）。镜像构建时执行前端单元测试并打包 React。PostgreSQL 的 TCP 端口就绪后，应用自动迁移并启动 Gunicorn；`--wait` 确认两个服务健康后才执行 seed。`/api/health/` 应返回 `data.status=ok`、`data.database=postgresql`。

验收或并行开发可以在独立 checkout 设置不同的 `APP_PORT`、`POSTGRES_PORT`，并给每条 Compose 命令加同一个项目名，例如 `docker compose -p superball-review …`，使数据库卷与已有环境隔离。

应用本身的独立构建命令为 `docker build -t superball-app .`；完整环境仍按上面的 Compose 命令启动数据库与应用，依赖镜像不隐式下载。

常用命令：

```bash
docker compose logs app
docker compose exec app python manage.py migrate --noinput
docker compose exec -T app python manage.py seed_demo
docker compose exec -T app python -m pytest tests/unit -q -o cache_dir=/tmp/pytest-cache
docker compose exec -T -e TEST_DATABASE_ENGINE=postgresql app python -m pytest tests/unit -q -o cache_dir=/tmp/pytest-cache
docker compose down
```

`postgres_data` 卷在普通 `down` 后保留。完全重置本地 Compose 演示库时可运行 `docker compose down --volumes`，再按上面的启动与 seed 步骤重建；该操作会清空此 Compose 项目的数据库卷。

构建和容器验收见 [A 收尾交接](docs/A_FINAL_HANDOFF.md)。上述测试把缓存放到 /tmp，以适配镜像中非 root 的 student 用户。PostgreSQL 测试库只用于测试，单元测试无需 seed。

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
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

macOS/Linux 对应命令：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_demo
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
| `candidate1`、`candidate2`、`candidate3` | Candidate | `LocalDemo!2026` |
| `employer1`、`employer2` | Employer | `LocalDemo!2026` |

邮箱为 `<username>@example.test`。

`python manage.py seed_demo` 是唯一的完整重置入口：先按外键顺序删除预约、时段、申请、岗位、公司资料、候选人资料与 `e2e_` 前缀的临时账号，再重建固定演示数据集，一条命令满足 FP-DOC-3。`--no-reset` 只做增量补齐，不清库。

数据集包含：5 个账号、2 家公司、4 个岗位（`[Local demo] Interview availability`、`[DEMO-A2] Backend Developer`、`[DEMO-A2] Generalist`、`[Local demo] Data Analyst`）、5 条覆盖 `Pending/Interviewing/Rejected/Accepted` 的申请，以及北京时间明天 09:00、09:30 两个开放时段。

candidate1/2/3 的技能分别为 Python+SQL、Python、Rust，对 `[DEMO-A2] Backend Developer`（要求 Python+SQL）得分 100/50/0，对空要求岗位均为 100。candidate1 与 candidate3 的申请都是 `Interviewing` 且同属 employer1，可争抢同一时段。**岗位标题是浏览器测试的定位依据**，改名要同步 e2e。

`seed_auth_demo`、`seed_candidate_demo`、`seed_availability_demo` 保留为增量命令；日常开发和浏览器测试统一使用 `seed_demo`。

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

资料/推荐、投递与本人申请、公司/岗位和时段管理均有真实用例；SQLite 仅跳过两项 PostgreSQL 行锁并发测试，PostgreSQL 跑完整套件。

## Continuous Integration

`.github/workflows/ci.yml` 在 push、PR 和手动触发时运行：

- Python 3.12、锁定依赖、Django 配置与迁移检查，以及 `python -m pytest tests/unit -v -ra`。
- 临时 PostgreSQL 17 service，使用公开的 CI-only 凭证；测试库为独立 `test_superball_ci`，不使用本地 `.env` 或演示数据。
- Node 22，`npm ci`、`npm test`、`npm run build`。

工作流配置不要求 GitHub Secrets。业务未实现的 skip 在日志中保留明确原因，不作为需求通过证据。推送后在 [GitHub Actions](https://github.com/XiangCheng66/CSC4801_superball/actions) 检查对应 commit 的真实运行结果。后端测试库隔离与服务容器配置分别参考 [Django 测试文档](https://docs.djangoproject.com/en/5.2/topics/testing/overview/) 和 [GitHub PostgreSQL service 文档](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)。

## Optional Browser Smoke Test

先 `migrate`，再执行 `python manage.py seed_demo`（一条命令重置并灌入全部演示数据）；完整浏览器测试依赖这套数据。启动服务后在 frontend 执行：

```bash
npx playwright install chromium
npm run test:e2e
```

浏览器测试覆盖发布岗位、推荐、投递、时段删除保护、并行重复投递、直接越权、同浏览器换账号后的简历隔离及手机布局；使用 e2e_ 演示账号，不调用外部服务。

已有 Edge 的 Windows 可不下载 Chromium：

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run test:e2e
```

`APP_URL` 可指定另一个本地入口，例如 Compose 的 `http://127.0.0.1:8000`。截图位于被 Git 忽略的 `frontend/test-results/`。

## A Day 3：投递和我的申请

沿用现有环境、依赖和迁移，已有账号无需重置。本地演示可执行 `python manage.py seed_demo`（会重置演示业务数据）；以 `candidate3 / LocalDemo!2026` 登录，在岗位推荐给 `[DEMO-A2] Generalist` 投递，切换“我的申请”查看 Pending，再刷新页面确认仍在。回到推荐，已投递岗位显示当前状态，不能重复投递。

candidate1/2/3 可查看统一 seed 的四种申请状态。已有 Booking 时显示其时段和北京时间，状态后来改变也继续显示；当前 seed 不创建预约，可从面试预约入口为合资格申请选时段。接口、权限和 B/C 接入见 [申请契约](docs/APPLICATION_CONTRACT.md)，验证与剩余范围见 [A Day 3 交接](docs/A_DAY3_HANDOFF.md)。

单独验证：`python -m pytest tests/unit/test_applications.py tests/unit/test_workflows.py -q -ra`。完整测试命令保持不变。

## Troubleshooting

- 数据库连接失败：确认 PostgreSQL 正在运行，`.env` 的主机、端口和密码与数据库一致；本机默认和 Compose 容器内端口配置不同。
- 关系/表不存在：先执行 `manage.py migrate --noinput`；不要提交自己的数据库文件或修改已共享的初始迁移。
- 登录/注册 403 `csrf_failed`：用同一个站点主机完成操作，不混用 localhost 和 127.0.0.1；使用公共请求函数，确认 Cookie 与 Origin 配置。
- 401：未登录或会话已失效。重新登录；改了 SECRET_KEY 会使旧会话失效。
- Node 引擎不兼容：使用 Node 22.12+（22 系列）。若 npm 10 安装出现 `edgesOut` 内部错误，可执行 `npx --yes npm@11 ci`，无需全局改动。
- 后端直接访问 `/` 返回 `frontend_not_built`：本机开发使用 Vite 的 5173 入口；容器构建会复制并提供前端文件。
- 端口占用：Docker 预览改 `.env` 的 `APP_PORT` / `POSTGRES_PORT`；Vite 开发改代理目标或 CSRF 配置。
- `up --wait` 报错：用 `docker compose ps` 和 `docker compose logs db app` 检查启动错误。使用已初始化的数据库卷时，修改 `.env` 不会自动修改库中的密码。

## C Day 2：运行时段管理

在已迁移的演示库执行一条命令即可：

```bash
python manage.py seed_demo
```

Compose 对应命令为 `docker compose exec -T app python manage.py seed_demo`。它在 employer1 的 `[Local demo] Interview availability` 岗位下添加北京时间明天 09:00、09:30 两个时段，并同时重建公司、岗位、申请等演示数据（会清空业务行）。只补时段而不清库时用 `python manage.py seed_availability_demo`。employer2 看不到 employer1 的岗位/时段。

雇主登录后的工作台同时显示公司/岗位和时段。发布、编辑或删除岗位会自动刷新时段选择；时段 UI 固定北京时间，API 使用 UTC。有时段的岗位删除返回 409，先删除允许删除的时段后才能删除岗位。求职者可从“面试预约”选择本人 Interviewing 申请。

单独测试：`python -m pytest tests/unit/test_scheduling.py -q -ra`。完整整合验证见 [Day 2 集成记录](docs/DAY2_INTEGRATION.md)。
