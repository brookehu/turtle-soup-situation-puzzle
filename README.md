# 海龟汤车队

一个支持多人聊天、实时语音、主持判定、SAN 进度、关键节点、排行榜和管理员巡查的在线海龟汤房间。测试网页：imolin.cc

## 目录结构

```text
public/          # 唯一公开的静态资源目录
  index.html
  script.js
  styles.css
  assets/
server/          # 服务端代码和数据库 schema，不对外静态暴露
data/            # SQLite 数据库目录，生产环境应挂载为 Docker volume
Dockerfile
docker-compose.yml
```

服务端只会静态发布 `public/`。根目录、`server/`、`data/`、README、日志和环境变量文件不会作为静态资源暴露。

## 本地运行

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000
```

语音需要 LiveKit：

```bash
npm run livekit
```

## Docker 部署

生产环境建议使用 Docker 镜像运行：

```bash
cp .env.example .env
docker compose up -d --build
```

`docker-compose.yml` 会启动：

- `app`：游戏服务，默认暴露 `3000`
- `livekit`：语音服务，默认暴露 `7880/7881/7882udp`，并可按 `.env` 暴露 TURN 端口
- `turtle-data`：SQLite 数据 volume，挂载到 `/app/data`

公网部署时建议放在反向代理后面，并启用 HTTPS/WSS。

## 公网语音部署

LiveKit 分两层连接：

- 信令：浏览器连接 `PUBLIC_LIVEKIT_URL`，通常是 `wss://voice.example.com`。
- 媒体：WebRTC 通过 ICE/TURN 传音频。只让 `voice.example.com` 的 443 能访问，不等于语音媒体一定可用。

公网部署时请确认：

```text
7880/tcp    LiveKit HTTP/WebSocket，通常放在反向代理后面
7881/tcp    WebRTC TCP ICE
7882/udp    WebRTC UDP ICE
3478/udp    TURN UDP，端口可通过 LIVEKIT_TURN_UDP_PORT 修改
5349/tcp    TURN TLS，端口可通过 LIVEKIT_TURN_TLS_PORT 修改
```

如果 `voice.example.com` 使用 Cloudflare 普通橙云代理，WebSocket 信令可能正常，但 UDP/TCP 媒体端口不会自动被普通 HTTP 代理转发。建议选择其中一种方式：

- `voice.example.com` 灰云直连 LiveKit/反向代理，并在服务器防火墙和云安全组放行上面的端口。
- 或者继续让主站走 Cloudflare，但为 LiveKit/TURN 使用可直连的独立域名。
- 或者使用能代理 TCP/UDP 的 L4 服务，例如 Cloudflare Spectrum，并正确转发 ICE/TURN 端口。

`.env` 中 LiveKit 相关项示例：

```env
LIVEKIT_URL=ws://livekit:7880
PUBLIC_LIVEKIT_URL=wss://voice.example.com
LIVEKIT_API_KEY=请改掉
LIVEKIT_API_SECRET=请改掉
LIVEKIT_TURN_ENABLED=true
LIVEKIT_TURN_DOMAIN=voice.example.com
LIVEKIT_TURN_UDP_PORT=3478
LIVEKIT_TURN_TLS_PORT=5349
LIVEKIT_TURN_EXTERNAL_TLS=false
```

修改 `.env` 后重新部署：

```bash
docker compose up -d --build
docker compose logs -f livekit
```

`.env.example` 默认不启用 TURN，避免没有域名/TLS/端口时 LiveKit 启动失败。公网确认端口、域名和 TLS 转发后，把 `LIVEKIT_TURN_ENABLED` 改成 `true`。

电脑端排查语音时，可打开 `chrome://webrtc-internals`。若 `audioInputLevel` 有变化但 outbound audio 的 `bytesSent/packetsSent` 不增长，通常是 ICE/TURN/端口问题；若 `audioInputLevel` 一直为 0，通常是系统输入设备、浏览器权限或麦克风被占用。

## 环境变量

关键配置在 `.env` 中设置：

```env
PORT=3000
DATABASE_PATH=/app/data/turtle.db

HOST_PASSWORD=请改掉
PLAYER_PASSWORD=请改掉
ADMIN_PASSWORD=请改掉

LIVEKIT_URL=ws://livekit:7880
PUBLIC_LIVEKIT_URL=wss://你的语音域名
LIVEKIT_API_KEY=请改掉
LIVEKIT_API_SECRET=请改掉
LIVEKIT_TURN_ENABLED=true
LIVEKIT_TURN_DOMAIN=你的语音域名
LIVEKIT_TURN_EXTERNAL_TLS=false

CORS_ORIGIN=
DISCONNECT_GRACE_MS=12000
EMPTY_ROOM_TTL_MS=43200000
TEST_ROOM_CODES=TS2048
FLEET_RATE_WINDOW_MS=60000
FLEET_RATE_MAX_FAILURES=5
```

说明：

- `CORS_ORIGIN` 留空表示只允许同源访问；多个域名用英文逗号分隔。
- `EMPTY_ROOM_TTL_MS` 默认 12 小时。房间内没有在线主持/管理员后开始倒计时，归档后释放房间号。
- `TEST_ROOM_CODES` 中的房间号不会被自动归档。
- 初始密码界面按 IP 限制失败次数，默认每分钟最多 5 次；输入正确不会计入失败次数。

## 房间归档

房间不会硬删除。自动清理会做软归档：

- `rooms.deleted_at` 写入归档时间。
- `rooms.original_code` 保留原房间号。
- 当前 `rooms.code` 改为内部归档码，从而释放原房间号。
- 聊天、提问、判定、关键节点等历史仍保留在数据库中。

玩家加入已归档或不存在的房间会看到“房间不存在”。

## 身份

- 玩家：加入房间、聊天、提问、查看汤面/记录/排行。
- 主持人：创建房间、编辑汤面汤底、判定、管理玩家、调整房间信息。
- 管理员：查看所有房间、查房进入房间，进入后拥有主持权限，标签显示“管理”。
- 管理员房间列表可按“有人 / 在线 / 归档”筛选，并可主动归档非测试房间。
- 管理员可以禁言或踢出主持人；管理员不能禁言或踢出其他管理员。

密码验证只在服务端完成，前端 HTML 不包含任何密码。

## 移动端体验

竖屏模式下：

- 房间头部和标签栏固定在顶部。
- 聊天输入区固定在底部，输入框可自动增高。
- 排行榜作为独立标签。
- 在线成员条隐藏，减少占屏。
- 管理员语音控制栏只在“管理”标签底部显示。

聊天头像交互：

- 双击头像：拍一拍。
- 手机长按头像：在输入框中 @ 该用户。
- 电脑右键头像：在输入框中 @ 该用户。
- 在聊天中发送 `@主持 问题内容` 会按提问处理，并进入提问结果列表。

头像匹配：

- 优先匹配 `public/assets/avatars/玩家名.{png,jpg,jpeg,webp,gif,svg}`。
- 没有匹配时，从数字命名的默认头像中按玩家名伪随机分配，例如 `1.jpg`、`2.png`、`14.png`。
- 头像异常时回退到 `default.svg`。

## 数据与安全

- 不要把 `data/`、`.env`、日志文件复制进公开目录。
- Docker 镜像不会包含本地数据库和 `.env`。
- 建议定期备份 Docker volume 或 `data/turtle.db`。
- 生产环境请务必修改所有默认密码。

## 检查

```bash
npm run check
```

该命令会检查服务端和前端脚本语法。
