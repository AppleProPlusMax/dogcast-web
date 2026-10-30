# dogcast-web

Dogcast 的网页端。同一个 Vue 应用里可以打开房间、分享屏幕，也可以凭房间号观看。采屏只用浏览器的 `getDisplayMedia`，画面和声音通过 WebRTC 传到观看端。

配套后端是独立仓库 [dogcast-server](https://github.com/AppleProPlusMax/dogcast-server)。开发时本仓库把 `/api` 和 `/ws` 代理到 `http://127.0.0.1:3000`。

## 能做什么

- 首页点「开始分享」即可打开一个房间，房间号和访问令牌记在本次浏览器会话里。朋友打开 `/watch/房间号` 观看，不需要注册。
- 手机可以观看，不能发起分享。
- 分享默认请求 1920×1080、60fps，并同时请求音频。浏览器弹窗里需要勾选分享音频；没采到音轨时仍然推画面，并提示当前无音频。
- 分享端只上传一路。第一个观众直接连接分享端，之后的观众由已经连上的人转发。房间里最多 1 人分享、4 人观看。
- 观看端可以静音、调音量；浏览器拦截自动播放时，点一下即可出声。
- `/settings` 里可以选择画质、上传预算，并测 5 秒上行。

## 画质和上行

默认画质是 1080p60，目标码率 12 Mbps。上传预算默认 24 Mbps，按这一跳要直接发送的人数平分，每一路最高 20 Mbps。实际采用目标和分到的预算里较小的那个。

这个码率会写进分享端发出的 SDP（`b=AS` 和 `x-google-start-bitrate`）。只改编码参数时，Chrome 会把屏幕分享停在大约 0.3 Mbps。画面几乎不动时，码率仍会低于目标，因为没变化的区域不会持续占满带宽。改完画质或预算后，需要停止并重新开始分享，新的连接描述才会生效。

「测 5 秒上行」要先打开过房间。它向 `POST /api/speed-test` 连续上传，单次不超过 768KB，这样默认 `client_max_body_size 1m` 的 Nginx 也能测完。在 `localhost` 上测到的是访问本机的速度，不会改预算；在部署好的网站上测完，会把中位速度的七成填进上传预算（限制在 12–80 Mbps）。

## 环境

- Node.js 20 或更高
- 先把 dogcast-server 跑在本机 3000 端口。打开房间不需要账号
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
| `/` | 开始分享，或填写房间号进入观看 |
| `/room` | 分享端：预览、成员、复制观看链接 |
| `/watch/:code` | 凭房间号观看 |
| `/settings` | 画质、上传预算、音量 |

`/login` 和 `/register` 会回到首页。分享端的房间号只在当前标签页的 `sessionStorage` 里，关掉标签页后需要重新开始。

## 断线

WebSocket 断开后会按 1 秒、2 秒……最多 30 秒退避重连，然后重新鉴权并进房。分享不会自动恢复，需要再点一次「开始分享」（浏览器不允许在没有手势时重新采屏）。如果房间里仍有人在分享，观看会自动重新占用名额并等待新的 offer。

## 目录

```text
src/
  views/          Home、Room、Watch、Settings
  components/     播放区、分享控制、成员列表、音频提示
  stores/         auth、room、webrtc、ui
  api/            fetch（401 时刷新一次）和 WebSocket
  webrtc/         分享、观看、观众转发、码率
  router/
```
