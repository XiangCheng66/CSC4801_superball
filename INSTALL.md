# Superball 安装指南

**中文** | [English](INSTALL.en.md)

验收使用 Docker 路径。本机开发可单独启动 Django 与 Vite。以下命令从仓库根目录执行，除非步骤明确切换目录。

## 依赖与版本

- 容器运行需要 Docker Desktop 或 Docker Engine，Compose 须支持 `docker compose up --wait --wait-timeout`。使用 Linux 容器，宿主机无需安装 Python、Node.js 或 PostgreSQL。
- 构建使用 `node:22-bookworm-slim` 与 `python:3.12-slim-bookworm`。Compose 数据库使用 `postgres:17-bookworm`。这些镜像已在 [Dockerfile](Dockerfile) 与 [compose.yaml](compose.yaml) 声明。
- 本机开发需要 Python 3.11 或 3.12、Node.js 22.12 至 22.x、npm 10 或 11、PostgreSQL 17。Python 和前端依赖分别锁定在 [requirements.lock](requirements.lock) 与 [frontend/package-lock.json](frontend/package-lock.json)。

## 获取代码与配置

克隆仓库。验收指定版本时，在同一目录执行 `git checkout --detach <40-character-sha>` 并将占位符替换为实际提交。

```sh
git clone https://github.com/XiangCheng66/CSC4801_superball.git
cd CSC4801_superball
```

从示例创建本地配置。Windows PowerShell 使用 `Copy-Item .env.example .env`，macOS 或 Linux 使用 `cp .env.example .env`。已有配置时保留原文件。

把 `.env` 中的 `DJANGO_SECRET_KEY` 和 `POSTGRES_PASSWORD` 替换为各自独立的随机值。Django 密钥至少 50 字符，可用密码管理器生成。

| 变量 | 本地配置 |
|---|---|
| `DJANGO_SECRET_KEY` | 本机独立密钥。示例默认关闭调试时必须是有效值。 |
| `DJANGO_DEBUG` / `DJANGO_ALLOWED_HOSTS` | 本地容器用 `0` 和 `localhost,127.0.0.1`。 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` / `DJANGO_SECURE_COOKIES` | Vite 默认信任两个 5173 来源。改变 Vite 来源时更新清单。HTTP 本地环境使用 `0`。 |
| `DATABASE_ENGINE` | 应用使用 `postgresql`。Compose 固定此值。 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | 本地数据库名、用户和密码，库与用户默认名为 `superball`。 |
| `POSTGRES_HOST` / `POSTGRES_PORT` | 本机连接默认 `127.0.0.1:5432`。Compose 内部使用 `db:5432`，此端口变量在 Docker 路径控制宿主机映射。 |
| `APP_PORT` | 应用的宿主机端口，默认 `8000`。 |
| `SEED_AUTH_DEMO` | 保持 `0`，由下文的显式命令初始化完整演示数据。 |

Django 与 Compose 读取本地 `.env`。该文件由 Git 和 Docker 构建上下文忽略。

## Docker 构建、迁移与运行

```sh
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
docker compose ps
```

构建阶段安装前端锁定依赖、运行 Vitest 并编译静态文件。应用容器在数据库健康后启动，入口脚本执行 `python manage.py migrate --noinput` 再启动 Gunicorn。

两项服务健康后，打开 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。可访问 [数据库健康检查](http://127.0.0.1:8000/api/health/) 确认已连接。

并行验收时可使用单独检出目录，在其中的 `.env` 设置未占用的 `APP_PORT` 和 `POSTGRES_PORT`，并为每条 Compose 命令加上同一个项目名，例如 `docker compose -p superball-review ps`。浏览器使用设定的应用端口。

## 重置并初始化本地演示数据

在已迁移的本地演示数据库执行一条命令。它会清空业务记录、重置保留演示账号并重建固定数据集。

```sh
docker compose exec -T app python manage.py seed_demo
```

本机开发等价命令为 `python manage.py seed_demo`。本地演示账号和数据清单见 [README](README.md) 和 [演示数据说明](docs/DEMO_DATA.md)。

## 运行单元测试

Docker 构建已经运行前端单元测试。启动后在容器内运行完整 PostgreSQL 后端套件，包括两个真实并发预约用例。

```sh
docker compose exec -T -e TEST_DATABASE_ENGINE=postgresql app python -m pytest tests/unit -q -ra -o cache_dir=/tmp/pytest-cache
```

pytest-django 创建独立 `test_<POSTGRES_DB>` 库并在完成后清理。本机开发安装完成后可用 README 的单条命令非交互运行前后端套件。默认 SQLite 可用 `python -m pytest tests/unit -q -ra` 快速运行其余后端测试。

CI 使用 Python 3.12、PostgreSQL 17 和 Node.js 22，执行依赖、Django 配置、迁移遗漏、单元测试和前端构建检查。 [CI](.github/workflows/ci.yml)

## 本机开发

### 1. 准备数据库

二选一。可用 `docker compose up -d --wait db` 仅启动数据库，再让本机 Django 使用 `.env` 配置的宿主机端口。也可启动本机 PostgreSQL，先以管理员运行 `psql -U postgres -d postgres`，再执行一次以下命令。

```sql
CREATE ROLE superball LOGIN CREATEDB;
\password superball
CREATE DATABASE superball OWNER superball;
```

在密码提示处使用 `.env` 中的本地数据库密码。若配置使用其他库名或用户，替换示例中的名称。

### 2. 安装并启动 Django

Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

macOS 或 Linux

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

若安装的是 Python 3.11，将创建虚拟环境命令的版本换成 3.11。以上 seed 步骤使用专用演示库。

### 3. 启动 Vite

从仓库根目录打开第二个终端。

```sh
cd frontend
npm ci
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。Vite 将 `/api/` 转发到 `127.0.0.1:8000`。后端端口改变时在启动 Vite 前设置 `API_PROXY_TARGET`。Windows 若拦截 `npm.ps1`，使用 `npm.cmd`。

## 浏览器验收

1. 使用 `candidate1` 登录，在「岗位推荐」查看 `[DEMO-A2] Backend Developer` 为 100 分，再从「面试预约」为 `Interviewing` 申请预订未来时段。
2. 在「我的申请」核对预约时间。退出后用 `employer1` 登录，在雇主工作台确认同一预约。

可选 Playwright 测试需 Node.js 与 Chromium。从独立、已初始化的演示库开始，在 `frontend/` 执行下列命令。

```sh
npm ci
npx playwright install chromium
APP_URL=http://127.0.0.1:8000 npm run test:e2e
```

Windows PowerShell 运行测试前使用 `$env:APP_URL = 'http://127.0.0.1:8000'`，再执行 `npm.cmd run test:e2e`。本机 Vite 改用 5173，Docker 端口与实际配置一致。重跑前用 seed 命令恢复该测试库。

## 故障排查与停止服务

| 现象 | 处理 |
|---|---|
| Docker 启动超时 | 运行 `docker compose ps` 和 `docker compose logs db app` 查看数据库、迁移及密钥错误。 |
| 端口已占用 | 在 `.env` 设置其他 `APP_PORT` 或 `POSTGRES_PORT`，重建服务并使用相应端口。 |
| 数据库拒绝连接或认证 | 检查数据库是否运行及本机端口、用户和密码。已有卷的密码不会随 `.env` 自动改变。 |
| 缺表或迁移失败 | 查看容器启动日志。本机开发执行 `python manage.py migrate --noinput`。 |
| `403 csrf_failed` | 统一使用 `127.0.0.1` 或 `localhost`，核对 Vite 来源与 Cookie 配置。 |
| `frontend_not_built` | 本机开发访问 Vite 5173。Docker 重新构建 app 镜像。 |
| npm 引擎错误或 npm 10 出现 `edgesOut` | 核对 Node.js 22.12 至 22.x。若遇到 `edgesOut`，可在 `frontend/` 执行 `npx --yes npm@11 ci`。 |

停止容器用 `docker compose down`，数据库卷会保留。
