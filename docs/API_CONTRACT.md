# 公共 API 与请求约定（A / Day 1）

这是 A/B/C 共同使用的基础契约。以下认证接口已经实现；岗位、申请和预约接口由 B/C 后续补充，不将草稿路径当作已上线功能。

## 请求与响应

- API 使用同源 `/api/` 前缀，所有已定义路径以 `/` 结尾。缺少末尾斜杠返回 JSON 404，不重定向 POST。
- 请求 JSON：`Content-Type: application/json`；接收 JSON：`Accept: application/json`。
- 成功统一为 `{ "data": ... }`。单个资源使用对象；列表在各模块规格中定义分页结构。
- 失败统一为 `{ "error": { "code": "...", "message": "...", "fields": { ... } } }`；`fields` 仅在需要字段校验信息时出现。
- HTTP 状态是程序判断依据；`code` 是稳定的机器标识；`message` 用于显示；不根据错误文字做分支。

例如：

```json
{
  "data": {
    "id": 1,
    "username": "candidate1",
    "email": "candidate1@example.test",
    "display_name": "Demo Candidate 1",
    "role": "Candidate"
  }
}
```

## 会话与 CSRF

采用 Django 数据库会话。会话 ID 保存在 `HttpOnly`、`SameSite=Lax` Cookie 中，不保存到 localStorage，也不在 JSON 中返回。React 开发环境由 Vite 转发 `/api/` 到 Python，构建后由 Python 在同一站点提供页面与 API。

1. 首次写请求前，`GET /api/auth/csrf/` 获取 CSRF Cookie（响应也提供 `data.csrfToken`）。
2. `POST/PUT/PATCH/DELETE` 请求带当前 Cookie 的 `X-CSRFToken`，并携带同源 Cookie。
3. 注册、登录即使匿名也要求 CSRF；成功后建立/轮换会话与 CSRF Cookie。
4. 每次写请求读取当前 CSRF Cookie，不能缓存登录前的旧令牌。
5. 退出使服务端会话失效；页面刷新通过 `GET /api/auth/me/` 恢复登录状态。

前端统一导入 `frontend/src/api/client.js` 的 `apiRequest`：

```js
import { apiRequest } from './api/client'; // 根据调用文件调整相对路径

const user = await apiRequest('/api/auth/me/');
await apiRequest('/api/auth/logout/', { method: 'POST' });
```

它返回已经解包的 `data`，自动发送 Cookie、获取 CSRF、序列化 JSON；失败抛出带 `status`、`code`、`fields` 的 `ApiError`。不会自动重试写请求。调用方根据 `401` 清理登录状态，根据 `403/409` 显示对应错误。取消请求保留 `AbortError`。

## 已实现接口

| 方法 | 路径 | 权限 / CSRF | 成功结果 |
|---|---|---|---|
| GET | `/api/health/` | 公开 | 200；执行真实 `SELECT 1`，返回服务及数据库类型 |
| GET | `/api/auth/csrf/` | 公开 | 200；CSRF 初始化 |
| POST | `/api/auth/register/` | 公开 + CSRF | 201；创建账号并登录，返回公开账号字段 |
| POST | `/api/auth/login/` | 公开 + CSRF | 200；登录并返回公开账号字段 |
| POST | `/api/auth/logout/` | 已登录 + CSRF | 200；`data.message` 为 `Logged out.` |
| GET | `/api/auth/me/` | 已登录 | 200；当前账号（真实数据库记录） |
| GET | `/api/auth/users/<user_id>/` | 已登录且仅本人 | 200；账号所有权检查的参考实现 |
| GET | `/api/candidate/session/` | Candidate | 200；当前账号，仅验证身份基础 |
| GET | `/api/employer/session/` | Employer | 200；当前账号，仅验证身份基础 |

注册字段：`username`（3～150 字符）、`email`、`password`（8～128 字符且通过 Django 密码校验）、`role`（严格为 `Candidate` 或 `Employer`）、可选 `display_name`（最多 100 字符，空值使用用户名）。未知字段拒绝。用户名与邮箱在数据库中不区分大小写唯一，邮箱保存为小写。

登录字段仅为 `username`、`password`；用户名不区分大小写。公开账号字段严格限定为 `id/username/email/display_name/role`，不返回密码哈希、会话 ID 或内部权限标志。

## 错误约定

| HTTP 状态 | code | 含义 |
|---|---|---|
| 400 | `validation_error` | 输入不合法；可带 `fields` |
| 400 | `parse_error` | 无法解析 JSON |
| 401 | `not_authenticated` | 未登录或会话失效 |
| 401 | `invalid_credentials` | 登录凭证错误 |
| 403 | `permission_denied` | 已登录但角色或所有权错误 |
| 403 | `csrf_failed` | CSRF 校验失败 |
| 404 | `not_found` | 路径或允许访问的目标不存在 |
| 405 | `method_not_allowed` | 请求方法不支持 |
| 409 | `account_conflict` | 用户名或邮箱已存在 |
| 415 | `unsupported_media_type` | 非 JSON 请求正文 |
| 500 | `server_error` | 未预期服务错误，不返回堆栈或秘密 |
| 503 | `database_unavailable` | 数据库暂不可用 |

后续 B/C 可在此模式下定义新的冲突代码；面试时段已占用仍必须满足课程的 `409` 和 `Slot already booked` 合同。

## 后端接入示例

默认 API 权限是 `IsAuthenticated`。公开接口必须显式声明 `AllowAny`。

```python
from common.permissions import IsCandidate, get_owned_object
from rest_framework.permissions import IsAuthenticated

# 求职者接口：permission_classes = [IsAuthenticated, IsCandidate]
# 雇主接口：permission_classes = [IsAuthenticated, IsEmployer]
# 在角色检查通过后，检查实际对象归属；owner_field 指向用户 ID：
application = get_owned_object(
    Application.objects.all(), request.user,
    owner_field="candidate_id", pk=application_id,
)
```

先做认证和角色检查，再做对象查询/所有权检查。已有对象但所有权错误返回 403；不存在且调用者原本允许访问的对象返回 404。`get_owned_object` 不是角色检查或全部业务校验的替代；岗位、简历、申请、预约仍须分别补充自己的授权和业务规则。
