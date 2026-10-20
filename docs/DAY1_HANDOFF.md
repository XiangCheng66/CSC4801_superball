# A 第一天交接

负责人：XiangCheng66。范围：项目与认证骨架、公共请求约定。

## 已交付

- React 账号入口：注册、登录、会话恢复、账号信息刷新、角色检查、退出；桌面及手机布局。
- Django/DRF 项目、PostgreSQL 配置、初始自定义 User 迁移；用户名/邮箱唯一、角色 CHECK 约束和密码哈希。
- 会话 Cookie + CSRF；匿名受保护请求 401、角色/所有权错误 403、缺失对象 404。
- 公共 JSON 成功/错误格式、前端 `apiRequest/ApiError`、后端角色/所有权辅助函数。
- 四个认证演示账号和幂等 seed；锁定依赖、开发代理、Dockerfile/Compose、安装文档。

## 验证证据

- 后端真实业务测试：26 项通过；另有 13 项未实现业务测试明确 skipped。
- 相同后端测试在独立 PostgreSQL 测试库通过；演示库不用于单元测试。
- 前端 Vitest：13 项通过；生产构建通过；从锁文件执行干净 `npm ci` 通过。
- Playwright + 本地 PostgreSQL：登录/刷新/角色检查/退出、手机布局、雇主注册/重复账号拒绝，3 项通过。
- 浏览器验证使用了构建后的 React，由 DEBUG=0 的 Python 服务直接提供页面与静态资源；同时验证了开发代理登录流程。
- 数据库迁移检查和依赖一致性检查通过。
- Docker 命令尚未执行：本次机器没有 Docker。容器配置需要在有 Docker 的机器验证，不能把本机验证当作镜像构建通过。

具体复现命令见 [INSTALL.md](../INSTALL.md)，请求契约见 [API_CONTRACT.md](API_CONTRACT.md)。

## B/C 接入

1. 从合并后的公共基础创建自己的功能分支；用户外键引用 `settings.AUTH_USER_MODEL`。
2. 后端新 View 默认要求登录。显式使用 `IsCandidate/IsEmployer`，并调用对象所有权检查；不要只在 React 隐藏按钮。
3. 返回 `{data: ...}`；通过 DRF 异常或约定错误响应保持 HTTP 状态与错误格式。不要返回密码哈希或 session ID。
4. React 统一调用 `apiRequest('/api/.../')`；它处理 Cookie、当前 CSRF 和错误解析，不另建 JWT/localStorage 认证逻辑。
5. 后端路由在 `backend/config/urls.py` 的 API fallback 之前注册，避免新接口落入 JSON 404。
6. 把自己的模板 skip 替换成真实断言，更新 README 需求映射与 SPEC。CI 由 C 接入这些公开测试/构建命令。

## 后续范围

A 下一步为个人资料、技能和私有简历，随后接入 B 的投递与 C 的匹配/预约。B 的公司/岗位/申请和 C 的匹配/预约均未在本次实现。

当前 seed 只覆盖认证账号；完整重置/业务 seed、匹配案例、四种申请状态和预约竞争数据仍待 B/C 协作完成。
