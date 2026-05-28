import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { AccessToken } from "livekit-server-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);
const dbPath = path.resolve(rootDir, process.env.DATABASE_PATH || "./data/turtle.db");
const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
const publicLivekitUrl = process.env.PUBLIC_LIVEKIT_URL || "";
const livekitApiKey = process.env.LIVEKIT_API_KEY || "devkey";
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || "secret";
const hostPassword = process.env.HOST_PASSWORD || "host2026";
const playerPassword = process.env.PLAYER_PASSWORD || "soup2026";
const adminPassword = process.env.ADMIN_PASSWORD || "admin2026";

const answerMap = {
  是: "YES",
  不是: "NO",
  是也不是: "MAYBE",
  接近: "CLOSE",
  不重要: "IRRELEVANT",
  YES: "YES",
  NO: "NO",
  MAYBE: "MAYBE",
  CLOSE: "CLOSE",
  IRRELEVANT: "IRRELEVANT",
};

const answerLabelMap = {
  YES: "是",
  NO: "不是",
  MAYBE: "是也不是",
  CLOSE: "接近",
  IRRELEVANT: "不重要",
};

const scoreMap = {
  YES: 3,
  MAYBE: 2,
  CLOSE: 2,
  NO: 1,
  IRRELEVANT: -1,
};

const disconnectTimers = new Map();
const disconnectGraceMs = Number(process.env.DISCONNECT_GRACE_MS || 12000);

const defaultSoup = {
  title: "雨夜车站",
  text: "一个男人在雨夜走进空荡荡的车站。他看见墙上的时刻表后，立刻买了最晚的一班车票。第二天，警方在他的家里找到了真相。",
  answer:
    "男人是通缉犯。他以为自己已经摆脱追捕，但时刻表上的停运通知暴露了有人伪装列车确认他的住处，警方随后找到他的家。",
};

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
migrate();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(express.static(rootDir));
app.use("/vendor/livekit", express.static(path.join(rootDir, "node_modules/livekit-client/dist")));

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function roomCode() {
  return `TS${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeName(name) {
  return String(name || "新成员").trim().slice(0, 16) || "新成员";
}

function isAdmin(user) {
  return Boolean(user?.is_admin);
}

function authRole(user) {
  return isAdmin(user) ? "admin" : user?.role;
}

function memberRole(user) {
  return isAdmin(user) ? "host" : user?.role;
}

function canManage(user) {
  return user?.role === "host" || isAdmin(user);
}

function migrate() {
  const columns = db.prepare("PRAGMA table_info(rooms)").all().map((column) => column.name);
  if (!columns.includes("answer_text")) {
    db.exec("ALTER TABLE rooms ADD COLUMN answer_text TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.includes("answer_revealed")) {
    db.exec("ALTER TABLE rooms ADD COLUMN answer_revealed INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.includes("san_max")) {
    db.exec("ALTER TABLE rooms ADD COLUMN san_max INTEGER NOT NULL DEFAULT 100");
  }
  if (!columns.includes("max_members")) {
    db.exec("ALTER TABLE rooms ADD COLUMN max_members INTEGER NOT NULL DEFAULT 10");
  }
  if (!columns.includes("locked")) {
    db.exec("ALTER TABLE rooms ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  }

  const playerColumns = db.prepare("PRAGMA table_info(room_players)").all().map((column) => column.name);
  if (!playerColumns.includes("voice_blocked")) {
    db.exec("ALTER TABLE room_players ADD COLUMN voice_blocked INTEGER NOT NULL DEFAULT 0");
  }

  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("client_id")) {
    db.exec("ALTER TABLE users ADD COLUMN client_id TEXT");
  }
  if (!userColumns.includes("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }

  const chatColumns = db.prepare("PRAGMA table_info(chat_messages)").all().map((column) => column.name);
  if (!chatColumns.includes("kind")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'");
  }
  if (!chatColumns.includes("ref_question_id")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN ref_question_id TEXT");
  }
  if (!chatColumns.includes("reply_to_name")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_name TEXT");
  }

  const questionColumns = db.prepare("PRAGMA table_info(questions)").all().map((column) => column.name);
  if (!questionColumns.includes("featured")) {
    db.exec("ALTER TABLE questions ADD COLUMN featured INTEGER NOT NULL DEFAULT 0");
  }

  const resultSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'question_results'").get()?.sql || "";
  if (!resultSql.includes("'CLOSE'")) {
    db.exec(`
      CREATE TABLE question_results_next (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        host_id TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('YES', 'NO', 'MAYBE', 'CLOSE', 'IRRELEVANT')),
        san_cost INTEGER NOT NULL DEFAULT 2,
        hint TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id),
        FOREIGN KEY (host_id) REFERENCES users(id)
      );
      INSERT INTO question_results_next (id, question_id, host_id, result, san_cost, hint, created_at)
      SELECT id, question_id, host_id, result, san_cost, hint, created_at FROM question_results;
      DROP TABLE question_results;
      ALTER TABLE question_results_next RENAME TO question_results;
    `);
  }
}

function findAvatarUrl(name) {
  const avatarDir = path.join(rootDir, "assets", "avatars");
  const safeName = normalizeName(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

  for (const ext of extensions) {
    const filename = `${safeName}${ext}`;
    if (fs.existsSync(path.join(avatarDir, filename))) {
      return `/assets/avatars/${encodeURIComponent(filename)}`;
    }
  }

  return "/assets/avatars/default.svg";
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.nickname,
    role: isAdmin(user) ? "管理" : user.role === "host" ? "主持" : "玩家",
    muted: Boolean(user.muted),
    voiceBlocked: Boolean(user.voice_blocked),
    online: Boolean(user.online),
    avatarUrl: findAvatarUrl(user.nickname),
  };
}

function createUser(nickname, role, clientId = "", admin = false) {
  const user = { id: id("u"), nickname: normalizeName(nickname), role, client_id: clientId, is_admin: admin ? 1 : 0 };
  db.prepare("INSERT INTO users (id, nickname, role, client_id, is_admin) VALUES (?, ?, ?, ?, ?)").run(
    user.id,
    user.nickname,
    user.role,
    clientId || null,
    user.is_admin,
  );
  return user;
}

function updateNickname(userId, nickname, clientId = "", admin = null) {
  const nextName = normalizeName(nickname);
  if (admin !== null && clientId) {
    db.prepare("UPDATE users SET nickname = ?, client_id = ?, is_admin = ? WHERE id = ?").run(
      nextName,
      clientId,
      admin ? 1 : 0,
      userId,
    );
  } else if (admin !== null) {
    db.prepare("UPDATE users SET nickname = ?, is_admin = ? WHERE id = ?").run(nextName, admin ? 1 : 0, userId);
  } else if (clientId) {
    db.prepare("UPDATE users SET nickname = ?, client_id = ? WHERE id = ?").run(nextName, clientId, userId);
  } else {
    db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nextName, userId);
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function getRoomByCode(code) {
  return db.prepare("SELECT * FROM rooms WHERE code = ?").get(String(code || "").trim().toUpperCase());
}

function getRoomMembers(roomId) {
  return db
    .prepare(
      `SELECT users.id, users.nickname, users.is_admin, room_players.role, room_players.muted,
              room_players.voice_blocked, room_players.online
       FROM room_players
       JOIN users ON users.id = room_players.user_id
       WHERE room_players.room_id = ? AND room_players.left_at IS NULL AND room_players.online = 1
       ORDER BY room_players.joined_at ASC`,
    )
    .all(roomId)
    .map(publicUser);
}

function getChatHistory(roomId) {
  return db
    .prepare(
      `SELECT chat_messages.id, chat_messages.message, chat_messages.kind,
              chat_messages.ref_question_id, chat_messages.reply_to_name,
              chat_messages.created_at, users.id AS user_id, users.nickname
       FROM chat_messages
       JOIN users ON users.id = chat_messages.user_id
       WHERE chat_messages.room_id = ?
       ORDER BY chat_messages.created_at ASC`,
    )
    .all(roomId)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.nickname,
      text: row.message,
      kind: row.kind || "chat",
      questionId: row.ref_question_id || "",
      replyToName: row.reply_to_name || "",
      createdAt: row.created_at,
    }));
}

function getQuestionHistory(roomId) {
  return db
    .prepare(
      `SELECT questions.id, questions.question, questions.created_at, questions.featured,
              users.id AS player_id, users.nickname,
              latest_results.result, latest_results.san_cost, latest_results.hint
       FROM questions
       JOIN users ON users.id = questions.player_id
       LEFT JOIN (
         SELECT question_results.*
         FROM question_results
         JOIN (
           SELECT question_id, MAX(created_at) AS created_at
           FROM question_results
           GROUP BY question_id
         ) latest
           ON latest.question_id = question_results.question_id
          AND latest.created_at = question_results.created_at
       ) latest_results ON latest_results.question_id = questions.id
       WHERE questions.room_id = ?
       ORDER BY questions.created_at DESC`,
    )
    .all(roomId)
    .map((row) => ({
      id: row.id,
      question: row.question,
      playerId: row.player_id,
      playerName: row.nickname,
      result: row.result ? answerLabelMap[row.result] : "等待判定",
      sanCost: row.san_cost || 0,
      note: row.hint || (row.result ? "" : "等待主持人判定。"),
      featured: Boolean(row.featured),
      createdAt: row.created_at,
    }));
}

function getLeaderboard(roomId) {
  const rows = db
    .prepare(
      `SELECT users.nickname, questions.id, questions.featured, latest_results.result
       FROM questions
       JOIN users ON users.id = questions.player_id
       LEFT JOIN (
         SELECT question_results.*
         FROM question_results
         JOIN (
           SELECT question_id, MAX(created_at) AS created_at
           FROM question_results
           GROUP BY question_id
         ) latest
           ON latest.question_id = question_results.question_id
          AND latest.created_at = question_results.created_at
       ) latest_results ON latest_results.question_id = questions.id
       WHERE questions.room_id = ?`,
    )
    .all(roomId);

  const board = new Map();
  for (const row of rows) {
    const name = row.nickname || "未知";
    const item = board.get(name) || { name, total: 0, questions: 0, average: 0 };
    item.questions += 1;
    item.total += (scoreMap[row.result] || 0) + (row.featured ? 5 : 0);
    board.set(name, item);
  }

  for (const member of getRoomMembers(roomId)) {
    if (member.role !== "玩家" || board.has(member.name)) continue;
    board.set(member.name, { name: member.name, total: 0, questions: 0, average: 0 });
  }

  return [...board.values()]
    .map((item) => ({
      ...item,
      average: item.questions ? Number((item.total / item.questions).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name, "zh-CN"));
}

function getProgressNodes(roomId, includeAll = false) {
  const rows = db
    .prepare(
      `SELECT id, label, completed, sort_order
       FROM progress_nodes
       WHERE room_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(roomId);

  return rows
    .map((row) => ({
      id: row.id,
      label: includeAll || row.completed ? row.label : "未解锁关键节点",
      completed: Boolean(row.completed),
      sortOrder: row.sort_order,
    }));
}

function getRoomState(roomId, options = {}) {
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);
  if (!room) return null;

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    soupTitle: room.soup_title,
    soupText: room.soup_text,
    answerRevealed: Boolean(room.answer_revealed),
    answerText: room.answer_revealed || options.includeAnswer ? room.answer_text : "",
    san: room.san_value,
    sanMax: room.san_max,
    maxMembers: room.max_members,
    locked: Boolean(room.locked),
    status: room.status,
    members: getRoomMembers(room.id),
    chats: getChatHistory(room.id),
    questions: getQuestionHistory(room.id),
    progressNodes: getProgressNodes(room.id, options.includeAllProgress),
    leaderboard: getLeaderboard(room.id),
  };
}

function getRoomStateForUser(roomId, user) {
  return getRoomState(roomId, {
    includeAnswer: canManage(user),
    includeAllProgress: canManage(user),
  });
}

function memberKey(roomId, userId) {
  return `${roomId}:${userId}`;
}

function clearDisconnectTimer(roomId, userId) {
  const key = memberKey(roomId, userId);
  const timer = disconnectTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  disconnectTimers.delete(key);
}

function retireUserFromRooms(userId) {
  const rows = db
    .prepare("SELECT room_id FROM room_players WHERE user_id = ? AND left_at IS NULL")
    .all(userId);
  db.prepare("UPDATE room_players SET online = 0, left_at = CURRENT_TIMESTAMP WHERE user_id = ? AND left_at IS NULL").run(
    userId,
  );
  for (const targetSocket of io.sockets.sockets.values()) {
    if (targetSocket.data.user?.id === userId) {
      targetSocket.emit("player_kicked", { playerId: userId, reason: "same_client_replaced" });
      targetSocket.disconnect(true);
    }
  }
  for (const row of rows) {
    clearDisconnectTimer(row.room_id, userId);
    emitRoomState(row.room_id);
  }
}

function retireOtherClientUsers(clientId, keepUserId = "") {
  if (!clientId) return;
  const users = db
    .prepare("SELECT id FROM users WHERE client_id = ? AND id != ?")
    .all(clientId, keepUserId || "");
  for (const user of users) retireUserFromRooms(user.id);
}

function scheduleDisconnectCleanup(roomId, userId) {
  clearDisconnectTimer(roomId, userId);
  const key = memberKey(roomId, userId);
  disconnectTimers.set(
    key,
    setTimeout(() => {
      disconnectTimers.delete(key);
      const active = db
        .prepare("SELECT online, left_at FROM room_players WHERE room_id = ? AND user_id = ?")
        .get(roomId, userId);
      if (!active || active.online || active.left_at) return;
      db.prepare("UPDATE room_players SET left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ?").run(
        roomId,
        userId,
      );
      emitRoomState(roomId);
    }, disconnectGraceMs),
  );
}

function getRoomHostName(roomId) {
  const host = db
    .prepare(
      `SELECT users.nickname
       FROM rooms
       LEFT JOIN users ON users.id = rooms.host_id
       WHERE rooms.id = ?`,
    )
    .get(roomId);
  return host?.nickname || "主持人";
}

function getAdminRoomList() {
  return db
    .prepare(
      `SELECT rooms.id, rooms.code, rooms.name, rooms.soup_title, rooms.san_value, rooms.san_max,
              rooms.max_members, rooms.locked, rooms.status, rooms.created_at,
              host.nickname AS host_name,
              COUNT(room_players.user_id) AS member_count,
              SUM(CASE WHEN room_players.online = 1 AND room_players.left_at IS NULL THEN 1 ELSE 0 END) AS online_count,
              (SELECT COUNT(*) FROM questions WHERE questions.room_id = rooms.id) AS question_count,
              (SELECT COUNT(*) FROM chat_messages WHERE chat_messages.room_id = rooms.id) AS chat_count
       FROM rooms
       LEFT JOIN users host ON host.id = rooms.host_id
       LEFT JOIN room_players ON room_players.room_id = rooms.id AND room_players.left_at IS NULL
       GROUP BY rooms.id
       ORDER BY rooms.created_at DESC`,
    )
    .all()
    .map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      soupTitle: room.soup_title,
      hostName: room.host_name || "无",
      san: room.san_value,
      sanMax: room.san_max,
      maxMembers: room.max_members,
      locked: Boolean(room.locked),
      status: room.status,
      memberCount: room.member_count || 0,
      onlineCount: room.online_count || 0,
      questionCount: room.question_count || 0,
      chatCount: room.chat_count || 0,
      createdAt: room.created_at,
    }));
}

function createChatMessage({ roomId, userId, message, kind = "chat", questionId = "", replyToName = "" }) {
  const chatId = id("cm");
  db.prepare(
    `INSERT INTO chat_messages (id, room_id, user_id, message, kind, ref_question_id, reply_to_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(chatId, roomId, userId, message, kind, questionId || null, replyToName || null);

  const user = db.prepare("SELECT nickname FROM users WHERE id = ?").get(userId);
  const chat = {
    id: chatId,
    userId,
    name: user?.nickname || "",
    text: message,
    kind,
    questionId,
    replyToName,
    createdAt: new Date().toISOString(),
  };
  io.to(roomId).emit("chat_message", chat);
  return chat;
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function requireSession(req, res, next) {
  const userId = req.header("x-user-id");
  const roomId = req.header("x-room-id");
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;
  const room = roomId ? db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId) : null;

  if (!user || !room) {
    res.status(401).json({ error: "缺少有效用户或房间会话。" });
    return;
  }

  req.user = user;
  req.room = room;
  next();
}

function emitRoomState(roomId) {
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return;

  for (const socketId of sockets) {
    const target = io.sockets.sockets.get(socketId);
    if (!target) continue;
    target.emit("room_state", getRoomStateForUser(roomId, target.data.user));
  }
}

function emitHostState(socket) {
  socket.emit("host_state", getRoomState(socket.data.room.id, { includeAnswer: true, includeAllProgress: true }));
}

function getClientLivekitUrl(req) {
  if (publicLivekitUrl) return publicLivekitUrl;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("host") || `localhost:${port}`;

  if (livekitUrl.includes("localhost") || livekitUrl.includes("127.0.0.1")) {
    const scheme = protocol === "https" ? "wss" : "ws";
    const livekitPort = new URL(livekitUrl).port;
    const hostname = host.split(":")[0];
    return `${scheme}://${hostname}${livekitPort ? `:${livekitPort}` : ""}`;
  }

  return livekitUrl;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, livekitUrl, publicLivekitUrl: publicLivekitUrl || null });
});

app.post("/api/fleet/verify", (req, res) => {
  const { password, nickname, userId, clientId } = req.body;
  const role = password === adminPassword ? "admin" : password === hostPassword ? "host" : password === playerPassword ? "player" : null;

  if (!role) {
    res.status(401).json({ error: "车队密码不正确。" });
    return;
  }

  const dbRole = role === "admin" ? "host" : role;
  const admin = role === "admin";
  const existingUser = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;
  if (existingUser && (existingUser.role !== dbRole || isAdmin(existingUser) !== admin)) {
    retireUserFromRooms(existingUser.id);
  }
  const user =
    existingUser?.role === dbRole && isAdmin(existingUser) === admin
      ? updateNickname(existingUser.id, nickname || existingUser.nickname, clientId, admin)
      : createUser(nickname, dbRole, clientId, admin);
  retireOtherClientUsers(clientId, user.id);
  res.json({ user: { id: user.id, name: user.nickname, role }, role });
});

app.post("/api/session/resume", (req, res) => {
  const { userId, roomCode, nickname, clientId } = req.body;
  let user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;

  if (!user) {
    res.status(401).json({ error: "登录信息已失效，请重新输入车队密码。" });
    return;
  }

  if (nickname || clientId) user = updateNickname(user.id, nickname || user.nickname, clientId);
  retireOtherClientUsers(clientId, user.id);

  const role = authRole(user);
  const response = { user: { id: user.id, name: user.nickname, role }, role };
  const room = roomCode ? getRoomByCode(roomCode) : null;
  if (room) {
    clearDisconnectTimer(room.id, user.id);
    db.prepare(
      `INSERT INTO room_players (room_id, user_id, role, muted, online, left_at)
       VALUES (?, ?, ?, 1, 1, NULL)
       ON CONFLICT(room_id, user_id) DO UPDATE SET
         role = excluded.role,
         muted = 1,
         online = 1,
         left_at = NULL`,
    ).run(room.id, user.id, memberRole(user));
    response.room = getRoomStateForUser(room.id, user);
  }

  res.json(response);
});

app.post("/api/rooms", (req, res) => {
  const { userId, nickname, name, soupTitle, soupText, answerText, clientId, maxMembers, sanMax, locked } = req.body;
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user || !canManage(user)) {
    res.status(403).json({ error: "只有主持人可以创建房间。" });
    return;
  }

  user = updateNickname(user.id, nickname || user.nickname, clientId);
  retireOtherClientUsers(clientId, user.id);

  let code = roomCode();
  while (getRoomByCode(code)) code = roomCode();

  const room = {
    id: id("r"),
    code,
    name: String(name || "海龟汤房间").trim().slice(0, 32) || "海龟汤房间",
    soupTitle: String(soupTitle || defaultSoup.title).trim().slice(0, 40) || defaultSoup.title,
    soupText: String(soupText || defaultSoup.text).trim().slice(0, 2000) || defaultSoup.text,
    answerText: String(answerText || defaultSoup.answer).trim().slice(0, 4000) || defaultSoup.answer,
    maxMembers: clampInt(maxMembers, 10, 2, 20),
    sanMax: clampInt(sanMax, 100, 10, 999),
    locked: locked ? 1 : 0,
  };

  db.prepare(
    `INSERT INTO rooms (id, code, name, soup_title, soup_text, answer_text, host_id, san_value, san_max, max_members, locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    room.id,
    room.code,
    room.name,
    room.soupTitle,
    room.soupText,
    room.answerText,
    user.id,
    room.sanMax,
    room.sanMax,
    room.maxMembers,
    room.locked,
  );
  db.prepare("INSERT INTO game_sessions (id, room_id, san_value) VALUES (?, ?, ?)").run(id("gs"), room.id, room.sanMax);
  db.prepare("INSERT INTO room_players (room_id, user_id, role, muted) VALUES (?, ?, ?, 1)").run(
    room.id,
    user.id,
    memberRole(user),
  );

  res.status(201).json({ room: getRoomState(room.id, { includeAnswer: true, includeAllProgress: true }) });
});

app.get("/api/rooms/:code", (req, res) => {
  const room = getRoomByCode(req.params.code);
  if (!room) {
    res.status(404).json({ error: "房间不存在。" });
    return;
  }
  res.json({ room: getRoomState(room.id) });
});

app.get("/api/admin/rooms", (req, res) => {
  const user = req.query.userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(req.query.userId) : null;
  if (!user || !isAdmin(user)) {
    res.status(403).json({ error: "只有管理员可以查看房间列表。" });
    return;
  }
  res.json({ rooms: getAdminRoomList() });
});

app.post("/api/rooms/:code/join", (req, res) => {
  const { userId, nickname, clientId } = req.body;
  const room = getRoomByCode(req.params.code);
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!room || !user) {
    res.status(404).json({ error: "用户或房间不存在。" });
    return;
  }

  user = updateNickname(user.id, nickname || user.nickname, clientId);
  retireOtherClientUsers(clientId, user.id);
  clearDisconnectTimer(room.id, user.id);
  const existingMember = db
    .prepare("SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND left_at IS NULL")
    .get(room.id, user.id);

  if (room.locked && !canManage(user) && !existingMember) {
    res.status(423).json({ error: "房间已锁定，暂时不能加入。" });
    return;
  }

  const count = db
    .prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_id = ? AND left_at IS NULL AND user_id != ?")
    .get(room.id, user.id).count;
  if (count >= room.max_members && !canManage(user)) {
    res.status(409).json({ error: "房间人数已满。" });
    return;
  }

  db.prepare(
    `INSERT INTO room_players (room_id, user_id, role, muted, online, left_at)
     VALUES (?, ?, ?, 1, 1, NULL)
     ON CONFLICT(room_id, user_id) DO UPDATE SET
       role = excluded.role,
       muted = 1,
       online = 1,
       left_at = NULL`,
  ).run(room.id, user.id, memberRole(user));

  res.json({ room: getRoomStateForUser(room.id, user) });
});

app.post("/api/rooms/:code/leave", (req, res) => {
  const { userId } = req.body;
  const room = getRoomByCode(req.params.code);
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;

  if (!room || !user) {
    res.status(404).json({ error: "用户或房间不存在。" });
    return;
  }

  clearDisconnectTimer(room.id, user.id);
  db.prepare(
    "UPDATE room_players SET online = 0, left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ?",
  ).run(room.id, user.id);
  emitRoomState(room.id);
  res.json({ ok: true });
});

app.post("/api/rooms/:code/settings", (req, res) => {
  const { userId, name, maxMembers, sanMax, sanValue, locked } = req.body;
  const room = getRoomByCode(req.params.code);
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;

  if (!room || !user) {
    res.status(404).json({ error: "用户或房间不存在。" });
    return;
  }
  if (!canManage(user)) {
    res.status(403).json({ error: "只有主持人可以修改房间设置。" });
    return;
  }

  const nextName = String(name || room.name).trim().slice(0, 32) || room.name;
  const nextMaxMembers = clampInt(maxMembers, room.max_members, 2, 20);
  const nextSanMax = clampInt(sanMax, room.san_max, 10, 999);
  const nextSanValue = Math.min(nextSanMax, clampInt(sanValue, room.san_value, 0, nextSanMax));
  const nextLocked = locked ? 1 : 0;

  db.prepare(
    `UPDATE rooms
     SET name = ?, max_members = ?, locked = ?, san_max = ?, san_value = ?
     WHERE id = ?`,
  ).run(nextName, nextMaxMembers, nextLocked, nextSanMax, nextSanValue, room.id);
  db.prepare(
    `UPDATE game_sessions SET san_value = ?
     WHERE room_id = ? AND ended_at IS NULL`,
  ).run(nextSanValue, room.id);
  emitRoomState(room.id);
  res.json({ room: getRoomState(room.id, { includeAnswer: true, includeAllProgress: true }) });
});

app.post("/api/rooms/:code/reset", (req, res) => {
  const { userId } = req.body;
  const room = getRoomByCode(req.params.code);
  const user = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;

  if (!room || !user) {
    res.status(404).json({ error: "用户或房间不存在。" });
    return;
  }
  if (!canManage(user)) {
    res.status(403).json({ error: "只有主持人可以重置游戏。" });
    return;
  }

  const questionIds = db.prepare("SELECT id FROM questions WHERE room_id = ?").all(room.id).map((row) => row.id);
  for (const questionId of questionIds) {
    db.prepare("DELETE FROM question_results WHERE question_id = ?").run(questionId);
  }
  db.prepare("DELETE FROM questions WHERE room_id = ?").run(room.id);
  db.prepare("DELETE FROM chat_messages WHERE room_id = ?").run(room.id);
  db.prepare("DELETE FROM progress_nodes WHERE room_id = ?").run(room.id);
  db.prepare("UPDATE rooms SET san_value = san_max, answer_revealed = 0 WHERE id = ?").run(room.id);
  db.prepare(
    `UPDATE game_sessions
     SET san_value = (SELECT san_max FROM rooms WHERE id = ?)
     WHERE room_id = ? AND ended_at IS NULL`,
  ).run(room.id, room.id);
  const nextRoom = db.prepare("SELECT san_value FROM rooms WHERE id = ?").get(room.id);
  io.to(room.id).emit("game_reset", { san: nextRoom?.san_value || room.san_max });
  emitRoomState(room.id);
  res.json({ room: getRoomState(room.id, { includeAnswer: true, includeAllProgress: true }) });
});

app.post("/api/livekit/token", requireSession, async (req, res) => {
  const at = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: req.user.id,
    name: req.user.nickname,
    ttl: "2h",
  });

  at.addGrant({
    room: req.room.code,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  res.json({
    url: getClientLivekitUrl(req),
    token: await at.toJwt(),
    room: req.room.code,
    identity: req.user.id,
  });
});

io.use((socket, next) => {
  const { userId, roomId } = socket.handshake.auth;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);

  if (!user || !room) {
    next(new Error("无效 Socket 会话。"));
    return;
  }

  socket.data.user = user;
  socket.data.room = room;
  next();
});

io.on("connection", (socket) => {
  const { user, room } = socket.data;
  socket.join(room.id);

  clearDisconnectTimer(room.id, user.id);
  db.prepare("UPDATE room_players SET online = 1, left_at = NULL WHERE room_id = ? AND user_id = ?").run(room.id, user.id);
  db.prepare("INSERT INTO voice_logs (id, room_id, user_id, event) VALUES (?, ?, ?, ?)").run(
    id("vl"),
    room.id,
    user.id,
    "socket_connect",
  );

  db.prepare("UPDATE room_players SET muted = 1 WHERE room_id = ? AND user_id = ?").run(room.id, user.id);

  io.to(room.id).emit("player_join", { user: publicUser({ ...user, muted: 1, online: 1 }) });
  emitRoomState(room.id);
  if (canManage(user)) emitHostState(socket);

  socket.on("chat_message", (payload = {}) => {
    const message = String(payload.text || payload.message || "").trim().slice(0, 1000);
    if (!message) return;

    createChatMessage({ roomId: room.id, userId: user.id, message });
  });

  socket.on("question_submit", (payload = {}) => {
    const content = String(payload.content || "").trim().slice(0, 1000);
    if (!content) return;

    const questionId = id("q");
    db.prepare("INSERT INTO questions (id, room_id, player_id, question) VALUES (?, ?, ?, ?)").run(
      questionId,
      room.id,
      user.id,
      content,
    );
    createChatMessage({
      roomId: room.id,
      userId: user.id,
      message: `@${getRoomHostName(room.id)} ${content}`,
      kind: "question",
      questionId,
    });
    io.to(room.id).emit("question_submit", {
      id: questionId,
      content,
      playerId: user.id,
      playerName: user.nickname,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("question_result", (payload = {}) => {
    if (!canManage(user)) return;
    const result = answerMap[payload.result];
    const questionId = String(payload.questionId || "");
    const question = db.prepare("SELECT * FROM questions WHERE id = ? AND room_id = ?").get(questionId, room.id);
    if (!result || !question) return;

    const sanCost = Number.isFinite(Number(payload.sanCost)) ? Math.max(0, Number(payload.sanCost)) : 2;
    const hint = String(payload.note || payload.hint || "").trim().slice(0, 1000);
    db.prepare("DELETE FROM question_results WHERE question_id = ?").run(questionId);
    db.prepare(
      `INSERT INTO question_results (id, question_id, host_id, result, san_cost, hint)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id("qr"), questionId, user.id, result, sanCost, hint);

    const currentSan = db.prepare("SELECT san_value FROM rooms WHERE id = ?").get(room.id).san_value;
    const nextSan = Math.max(0, currentSan - sanCost);
    db.prepare("UPDATE rooms SET san_value = ? WHERE id = ?").run(nextSan, room.id);
    db.prepare(
      `UPDATE game_sessions SET san_value = ?
       WHERE room_id = ? AND ended_at IS NULL`,
    ).run(nextSan, room.id);

    io.to(room.id).emit("question_result", {
      questionId,
      question: question.question,
      playerName: db.prepare("SELECT nickname FROM users WHERE id = ?").get(question.player_id)?.nickname || "",
      result: answerLabelMap[result],
      note: hint,
      sanCost,
    });
    createChatMessage({
      roomId: room.id,
      userId: user.id,
      message: hint ? `${answerLabelMap[result]}：${hint}` : answerLabelMap[result],
      kind: "judgement",
      questionId,
      replyToName: db.prepare("SELECT nickname FROM users WHERE id = ?").get(question.player_id)?.nickname || "",
    });
    io.to(room.id).emit("san_update", { value: nextSan });
    emitRoomState(room.id);
  });

  socket.on("question_feature", (payload = {}) => {
    if (!canManage(user)) return;
    const questionId = String(payload.questionId || payload.id || "");
    const question = db.prepare("SELECT * FROM questions WHERE id = ? AND room_id = ?").get(questionId, room.id);
    if (!question) return;
    const featured = payload.featured ? 1 : 0;
    db.prepare("UPDATE questions SET featured = ? WHERE id = ? AND room_id = ?").run(featured, questionId, room.id);
    io.to(room.id).emit("question_featured", { questionId, featured: Boolean(featured) });
    emitRoomState(room.id);
  });

  socket.on("question_delete", (payload = {}) => {
    if (!canManage(user)) return;
    const questionId = String(payload.questionId || payload.id || "");
    const question = db.prepare("SELECT * FROM questions WHERE id = ? AND room_id = ?").get(questionId, room.id);
    if (!question) return;

    const costRows = db.prepare("SELECT san_cost FROM question_results WHERE question_id = ?").all(questionId);
    const currentRoom = db.prepare("SELECT san_value, san_max FROM rooms WHERE id = ?").get(room.id);
    const restoredSan = Math.min(
      currentRoom?.san_max || 100,
      (currentRoom?.san_value || 0) +
        costRows.reduce((total, row) => total + (row.san_cost || 0), 0),
    );

    db.prepare("DELETE FROM question_results WHERE question_id = ?").run(questionId);
    db.prepare("DELETE FROM questions WHERE id = ? AND room_id = ?").run(questionId, room.id);
    db.prepare("UPDATE rooms SET san_value = ? WHERE id = ?").run(restoredSan, room.id);
    db.prepare(
      `UPDATE game_sessions SET san_value = ?
       WHERE room_id = ? AND ended_at IS NULL`,
    ).run(restoredSan, room.id);

    io.to(room.id).emit("question_deleted", { questionId, san: restoredSan });
    io.to(room.id).emit("san_update", { value: restoredSan });
    emitRoomState(room.id);
  });

  socket.on("host_hint", (payload = {}) => {
    if (!canManage(user)) return;
    const content = String(payload.content || "").trim().slice(0, 1000);
    if (!content) return;
    createChatMessage({
      roomId: room.id,
      userId: user.id,
      message: `提示：${content}`,
      kind: "hint",
    });
    io.to(room.id).emit("host_hint", {
      content,
      hostId: user.id,
      hostName: user.nickname,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("soup_update", (payload = {}) => {
    if (!canManage(user)) return;
    const soupTitle = String(payload.soupTitle || "").trim().slice(0, 40);
    const soupText = String(payload.soupText || "").trim().slice(0, 2000);
    const answerText = String(payload.answerText || "").trim().slice(0, 4000);
    if (!soupTitle || !soupText || !answerText) return;

    db.prepare("UPDATE rooms SET soup_title = ?, soup_text = ?, answer_text = ? WHERE id = ?").run(
      soupTitle,
      soupText,
      answerText,
      room.id,
    );
    emitRoomState(room.id);
    emitHostState(socket);
  });

  socket.on("room_settings_update", (payload = {}) => {
    if (!canManage(user)) return;
    const current = db.prepare("SELECT * FROM rooms WHERE id = ?").get(room.id);
    if (!current) return;

    const name = String(payload.name || current.name).trim().slice(0, 32) || current.name;
    const maxMembers = clampInt(payload.maxMembers, current.max_members, 2, 20);
    const sanMax = clampInt(payload.sanMax, current.san_max, 10, 999);
    const sanValue = Math.min(sanMax, clampInt(payload.sanValue, current.san_value, 0, sanMax));
    const locked = payload.locked ? 1 : 0;

    db.prepare(
      `UPDATE rooms
       SET name = ?, max_members = ?, locked = ?, san_max = ?, san_value = ?
       WHERE id = ?`,
    ).run(name, maxMembers, locked, sanMax, sanValue, room.id);
    db.prepare(
      `UPDATE game_sessions SET san_value = ?
       WHERE room_id = ? AND ended_at IS NULL`,
    ).run(sanValue, room.id);
    emitRoomState(room.id);
  });

  socket.on("game_reset", () => {
    if (!canManage(user)) return;
    const current = db.prepare("SELECT san_max FROM rooms WHERE id = ?").get(room.id);
    const nextSan = current?.san_max || 100;
    const questionIds = db.prepare("SELECT id FROM questions WHERE room_id = ?").all(room.id).map((row) => row.id);
    for (const questionId of questionIds) {
      db.prepare("DELETE FROM question_results WHERE question_id = ?").run(questionId);
    }
    db.prepare("DELETE FROM questions WHERE room_id = ?").run(room.id);
    db.prepare("DELETE FROM chat_messages WHERE room_id = ?").run(room.id);
    db.prepare("DELETE FROM progress_nodes WHERE room_id = ?").run(room.id);
    db.prepare("UPDATE rooms SET san_value = ?, answer_revealed = 0 WHERE id = ?").run(nextSan, room.id);
    db.prepare(
      `UPDATE game_sessions SET san_value = ?
       WHERE room_id = ? AND ended_at IS NULL`,
    ).run(nextSan, room.id);
    io.to(room.id).emit("game_reset", { san: nextSan });
    emitRoomState(room.id);
  });

  socket.on("answer_reveal", () => {
    if (!canManage(user)) return;
    db.prepare("UPDATE rooms SET answer_revealed = 1 WHERE id = ?").run(room.id);
    emitRoomState(room.id);
  });

  socket.on("progress_add", (payload = {}) => {
    if (!canManage(user)) return;
    const label = String(payload.label || "").trim().slice(0, 120);
    if (!label) return;
    const nextOrder =
      db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM progress_nodes WHERE room_id = ?").get(room.id)
        .value || 1;
    db.prepare("INSERT INTO progress_nodes (id, room_id, label, sort_order) VALUES (?, ?, ?, ?)").run(
      id("pn"),
      room.id,
      label,
      nextOrder,
    );
    emitRoomState(room.id);
    emitHostState(socket);
  });

  socket.on("progress_update", (payload = {}) => {
    if (!canManage(user)) return;
    const nodeId = String(payload.id || "");
    const label = String(payload.label || "").trim().slice(0, 120);
    const completed = payload.completed ? 1 : 0;
    const node = db.prepare("SELECT * FROM progress_nodes WHERE id = ? AND room_id = ?").get(nodeId, room.id);
    if (!node || !label) return;
    db.prepare(
      `UPDATE progress_nodes
       SET label = ?, completed = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND room_id = ?`,
    ).run(label, completed, nodeId, room.id);
    emitRoomState(room.id);
    emitHostState(socket);
  });

  socket.on("progress_delete", (payload = {}) => {
    if (!canManage(user)) return;
    db.prepare("DELETE FROM progress_nodes WHERE id = ? AND room_id = ?").run(String(payload.id || ""), room.id);
    emitRoomState(room.id);
    emitHostState(socket);
  });

  socket.on("mute_status", (payload = {}) => {
    const current = db
      .prepare("SELECT voice_blocked FROM room_players WHERE room_id = ? AND user_id = ?")
      .get(room.id, user.id);
    const muted = current?.voice_blocked ? 1 : payload.muted ? 1 : 0;
    db.prepare("UPDATE room_players SET muted = ? WHERE room_id = ? AND user_id = ?").run(muted, room.id, user.id);
    db.prepare("INSERT INTO voice_logs (id, room_id, user_id, event, muted) VALUES (?, ?, ?, ?, ?)").run(
      id("vl"),
      room.id,
      user.id,
      "mute_status",
      muted,
    );
    io.to(room.id).emit("mute_status", { playerId: user.id, muted: Boolean(muted) });
  });

  socket.on("voice_block", (payload = {}) => {
    if (!canManage(user)) return;
    const targetId = String(payload.playerId || "");
    if (!targetId || targetId === user.id) return;
    const target = db
      .prepare("SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND left_at IS NULL")
      .get(room.id, targetId);
    if (!target || target.role === "host") return;

    const blocked = payload.blocked ? 1 : 0;
    const muted = blocked ? 1 : target.muted ? 1 : 0;
    db.prepare("UPDATE room_players SET voice_blocked = ?, muted = ? WHERE room_id = ? AND user_id = ?").run(
      blocked,
      muted,
      room.id,
      targetId,
    );
    db.prepare("INSERT INTO voice_logs (id, room_id, user_id, event, muted) VALUES (?, ?, ?, ?, ?)").run(
      id("vl"),
      room.id,
      targetId,
      blocked ? "voice_block" : "voice_unblock",
      muted,
    );
    io.to(room.id).emit("voice_block", { playerId: targetId, blocked: Boolean(blocked), muted: Boolean(muted) });
    emitRoomState(room.id);
  });

  socket.on("player_kick", (payload = {}) => {
    if (!canManage(user)) return;
    const targetId = String(payload.playerId || "");
    if (!targetId || targetId === user.id) return;
    const target = db
      .prepare("SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND left_at IS NULL")
      .get(room.id, targetId);
    if (!target || target.role === "host") return;

    clearDisconnectTimer(room.id, targetId);
    db.prepare(
      "UPDATE room_players SET online = 0, left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ?",
    ).run(room.id, targetId);
    io.to(room.id).emit("player_kicked", { playerId: targetId });
    for (const targetSocket of io.sockets.sockets.values()) {
      if (targetSocket.data.room?.id === room.id && targetSocket.data.user?.id === targetId) {
        targetSocket.disconnect(true);
      }
    }
    emitRoomState(room.id);
  });

  socket.on("voice_status", (payload = {}) => {
    db.prepare("INSERT INTO voice_logs (id, room_id, user_id, event, muted) VALUES (?, ?, ?, ?, ?)").run(
      id("vl"),
      room.id,
      user.id,
      String(payload.event || "voice_status").slice(0, 40),
      payload.muted ? 1 : 0,
    );
    io.to(room.id).emit("voice_status", { playerId: user.id, muted: Boolean(payload.muted) });
  });

  socket.on("disconnect", () => {
    db.prepare("UPDATE room_players SET online = 0 WHERE room_id = ? AND user_id = ?").run(
      room.id,
      user.id,
    );
    db.prepare("INSERT INTO voice_logs (id, room_id, user_id, event) VALUES (?, ?, ?, ?)").run(
      id("vl"),
      room.id,
      user.id,
      "socket_disconnect",
    );
    io.to(room.id).emit("player_leave", { userId: user.id, name: user.nickname });
    scheduleDisconnectCleanup(room.id, user.id);
    emitRoomState(room.id);
  });
});

httpServer.listen(port, () => {
  console.log(`Turtle Soup server: http://localhost:${port}`);
  console.log(`LiveKit URL: ${livekitUrl}`);
});
