# dogcast-web

Dogcast 的网页端。同一个 Vue 应用里可以登录、进房间、分享屏幕，也可以观看别人的分享。采屏只用浏览器的 `getDisplayMedia`，画面和声音通过 WebRTC 直接传到观看端。

配套后端是独立仓库 [dogcast-server](https://github.com/AppleProPlusMax/dogcast-server)。开发时本仓库把 `/api` 和 `/ws` 代理到 `http://127.0.0.1:3000`。

## 能做什么

- `/login` 登录，`/register` 用邀请码注册。Access Token 放在内存里，刷新页面时靠 httpOnly cookie 恢复会话。
- 登录后进入 `/room`，自动加入默认家庭房，看到在线成员和当前是否有人在分享。
- 「开始分享」会请求 1920×1080、60fps 的画面，并同时请求音频。浏览器弹窗里需要勾选分享音频；没采到音轨时仍然推画面，并提示当前无音频。
- 每个观看者一条 `RTCPeerConnection`。房间里最多 1 人分享、4 人观看。后进房间的人会自动占一个观看位，等分享端补发 offer。
- 观看端可以静音、调音量；浏览器拦截自动播放时，点一下即可出声。
- `/settings` 里可以改显示名偏好、目标码率、调试用的 TURN relay，以及登出。

## 环境

- Node.js 20 或更高
- 先把 dogcast-server 跑在本机 3000 端口，并至少建好一个账号
- 分享端验收用 Chrome 或 Edge（Windows）。macOS 上分享标签页并勾选标签页音频更稳。Firefox / Safari 可以观看，不作为分享端的保证路径

`getDisplayMedia` 需要安全上下文。本地用 `localhost` 即可，生产必须是 HTTPS。

## 本地启动

```bash
npm install
copy .env.example .env
npm run dev
```

打开 `http://localhost:5173`。`.env` 里 `VITE_API_BASE` 留空时，请求走当前页面，由 Vite 代理到后端。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器，端口 5173 |
| `npm run typecheck` | `vue-tsc` 与 Node 侧 `tsc` |
| `npm run build` | 类型检查后输出 `dist/` |
| `npm run preview` | 预览构建结果 |

生产部署时，把 `dist/` 交给 Nginx 做静态站点，并把 `/api`、`/ws` 反代到 dogcast-server。同源部署下 `VITE_API_BASE` 继续留空。如果 API 不在同一主机，构建前设置 `VITE_API_BASE`；WebSocket 地址可用 `VITE_WS_BASE` 单独指定。

## 页面

| 路径 | 作用 |
| --- | --- |
| `/login` | 用户名和密码 |
| `/register` | 邀请码注册 |
| `/room` | 观看区、成员列表、开始/停止分享 |
| `/settings` | 偏好、码率、强制 relay、登出 |

未登录访问 `/room` 或 `/settings` 会去登录页。已登录再打开登录或注册页会回到房间。

## 断线

WebSocket 断开后会按 1 秒、2 秒……最多 30 秒退避重连，然后重新鉴权并进房。分享不会自动恢复，需要再点一次「开始分享」（浏览器不允许在没有手势时重新采屏）。如果房间里仍有人在分享，观看会自动重新占用名额并等待新的 offer。

## 目录

```text
src/
  views/          Login、Register、Room、Settings
  components/     播放区、分享控制、成员列表、音频提示
  stores/         auth、room、webrtc、ui
  api/            fetch（401 时刷新一次）和 WebSocket
  webrtc/         分享端多条 PC、观看端一条 PC、采集约束
  router/
```
