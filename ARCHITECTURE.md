# 海龟汤车队架构草案

## 分层

当前实现已落在 `server/index.js`。登录/大厅层走 REST API：

- `POST /api/fleet/verify`：验证车队密码，返回身份、用户信息、短期 token
- `POST /api/rooms`：创建房间
- `GET /api/rooms/:code`：验证房间是否存在
- `POST /api/rooms/:code/join`：加入房间并返回初始 `room_state`
- `POST /api/livekit/token`：签发 LiveKit 入会 token

游戏实时层走 Socket：

- `room_state`
- `chat_message`
- `voice_status`
- `san_update`
- `question_submit`
- `question_result`
- `host_hint`
- `player_join`
- `player_leave`
- `mute_status`

语音层使用 LiveKit SFU。4 到 10 人通话不建议 P2P Mesh，连接数和上行带宽会增长过快。

## Socket 消息

玩家提问：

```json
{
  "event": "question_submit",
  "content": "他是自杀吗？",
  "playerId": "u102"
}
```

主持判定：

```json
{
  "event": "question_result",
  "questionId": "q901",
  "result": "MAYBE",
  "sanCost": 2
}
```

SAN 同步：

```json
{
  "event": "san_update",
  "roomId": "r2048",
  "value": 98
}
```

## 数据表

`users`

- `id`
- `nickname`
- `role`
- `created_at`

`rooms`

- `id`
- `code`
- `name`
- `password_hash`
- `host_id`
- `status`
- `created_at`

`room_players`

- `room_id`
- `user_id`
- `role`
- `muted`
- `joined_at`
- `left_at`

`game_sessions`

- `id`
- `room_id`
- `san_value`
- `started_at`
- `ended_at`

`questions`

- `id`
- `room_id`
- `player_id`
- `question`
- `created_at`

`question_results`

- `id`
- `question_id`
- `host_id`
- `result`
- `san_cost`
- `hint`
- `created_at`

`chat_messages`

- `id`
- `room_id`
- `user_id`
- `message`
- `created_at`

`voice_logs` 可选，只记录连接、静音、断开等事件，不保存语音内容。

## 枚举

```ts
enum Answer {
  YES = "是",
  NO = "不是",
  MAYBE = "是也不是",
  IRRELEVANT = "不重要"
}
```
