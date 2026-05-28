# 海龟汤车队游戏

这是一个可本地运行的多人海龟汤原型：

- REST API：车队密码、创建房间、加入房间、LiveKit token
- Socket.IO：聊天、玩家状态、SAN、提问、主持判定、提示、静音状态
- SQLite：用户、房间、成员、聊天、问题、结果、语音事件日志
- LiveKit SFU：多人实时语音通话
- 主持工具：汤面/汤底编辑、确认后公开汤底、关键节点完成度
- 头像：按玩家名从 `assets/avatars/` 自动匹配图片

## 启动

安装依赖：

```bash
npm install
```

启动 LiveKit：

```bash
npm run livekit
```

启动游戏服务：

```bash
npm start
```

打开：

```text
http://localhost:3000
```

演示密码：

- 主持人：`host2026`
- 玩家：`soup2026`

## 本地端口

- 游戏服务：`http://localhost:3000`
- LiveKit：`ws://localhost:7880`

部署到服务器时，浏览器不能继续使用 `ws://localhost:7880`，否则会连到玩家自己的电脑。请在 `.env` 设置：

```text
PUBLIC_LIVEKIT_URL=wss://你的语音域名
```

如果直接暴露 7880 端口，也可以使用 `ws://服务器IP:7880`；公网麦克风通常还需要 HTTPS/WSS。

## 数据

默认数据库文件：

```text
data/turtle.db
```

主要表：

- `users`
- `rooms`
- `room_players`
- `game_sessions`
- `questions`
- `question_results`
- `chat_messages`
- `voice_logs`

## 头像

把头像图片放到：

```text
assets/avatars/
```

文件名使用玩家名，例如：

```text
assets/avatars/阿芜.png
assets/avatars/HostSmoke.webp
```

支持 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.svg`。没有同名文件时使用 `assets/avatars/default.svg`。

## 注意

LiveKit 必须先启动，语音通话才能连接。即使 LiveKit 没启动，房间、聊天、提问、SAN 和主持判定仍然可用。

当前机器如果没有 Docker，也可以安装 LiveKit Server 后运行：

```bash
livekit-server --dev --bind 0.0.0.0
```
