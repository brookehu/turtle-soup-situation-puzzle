const state = {
  user: null,
  role: "",
  nickname: "新成员",
  room: null,
  san: 100,
  muted: true,
  socket: null,
  livekitRoom: null,
  lastQuestionId: "",
  lastQuestion: "",
  hostAnswerText: "",
  results: [],
  chats: [],
  leaderboard: [],
  adminRooms: [],
  adminRoomFilter: "occupied",
  compactResults: false,
};

const savedSessionKey = "turtleSoupSession";
const clientIdKey = "turtleSoupClientId";

const els = {
  gateView: document.querySelector("#gateView"),
  lobbyView: document.querySelector("#lobbyView"),
  gameView: document.querySelector("#gameView"),
  fleetForm: document.querySelector("#fleetForm"),
  fleetPassword: document.querySelector("#fleetPassword"),
  gateMessage: document.querySelector("#gateMessage"),
  roleLabel: document.querySelector("#roleLabel"),
  logoutBtn: document.querySelector("#logoutBtn"),
  createRoomForm: document.querySelector("#createRoomForm"),
  createRoomPanel: document.querySelector("#createRoomPanel"),
  joinRoomPanel: document.querySelector("#joinRoomPanel"),
  roomPanel: document.querySelector("#roomPanel"),
  adminRoomsPanel: document.querySelector("#adminRoomsPanel"),
  adminRoomList: document.querySelector("#adminRoomList"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  roomNameInput: document.querySelector("#roomNameInput"),
  roomMaxInput: document.querySelector("#roomMaxInput"),
  roomSanMaxInput: document.querySelector("#roomSanMaxInput"),
  roomLockedInput: document.querySelector("#roomLockedInput"),
  nicknameInput: document.querySelector("#nicknameInput"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  joinNameInput: document.querySelector("#joinNameInput"),
  roomTitle: document.querySelector("#roomTitle"),
  roomCodeBadge: document.querySelector("#roomCodeBadge"),
  memberCount: document.querySelector("#memberCount"),
  voiceStatus: document.querySelector("#voiceStatus"),
  sanSummary: document.querySelector("#sanSummary"),
  memberList: document.querySelector("#memberList"),
  roomSettingsPanel: document.querySelector("#roomSettingsPanel"),
  roomSettingsForm: document.querySelector("#roomSettingsForm"),
  settingsRoomNameInput: document.querySelector("#settingsRoomNameInput"),
  settingsMaxMembersInput: document.querySelector("#settingsMaxMembersInput"),
  settingsSanMaxInput: document.querySelector("#settingsSanMaxInput"),
  settingsSanValueInput: document.querySelector("#settingsSanValueInput"),
  settingsLockedInput: document.querySelector("#settingsLockedInput"),
  resetGameBtn: document.querySelector("#resetGameBtn"),
  leaveRoomBtn: document.querySelector("#leaveRoomBtn"),
  enterGameBtn: document.querySelector("#enterGameBtn"),
  gameRoomCode: document.querySelector("#gameRoomCode"),
  gameRoomTitle: document.querySelector("#gameRoomTitle"),
  backLobbyBtn: document.querySelector("#backLobbyBtn"),
  muteBtn: document.querySelector("#muteBtn"),
  sanValue: document.querySelector("#sanValue"),
  sanMaxValue: document.querySelector("#sanMaxValue"),
  sanBar: document.querySelector("#sanBar"),
  playerAvatarList: document.querySelector("#playerAvatarList"),
  socketStatus: document.querySelector("#socketStatus"),
  voiceList: document.querySelector("#voiceList"),
  toggleSoupBtn: document.querySelector("#toggleSoupBtn"),
  soupTitle: document.querySelector("#soupTitle"),
  soupText: document.querySelector("#soupText"),
  answerRevealPanel: document.querySelector("#answerRevealPanel"),
  answerText: document.querySelector("#answerText"),
  toggleAnswerBtn: document.querySelector("#toggleAnswerBtn"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  playerProgressList: document.querySelector("#playerProgressList"),
  questionForm: document.querySelector("#questionForm"),
  questionInput: document.querySelector("#questionInput"),
  askBtn: document.querySelector("#askBtn"),
  hostControls: document.querySelector("#hostControls"),
  judgeButtons: document.querySelectorAll(".judge-buttons button"),
  pendingQuestionPreview: document.querySelector("#pendingQuestionPreview"),
  hostHintInput: document.querySelector("#hostHintInput"),
  sendHintBtn: document.querySelector("#sendHintBtn"),
  resultList: document.querySelector("#resultList"),
  compactResultsBtn: document.querySelector("#compactResultsBtn"),
  chatList: document.querySelector("#chatList"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  mobileTabs: document.querySelectorAll(".mobile-tabs button"),
  remoteAudio: document.querySelector("#remoteAudio"),
  hostManagePanel: document.querySelector("#hostManagePanel"),
  hostSoupTitleInput: document.querySelector("#hostSoupTitleInput"),
  hostSoupInput: document.querySelector("#hostSoupInput"),
  hostAnswerInput: document.querySelector("#hostAnswerInput"),
  saveSoupBtn: document.querySelector("#saveSoupBtn"),
  revealAnswerBtn: document.querySelector("#revealAnswerBtn"),
  progressForm: document.querySelector("#progressForm"),
  progressInput: document.querySelector("#progressInput"),
  hostProgressList: document.querySelector("#hostProgressList"),
  leaderboardList: document.querySelector("#leaderboardList"),
  voicePanel: document.querySelector(".voice-panel"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败。");
  return data;
}

function showView(view) {
  els.gateView.classList.toggle("hidden", view !== "gate");
  els.lobbyView.classList.toggle("hidden", view !== "lobby");
  els.gameView.classList.toggle("hidden", view !== "game");
  syncLobbyPanels();
  els.adminRoomsPanel.classList.toggle("hidden", state.role !== "admin");
  if (view !== "game") clearSanMood();
}

function roleName(role) {
  if (role === "admin") return "管理员";
  return role === "host" ? "主持人" : "玩家";
}

function canManageRoom() {
  return state.role === "host" || state.role === "admin";
}

function syncLobbyPanels() {
  const inRoom = Boolean(state.room);
  els.roomPanel.classList.toggle("hidden", !inRoom);
  els.joinRoomPanel.classList.toggle("hidden", inRoom);
  els.createRoomPanel.classList.toggle("hidden", !canManageRoom() || inRoom);
}

function getInitial(name) {
  return String(name || "汤").trim().slice(0, 1).toUpperCase() || "汤";
}

function normalizeRoom(room) {
  return {
    ...room,
    san: room.san ?? 100,
    members: room.members || [],
    chats: room.chats || [],
    questions: room.questions || [],
    progressNodes: room.progressNodes || [],
    leaderboard: room.leaderboard || [],
    sanMax: room.sanMax || 100,
    maxMembers: room.maxMembers || 10,
    locked: Boolean(room.locked),
    soupTitle: room.soupTitle || "雨夜车站",
    answerText: room.answerText || "",
    answerRevealed: Boolean(room.answerRevealed),
  };
}

function getClientId() {
  let clientId = localStorage.getItem(clientIdKey);
  if (!clientId) {
    clientId = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(clientIdKey, clientId);
  }
  return clientId;
}

function updateLastQuestionFromResults() {
  const pending = [...state.results]
    .filter((item) => item.result === "等待判定")
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];
  state.lastQuestionId = pending?.id || "";
  state.lastQuestion = pending?.question || "";
}

function saveSession() {
  if (!state.user) {
    localStorage.removeItem(savedSessionKey);
    return;
  }

  localStorage.setItem(
    savedSessionKey,
    JSON.stringify({
      userId: state.user.id,
      role: state.role,
      nickname: state.nickname,
      roomCode: state.room?.code || "",
      clientId: getClientId(),
    }),
  );
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(savedSessionKey) || "null");
  } catch {
    localStorage.removeItem(savedSessionKey);
    return null;
  }
}

function sendLeaveBeacon() {
  if (!state.user?.id || !state.room?.code) return;
  const payload = JSON.stringify({ userId: state.user.id });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `/api/rooms/${encodeURIComponent(state.room.code)}/leave`,
      new Blob([payload], { type: "application/json" }),
    );
  }
}

async function restoreSession() {
  const saved = loadSession();
  if (!saved?.userId) {
    showView("gate");
    return;
  }

  try {
    els.gateMessage.textContent = "正在恢复上次登录...";
    const session = await api("/api/session/resume", {
      method: "POST",
      body: JSON.stringify({
        userId: saved.userId,
        roomCode: saved.roomCode,
        nickname: saved.nickname,
        clientId: getClientId(),
      }),
    });
    state.user = session.user;
    state.role = session.role;
    state.nickname = session.user.name || saved.nickname || "新成员";
    els.roleLabel.textContent = roleName(session.role);
    els.nicknameInput.value = state.nickname;
    els.joinNameInput.value = state.nickname;
    syncLobbyPanels();
    els.adminRoomsPanel.classList.toggle("hidden", state.role !== "admin");
    els.gateMessage.textContent = "";
    showView("lobby");

    if (session.room) {
      enterRoom(session.room, state.nickname);
    } else {
      renderLobbyRoom();
      saveSession();
    }
    if (state.role === "admin") loadAdminRooms();
  } catch (error) {
    localStorage.removeItem(savedSessionKey);
    els.gateMessage.textContent = error.message;
    showView("gate");
  }
}

function enterRoom(room, nickname) {
  state.nickname = nickname.trim() || state.user?.name || "新成员";
  state.room = normalizeRoom(room);
  state.san = state.room.san;
  state.chats = [...state.room.chats];
  state.results = [...state.room.questions];
  state.leaderboard = [...state.room.leaderboard];
  updateLastQuestionFromResults();
  state.muted = true;
  updateMuteButton();
  renderLobbyRoom();
  saveSession();
}

function renderLobbyRoom() {
  if (!state.room) {
    syncLobbyPanels();
    els.roomTitle.textContent = "未进入房间";
    els.roomCodeBadge.textContent = "----";
    els.memberCount.textContent = "0/10";
    setVoiceStatus("待连接");
    els.sanSummary.textContent = "100";
    els.memberList.innerHTML = '<p class="empty-state">创建或加入房间后显示成员列表。</p>';
    els.roomSettingsPanel.classList.add("hidden");
    els.enterGameBtn.disabled = true;
    els.enterGameBtn.textContent = "进入游戏";
    renderAdminRooms();
    return;
  }

  syncLobbyPanels();
  els.roomTitle.textContent = state.room.name;
  els.roomCodeBadge.textContent = state.room.code;
  els.memberCount.textContent = `${state.room.members.length}/${state.room.maxMembers}`;
  setVoiceStatus(state.room.locked ? "已锁定" : "LiveKit SFU");
  els.sanSummary.textContent = `${state.san}/${state.room.sanMax}`;
  els.memberList.innerHTML = state.room.members.map(renderMemberCard).join("");
  els.roomSettingsPanel.classList.toggle("hidden", !canManageRoom());
  syncRoomSettingsForm();
  els.enterGameBtn.disabled = false;
  els.enterGameBtn.textContent = `以${state.user?.name || state.nickname || "当前用户"}的身份加入游戏`;
  renderAdminRooms();
}

function renderAdminRooms() {
  if (state.role !== "admin") return;
  const visibleRooms = state.adminRooms.filter((room) => {
    if (state.adminRoomFilter === "archived") return !room.active;
    if (state.adminRoomFilter === "online") return room.active && Number(room.onlineCount || 0) > 0;
    return room.active && Number(room.memberCount || 0) > 0;
  });
  document.querySelectorAll(".admin-room-filters button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.adminRoomFilter);
  });
  if (!visibleRooms.length) {
    els.adminRoomList.innerHTML = '<p class="empty-state">暂无可巡查房间。</p>';
    return;
  }

  els.adminRoomList.innerHTML = visibleRooms
    .map(
      (room) => `
        <article class="admin-room-card">
          <div>
            <strong>${escapeHtml(room.name)}</strong>
            <span>${escapeHtml(room.code)} · ${escapeHtml(room.soupTitle || "未命名汤面")} · 主持：${escapeHtml(room.hostName || "无")}</span>
          </div>
          <div class="admin-room-meta">
            <span>${room.onlineCount}/${room.maxMembers} 人</span>
            <span>SAN ${room.san}/${room.sanMax}</span>
            <span>${room.active ? (room.locked ? "已锁定" : "开放") : "已归档"}</span>
            <span>${room.questionCount} 问</span>
            <span>${room.chatCount} 聊天</span>
          </div>
          <button type="button" data-room-code="${escapeHtml(room.code)}" ${room.active ? "" : "disabled"}>${room.active ? "查房" : "已归档"}</button>
          ${room.active ? `<button class="admin-archive-btn" type="button" data-archive-room-id="${escapeHtml(room.id)}">归档</button>` : ""}
        </article>
      `,
    )
    .join("");
}

async function loadAdminRooms() {
  if (state.role !== "admin" || !state.user?.id) return;
  try {
    const data = await api(`/api/admin/rooms?userId=${encodeURIComponent(state.user.id)}`);
    state.adminRooms = data.rooms || [];
    renderAdminRooms();
  } catch (error) {
    els.adminRoomList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function syncRoomSettingsForm() {
  if (!state.room || !canManageRoom()) return;
  if (document.activeElement !== els.settingsRoomNameInput) els.settingsRoomNameInput.value = state.room.name;
  if (document.activeElement !== els.settingsMaxMembersInput) els.settingsMaxMembersInput.value = state.room.maxMembers;
  if (document.activeElement !== els.settingsSanMaxInput) els.settingsSanMaxInput.value = state.room.sanMax;
  if (document.activeElement !== els.settingsSanValueInput) els.settingsSanValueInput.value = state.san;
  els.settingsLockedInput.checked = state.room.locked;
}

function renderMemberCard(member) {
  const canKick = canManageMember(member);
  return `
    <article class="member-card ${isHostMember(member) ? "host-member" : ""}">
      ${renderAvatar(member)}
      <div>
        <strong class="${memberNameClass(member)}">${escapeHtml(member.name)}</strong>
        <span>${escapeHtml(memberStatusText(member))}</span>
      </div>
      <span class="status-dot" aria-label="${member.online ? "在线" : "离线"}"></span>
      ${canKick ? `<button class="kick-btn" type="button" data-player-id="${escapeHtml(member.id)}">踢出</button>` : ""}
    </article>
  `;
}

function renderPlayerStrip() {
  if (!state.room) return;

  els.playerAvatarList.innerHTML = state.room.members
    .map(
      (member) => `
        <div class="player-chip ${isHostMember(member) ? "host-member" : ""} ${member.id === state.user?.id ? "self-member" : ""}">
          ${renderAvatar(member)}
          <span class="${memberNameClass(member)}">${escapeHtml(member.name)}</span>
          ${member.id === state.user?.id ? "<em>当前</em>" : ""}
        </div>
      `,
    )
    .join("");
}

function renderGame() {
  if (!state.room) return;

  els.gameRoomCode.textContent = state.room.code;
  els.gameRoomTitle.textContent = state.room.name;
  els.soupTitle.textContent = state.room.soupTitle;
  els.soupText.textContent = state.room.soupText;
  els.answerRevealPanel.classList.toggle("hidden", !state.room.answerRevealed);
  els.answerText.textContent = state.room.answerText || "";
  els.hostControls.classList.toggle("hidden", !canManageRoom());
  els.hostManagePanel.classList.toggle("hidden", !canManageRoom());
  els.questionForm.classList.toggle("host-hidden", canManageRoom());
  els.askBtn.textContent = canManageRoom() ? "记录问题" : "提问";
  els.mobileTabs.forEach((button) => {
    if (button.dataset.hostOnly !== undefined) button.classList.toggle("hidden", !canManageRoom());
  });
  if (document.activeElement !== els.hostSoupTitleInput) {
    els.hostSoupTitleInput.value = state.room.soupTitle || "";
  }
  if (document.activeElement !== els.hostSoupInput) {
    els.hostSoupInput.value = state.room.soupText || "";
  }
  if (document.activeElement !== els.hostAnswerInput) {
    els.hostAnswerInput.value = state.hostAnswerText || state.room.answerText || "";
  }
  renderPlayerStrip();
  renderSan();
  renderVoice();
  renderProgress();
  renderResults();
  renderChat();
  renderLeaderboard();
  renderPendingQuestionPreview();
}

function renderSan() {
  const sanMax = state.room?.sanMax || 100;
  const ratio = sanMax ? Math.max(0, Math.min(1, state.san / sanMax)) : 0;
  els.sanValue.textContent = state.san;
  els.sanMaxValue.textContent = sanMax;
  els.sanBar.style.width = `${Math.round(ratio * 100)}%`;
  els.sanBar.style.background = `linear-gradient(90deg, ${ratio > 0.55 ? "var(--green)" : ratio > 0.25 ? "var(--amber)" : "var(--red)"}, ${ratio > 0.55 ? "#86a943" : ratio > 0.25 ? "#d09a39" : "#401111"})`;
  els.sanSummary.textContent = `${state.san}/${sanMax}`;
  document.body.classList.toggle("san-warning", ratio <= 0.3 && ratio > 0.2);
  document.body.classList.toggle("san-danger", ratio <= 0.2 && ratio > 0.1);
  document.body.classList.toggle("san-critical", ratio <= 0.1);
}

function clearSanMood() {
  document.body.classList.remove("san-warning", "san-danger", "san-critical", "san-mood-off");
}

function renderVoice() {
  if (!state.room) return;
  els.voicePanel.classList.toggle("hidden", !canManageRoom());
  if (!canManageRoom()) return;

  els.voiceList.innerHTML = state.room.members
    .map((member) => {
      const muted = member.id === state.user?.id ? state.muted : member.muted;
      const canBlock = canManageMember(member);
      const canKick = canManageMember(member);
      return `
        <article class="voice-card ${muted ? "muted" : ""} ${member.voiceBlocked ? "blocked" : ""}">
          ${renderAvatar(member)}
          <div>
            <strong class="${memberNameClass(member)}">${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(memberStatusText(member, member.voiceBlocked ? "已禁言" : muted ? "静音" : "语音在线"))}</span>
          </div>
          <span class="voice-meter" aria-label="${muted ? "静音" : "正在通话"}"></span>
          ${
            canBlock
              ? `<button class="voice-block-btn" type="button" data-player-id="${escapeHtml(member.id)}" data-blocked="${member.voiceBlocked ? "true" : "false"}">${member.voiceBlocked ? "取消禁言" : "禁言"}</button>`
              : ""
          }
          ${canKick ? `<button class="voice-kick-btn" type="button" data-player-id="${escapeHtml(member.id)}">踢出</button>` : ""}
        </article>
      `;
    })
    .join("");
}

function isHostMember(member) {
  return member.role === "主持" || member.role === "主持人" || member.role === "管理" || member.role === "host" || member.role === "admin";
}

function isAdminMember(member) {
  return member.role === "管理" || member.role === "admin";
}

function canManageMember(member) {
  if (!canManageRoom() || member.id === state.user?.id || isAdminMember(member)) return false;
  if (isHostMember(member) && state.role !== "admin") return false;
  return true;
}

function memberNameClass(member) {
  if (member.role === "管理" || member.role === "admin") return "admin-name";
  return isHostMember(member) ? "host-name" : "";
}

function memberStatusText(member, statusText = "") {
  const roleText = member.role === "管理" || member.role === "admin" ? "管理" : isHostMember(member) ? "主持" : "玩家";
  const currentStatus = statusText || (member.muted ? "已静音" : member.online ? "在线" : "离线");
  if (isHostMember(member)) return currentStatus;
  return `${roleText} · ${currentStatus}`;
}

function renderAvatar(member) {
  const src = member.avatarUrl || "/assets/avatars/default.svg";
  return `<img class="avatar" src="${escapeHtml(src)}" alt="${escapeHtml(member.name)}头像" data-user-id="${escapeHtml(member.id || "")}" data-user-name="${escapeHtml(member.name || "")}" onerror="this.onerror=null;this.src='/assets/avatars/default.svg';" />`;
}

function renderProgress() {
  const nodes = state.room?.progressNodes || [];
  const completed = nodes.filter((node) => node.completed).length;
  const percent = nodes.length ? Math.round((completed / nodes.length) * 100) : 0;
  els.progressPercent.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;

  const visibleNodes = canManageRoom() ? nodes : nodes;
  els.playerProgressList.innerHTML = visibleNodes.length
    ? visibleNodes
        .map(
          (node) => `
            <article class="progress-item">
              <span>${node.completed ? "✓" : "○"}</span>
              <strong>${escapeHtml(node.completed || canManageRoom() ? node.label : "未解锁关键节点")}</strong>
            </article>
          `,
        )
        .join("")
    : '<p class="empty-state">暂无关键节点。</p>';

  if (!canManageRoom()) return;
  els.hostProgressList.innerHTML = nodes.length
    ? nodes
        .map(
          (node) => `
            <article class="progress-item" data-node-id="${escapeHtml(node.id)}">
              <input type="checkbox" ${node.completed ? "checked" : ""} aria-label="完成节点" />
              <input type="text" value="${escapeHtml(node.label)}" aria-label="节点内容" />
              <button type="button">删除</button>
            </article>
          `,
        )
        .join("")
    : '<p class="empty-state">还没有关键节点。</p>';
}

function renderResults() {
  els.compactResultsBtn.textContent = state.compactResults ? "详细" : "简化";
  els.compactResultsBtn.setAttribute("aria-pressed", String(state.compactResults));
  updateLastQuestionFromResults();
  if (!state.results.length) {
    els.resultList.innerHTML = '<p class="empty-state">提问后会显示历史结果与主持提示。</p>';
    renderPendingQuestionPreview();
    return;
  }

  els.resultList.classList.toggle("compact", state.compactResults);
  els.resultList.innerHTML = state.results
    .map((item, index) => {
      const className = {
        是: "yes",
        不是: "no",
        是也不是: "both",
        接近: "close",
        不重要: "unimportant",
        提示: "both",
        等待判定: "",
      }[item.result];
      const serial = state.results.length - index;
      const playerName = item.playerName || (item.result === "提示" ? "主持人" : "未知");
      const isHint = item.result === "提示";
      const note = isHint ? "" : item.note || (item.result === "等待判定" ? "等待主持人判定。" : "");
      const questionText = isHint ? item.note || item.question : item.question;
      const canDelete = canManageRoom() && item.id && !String(item.id).startsWith("hint-");
      const canFeature = canDelete && item.result !== "提示";
      const featuredMark = item.featured ? '<span class="featured-mark" title="精彩提问">★</span>' : "";
      const featureButton = canFeature
        ? `<button class="result-feature-btn" type="button" data-question-id="${escapeHtml(item.id)}" data-featured="${item.featured ? "true" : "false"}">${item.featured ? "取消精彩" : "精彩"}</button>`
        : "";

      if (state.compactResults) {
        return `
          <article class="result-item compact-item ${className} ${item.featured ? "featured" : ""}">
            <p class="result-question">${featuredMark}${escapeHtml(questionText)}</p>
            <p class="result-answer"><strong>${escapeHtml(item.result)}</strong>${item.featured ? " · 精彩" : ""}</p>
            ${canManageRoom() ? `<div class="result-actions">${featureButton}</div>` : ""}
          </article>
        `;
      }

      return `
        <article class="result-item ${className} ${item.featured ? "featured" : ""}">
          <div class="result-topline">
            <p class="result-meta">${featuredMark}第 ${serial} 问 · 提问者：${escapeHtml(playerName)}</p>
            ${
              canDelete
                ? `<div class="result-actions">${featureButton}<button class="result-delete-btn" type="button" data-question-id="${escapeHtml(item.id)}">删除</button></div>`
                : ""
            }
          </div>
          <p class="result-question">${escapeHtml(questionText)}</p>
          <p class="result-answer"><strong>${escapeHtml(item.result)}</strong>${note ? `：${escapeHtml(note)}` : ""}</p>
        </article>
      `;
    })
    .join("");
  renderPendingQuestionPreview();
}

function renderPendingQuestionPreview() {
  if (!els.pendingQuestionPreview || !canManageRoom()) return;
  const pending = state.results.find((item) => item.id === state.lastQuestionId);
  if (!pending) {
    els.pendingQuestionPreview.innerHTML = "<span>当前待答</span><strong>暂无待判定问题</strong>";
    return;
  }
  els.pendingQuestionPreview.innerHTML = `
    <span>当前待答 · ${escapeHtml(pending.playerName || "未知")}</span>
    <strong>${escapeHtml(pending.question || "")}</strong>
  `;
}

function renderLeaderboard() {
  const rows = state.room?.leaderboard || state.leaderboard || [];
  els.leaderboardList.innerHTML = rows.length
    ? rows
        .map(
          (item, index) => `
            <article class="leaderboard-item">
              <strong>${index + 1}</strong>
              <span>${escapeHtml(item.name)}</span>
              <em>均分 ${Number(item.average || 0).toFixed(2)} · 总分 ${item.total || 0}</em>
            </article>
          `,
        )
        .join("")
    : '<p class="empty-state">暂无积分。</p>';
}

function renderChat() {
  els.chatList.innerHTML = state.chats
    .map(
      (chat) => {
        const member = findChatMember(chat);
        const own = chat.userId === state.user?.id || (!chat.userId && chat.name === state.nickname);
        const kind = chat.kind || "chat";
        const label = {
          question: "提问",
          judgement: chat.replyToName ? `回复 ${chat.replyToName}` : "主持判定",
          hint: "主持提示",
          pat: "拍一拍",
        }[kind];
        return `
        <article class="chat-message ${own ? "own" : "other"} ${kind !== "chat" ? `chat-${kind}` : ""}">
          ${!own ? renderAvatar(member || { name: chat.name }) : ""}
          <div>
            <p>
              <strong class="${memberNameClass(member || {})}">${escapeHtml(chat.name)}</strong>
              ${label ? `<em>${escapeHtml(label)}</em>` : ""}
            </p>
            <span>${escapeHtml(chat.text)}</span>
          </div>
          ${own ? renderAvatar(member || { name: chat.name }) : ""}
        </article>
      `;
      },
    )
    .join("");
  els.chatList.scrollTop = els.chatList.scrollHeight;
}

function findChatMember(chat) {
  if (chat.userId) return state.room?.members.find((member) => member.id === chat.userId);
  return findMemberByName(chat.name);
}

function findMemberByName(name) {
  return state.room?.members.find((member) => member.name === name);
}

function setSocketStatus(text) {
  els.socketStatus.textContent = text;
}

function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
}

function mentionUser(name) {
  const mention = `@${name} `;
  const current = els.chatInput.value;
  if (!current.includes(mention)) {
    els.chatInput.value = current ? `${current.trimEnd()} ${mention}` : mention;
  }
  autoGrowTextarea(els.chatInput);
  els.chatInput.focus();
}

function connectSocket() {
  state.socket?.disconnect();
  setSocketStatus("Socket连接中");

  state.socket = io({
    auth: {
      userId: state.user.id,
      roomId: state.room.id,
    },
  });

  state.socket.on("connect", () => {
    setSocketStatus("Socket已连接");
    state.socket.emit("mute_status", { muted: true });
  });
  state.socket.on("disconnect", () => setSocketStatus("Socket已断开"));
  state.socket.on("connect_error", (error) => setSocketStatus(error.message || "Socket失败"));
  state.socket.on("room_state", applyRoomState);
  state.socket.on("host_state", applyHostState);
  state.socket.on("chat_message", (message) => {
    state.chats.push(message);
    renderChat();
  });
  state.socket.on("question_submit", (message) => {
    state.results.unshift({
      id: message.id,
      question: message.content,
      playerName: message.playerName,
      result: "等待判定",
      note: "等待主持人判定。",
      createdAt: message.createdAt,
    });
    updateLastQuestionFromResults();
    renderResults();
  });
  state.socket.on("question_result", (message) => {
    const target = state.results.find((item) => item.id === message.questionId);
    if (target) {
      target.result = message.result;
      target.note = message.note;
    } else {
      state.results.unshift({
        id: message.questionId,
        question: message.question || state.lastQuestion || "主持判定",
        playerName: message.playerName,
        result: message.result,
        note: message.note,
      });
    }
    updateLastQuestionFromResults();
    renderResults();
  });
  state.socket.on("question_featured", (message) => {
    const target = state.results.find((item) => item.id === message.questionId);
    if (target) target.featured = Boolean(message.featured);
    renderResults();
    renderLeaderboard();
  });
  state.socket.on("question_deleted", (message) => {
    state.results = state.results.filter((item) => item.id !== message.questionId);
    updateLastQuestionFromResults();
    if (Number.isFinite(Number(message.san))) {
      state.san = message.san;
      if (state.room) state.room.san = message.san;
      renderSan();
    }
    renderResults();
  });
  state.socket.on("host_hint", (message) => {
    state.results.unshift({
      id: `hint-${Date.now()}`,
      question: message.content,
      playerName: message.hostName || "主持人",
      result: "提示",
      note: message.content,
    });
    renderResults();
  });
  state.socket.on("san_update", (message) => {
    state.san = message.value;
    if (state.room) state.room.san = message.value;
    renderSan();
  });
  state.socket.on("mute_status", (message) => {
    applyMuteStatus(message.playerId, message.muted);
  });
  state.socket.on("voice_block", (message) => {
    applyVoiceBlock(message.playerId, message.blocked, message.muted);
  });
  state.socket.on("voice_status", (message) => {
    applyMuteStatus(message.playerId, message.muted);
  });
  state.socket.on("player_join", () => {});
  state.socket.on("player_leave", () => {});
  state.socket.on("player_kicked", (message) => {
    if (message.playerId !== state.user?.id) return;
    handleKicked();
  });
  state.socket.on("room_archived", () => {
    alert("房间已超过保留时间并被归档，房间号已释放。");
    handleKicked();
  });
  state.socket.on("game_reset", (message) => {
    state.san = message.san ?? state.room?.sanMax ?? 100;
    state.results = [];
    state.chats = [];
    state.leaderboard = [];
    state.lastQuestionId = "";
    state.lastQuestion = "";
    renderSan();
    renderResults();
    renderChat();
    renderLeaderboard();
  });
}

async function handleKicked() {
  alert("你已被主持人移出房间。");
  state.socket?.disconnect();
  await state.livekitRoom?.disconnect();
  state.room = null;
  state.socket = null;
  state.livekitRoom = null;
  state.results = [];
  state.chats = [];
  saveSession();
  renderLobbyRoom();
  showView("lobby");
}

async function leaveCurrentRoom() {
  const roomCode = state.room?.code;
  const userId = state.user?.id;
  if (roomCode && userId) {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/leave`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }).catch(() => {});
  }
  state.socket?.disconnect();
  await state.livekitRoom?.disconnect();
  state.room = null;
  state.socket = null;
  state.livekitRoom = null;
  state.results = [];
  state.chats = [];
  state.leaderboard = [];
  state.lastQuestionId = "";
  state.lastQuestion = "";
  saveSession();
  renderLobbyRoom();
  if (state.role === "admin") loadAdminRooms();
  showView("lobby");
}

function applyRoomState(room) {
  state.room = normalizeRoom(room);
  state.san = state.room.san;
  state.chats = [...state.room.chats];
  state.results = [...state.room.questions];
  state.leaderboard = [...state.room.leaderboard];
  updateLastQuestionFromResults();
  const currentMember = state.room.members.find((member) => member.id === state.user?.id);
  if (currentMember) {
    state.muted = Boolean(currentMember.muted);
    updateMuteButton();
    if (currentMember.voiceBlocked && state.livekitRoom) {
      state.livekitRoom.localParticipant.setMicrophoneEnabled(false).catch((error) => console.warn(error));
    }
  }
  renderLobbyRoom();
  renderGame();
  saveSession();
}

function applyHostState(room) {
  const nextRoom = normalizeRoom(room);
  state.hostAnswerText = nextRoom.answerText || state.hostAnswerText;
  if (canManageRoom()) {
    state.room = nextRoom;
    state.san = state.room.san;
    state.chats = [...state.room.chats];
    state.results = [...state.room.questions];
    state.leaderboard = [...state.room.leaderboard];
    updateLastQuestionFromResults();
    const currentMember = state.room.members.find((member) => member.id === state.user?.id);
    if (currentMember) {
      state.muted = Boolean(currentMember.muted);
      updateMuteButton();
      if (currentMember.voiceBlocked && state.livekitRoom) {
        state.livekitRoom.localParticipant.setMicrophoneEnabled(false).catch((error) => console.warn(error));
      }
    }
    renderLobbyRoom();
    renderGame();
    saveSession();
  }
}

function applyMuteStatus(playerId, muted) {
  const member = state.room?.members.find((item) => item.id === playerId);
  if (member) member.muted = Boolean(muted);
  if (playerId === state.user?.id) {
    state.muted = Boolean(muted);
    updateMuteButton();
    if (!state.muted && member?.voiceBlocked) {
      setMuted(true).catch((error) => console.warn(error));
    }
  }
  renderVoice();
  renderLobbyRoom();
}

function applyVoiceBlock(playerId, blocked, muted) {
  const member = state.room?.members.find((item) => item.id === playerId);
  if (member) {
    member.voiceBlocked = Boolean(blocked);
    member.muted = Boolean(muted);
  }
  if (playerId === state.user?.id) {
    state.muted = Boolean(muted);
    updateMuteButton();
    if (state.livekitRoom && muted) {
      state.livekitRoom.localParticipant.setMicrophoneEnabled(false).catch((error) => console.warn(error));
    }
  }
  renderVoice();
  renderLobbyRoom();
}

async function connectLiveKit() {
  if (!window.LivekitClient) {
    setVoiceStatus("LiveKit客户端未加载", true);
    return;
  }

  const { AudioPresets, Room, RoomEvent } = window.LivekitClient;
  const session = await api("/api/livekit/token", {
    method: "POST",
    headers: {
      "x-user-id": state.user.id,
      "x-room-id": state.room.id,
    },
    body: "{}",
  });

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    audioCaptureDefaults: getAudioCaptureDefaults(),
    publishDefaults: {
      audioPreset: AudioPresets?.speech || { maxBitrate: 24000 },
      dtx: false,
      red: true,
      forceStereo: false,
      stopMicTrackOnMute: true,
    },
    webAudioMix: true,
  });

  room.on(RoomEvent.ConnectionStateChanged, (connectionState) => {
    setVoiceStatus(voiceConnectionText(connectionState));
  });
  room.on(RoomEvent.Reconnecting, () => setVoiceStatus("语音重连中"));
  room.on(RoomEvent.Reconnected, () => setVoiceStatus(state.muted ? "语音已连接" : "麦克风已开启"));
  room.on(RoomEvent.Disconnected, () => setVoiceStatus("语音已断开", true));
  room.on(RoomEvent.MediaDevicesError, (error) => {
    console.warn("LiveKit media device error", error);
    setVoiceStatus("麦克风不可用", true);
  });
  room.on(RoomEvent.LocalTrackPublished, (publication) => {
    if (publication?.kind === window.LivekitClient.Track.Kind.Audio) {
      setVoiceStatus("麦克风已开启");
    }
  });
  room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
    if (publication?.kind === window.LivekitClient.Track.Kind.Audio) {
      setVoiceStatus("麦克风已关闭");
    }
  });
  room.on(RoomEvent.LocalAudioSilenceDetected, () => {
    setVoiceStatus("检测不到麦克风声音", true);
  });
  room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    if (!room.canPlaybackAudio) setVoiceStatus("点击页面恢复播放", true);
  });
  room.on(RoomEvent.TrackSubscribed, attachRemoteAudio);

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach().forEach((element) => element.remove());
  });

  await room.connect(session.url, session.token);
  await room.startAudio?.().catch(() => {});
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.track) attachRemoteAudio(publication.track);
    });
  });
  await room.localParticipant.setMicrophoneEnabled(false);
  state.livekitRoom = room;
  setVoiceStatus("语音已连接");
  updateMuteButton();
}

function getAudioCaptureDefaults() {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  const defaults = {
    autoGainControl: true,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (supported.voiceIsolation) defaults.voiceIsolation = true;
  return defaults;
}

function voiceConnectionText(connectionState) {
  const textMap = {
    connected: state.muted ? "语音已连接" : "麦克风已开启",
    connecting: "语音连接中",
    reconnecting: "语音重连中",
    disconnected: "语音已断开",
  };
  return textMap[String(connectionState || "").toLowerCase()] || "语音连接中";
}

function setVoiceStatus(text, isError = false) {
  els.voiceStatus.textContent = text;
  els.voiceStatus.classList.toggle("status-error", isError);
}

function attachRemoteAudio(track) {
  if (track.kind !== window.LivekitClient.Track.Kind.Audio) return;
  const trackId = track.sid || track.mediaStreamTrack?.id;
  if (trackId) {
    const previous = [...els.remoteAudio.querySelectorAll("[data-livekit-track]")].find(
      (element) => element.dataset.livekitTrack === trackId,
    );
    previous?.remove();
  }
  const audio = track.attach();
  audio.dataset.livekitRemote = "true";
  if (trackId) audio.dataset.livekitTrack = trackId;
  audio.autoplay = true;
  audio.muted = false;
  audio.playsInline = true;
  els.remoteAudio.append(audio);
  audio.play?.().catch((error) => {
    console.warn("Remote audio playback blocked", error);
    setVoiceStatus("点击页面恢复播放", true);
  });
}

function updateMuteButton() {
  const blocked = isCurrentUserVoiceBlocked();
  els.muteBtn.textContent = blocked ? "已被禁言" : state.muted ? "取消静音" : "静音";
  els.muteBtn.setAttribute("aria-pressed", String(state.muted));
  els.muteBtn.disabled = blocked;
}

function isCurrentUserVoiceBlocked() {
  return Boolean(state.room?.members.find((member) => member.id === state.user?.id)?.voiceBlocked);
}

async function setMuted(nextMuted) {
  const currentMember = state.room?.members.find((member) => member.id === state.user?.id);
  if (!nextMuted && currentMember?.voiceBlocked) {
    alert("你已被主持人禁言。");
    nextMuted = true;
  }
  const previousMuted = state.muted;
  state.muted = nextMuted;
  updateMuteButton();

  try {
    if (state.livekitRoom) {
      await state.livekitRoom.localParticipant.setMicrophoneEnabled(!nextMuted);
      await state.livekitRoom.startAudio?.().catch(() => {});
    }
  } catch (error) {
    console.warn("Failed to change microphone state", error);
    state.muted = previousMuted;
    updateMuteButton();
    setVoiceStatus(nextMuted ? "静音失败" : "麦克风开启失败", true);
    alert(`语音切换失败：${voiceErrorMessage(error)}`);
    renderVoice();
    return;
  }

  setVoiceStatus(nextMuted ? "麦克风已关闭" : "麦克风已开启");
  state.socket?.emit("mute_status", { muted: nextMuted });
  renderVoice();
}

function voiceErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "浏览器或系统拒绝了麦克风权限。";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "没有找到可用的录音设备。";
  if (name === "NotReadableError" || name === "TrackStartError") return "录音设备被其他程序占用，或系统输入设备不可用。";
  if (name === "OverconstrainedError") return "当前浏览器不支持所需的麦克风采集参数。";
  return error?.message || "请检查浏览器控制台和系统麦克风设置。";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

els.fleetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = els.fleetPassword.value.trim();

  try {
    els.gateMessage.textContent = "正在验证车队密码...";
    const session = await api("/api/fleet/verify", {
      method: "POST",
      body: JSON.stringify({ password, nickname: state.nickname, userId: loadSession()?.userId || "", clientId: getClientId() }),
    });
    state.user = session.user;
    state.role = session.role;
    state.nickname = session.user.name || state.nickname;
    els.roleLabel.textContent = roleName(session.role);
    els.nicknameInput.value = state.nickname;
    els.joinNameInput.value = state.nickname;
    syncLobbyPanels();
    els.adminRoomsPanel.classList.toggle("hidden", state.role !== "admin");
    els.gateMessage.textContent = "";
    showView("lobby");
    renderLobbyRoom();
    if (state.role === "admin") loadAdminRooms();
    saveSession();
  } catch (error) {
    els.gateMessage.textContent = error.message;
  }
});

els.logoutBtn.addEventListener("click", async () => {
  const roomCode = state.room?.code;
  const userId = state.user?.id;
  if (roomCode && userId) {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/leave`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }).catch(() => {});
  }
  state.socket?.disconnect();
  await state.livekitRoom?.disconnect();
  Object.assign(state, {
    user: null,
    role: "",
    room: null,
    socket: null,
      livekitRoom: null,
      muted: true,
      results: [],
      chats: [],
      adminRooms: [],
  });
  saveSession();
  els.fleetPassword.value = "";
  showView("gate");
});

els.createRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const nickname = els.nicknameInput.value.trim() || "主持人";
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        nickname,
        name: els.roomNameInput.value,
        maxMembers: els.roomMaxInput.value,
        sanMax: els.roomSanMaxInput.value,
        locked: els.roomLockedInput.checked,
        clientId: getClientId(),
      }),
    });
    enterRoom(data.room, nickname);
    els.roomCodeInput.value = data.room.code;
  } catch (error) {
    alert(error.message);
  }
});

els.joinRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const nickname = els.joinNameInput.value.trim() || "玩家";
    const code = els.roomCodeInput.value.trim().toUpperCase();
    const data = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ userId: state.user.id, nickname, clientId: getClientId() }),
    });
    enterRoom(data.room, nickname);
  } catch (error) {
    alert(error.message);
  }
});

els.adminRoomList.addEventListener("click", async (event) => {
  const archiveButton = event.target.closest("button[data-archive-room-id]");
  if (archiveButton && state.role === "admin") {
    const confirmed = window.confirm("确认归档这个房间？房间号会释放，历史记录仍保留。");
    if (!confirmed) return;
    try {
      await api(`/api/admin/rooms/${encodeURIComponent(archiveButton.dataset.archiveRoomId)}/archive`, {
        method: "POST",
        body: JSON.stringify({ userId: state.user.id }),
      });
      loadAdminRooms();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const button = event.target.closest("button[data-room-code]");
  if (!button || state.role !== "admin") return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(button.dataset.roomCode)}/join`, {
      method: "POST",
      body: JSON.stringify({ userId: state.user.id, nickname: state.nickname, clientId: getClientId() }),
    });
    enterRoom(data.room, state.nickname);
    els.roomCodeInput.value = data.room.code;
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector(".admin-room-filters")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.adminRoomFilter = button.dataset.filter;
  renderAdminRooms();
});

els.adminRoomsPanel.addEventListener("click", (event) => {
  if (event.target.closest("button[data-room-code]")) return;
  if (state.role === "admin") loadAdminRooms();
});

els.enterGameBtn.addEventListener("click", async () => {
  connectSocket();
  state.muted = true;
  updateMuteButton();
  renderGame();
  els.gameView.dataset.activePanel = "chat";
  showView("game");

  try {
    await connectLiveKit();
  } catch (error) {
    setVoiceStatus("语音未连接", true);
    console.warn(error);
  }
});

els.backLobbyBtn.addEventListener("click", () => {
  renderLobbyRoom();
  if (state.role === "admin") loadAdminRooms();
  showView("lobby");
});

els.leaveRoomBtn.addEventListener("click", () => {
  leaveCurrentRoom().catch((error) => console.warn(error));
});

els.muteBtn.addEventListener("click", () => {
  setMuted(!state.muted).catch((error) => console.warn(error));
});

function resumeLiveKitAudio() {
  state.livekitRoom?.startAudio?.().catch((error) => console.warn("Failed to resume LiveKit audio", error));
  els.remoteAudio.querySelectorAll("audio").forEach((audio) => {
    audio.play?.().catch(() => {});
  });
}

document.addEventListener("click", resumeLiveKitAudio);
document.addEventListener("touchend", resumeLiveKitAudio);

els.toggleSoupBtn.addEventListener("click", () => {
  const collapsed = els.soupText.classList.toggle("collapsed");
  els.toggleSoupBtn.textContent = collapsed ? "展开" : "收起";
});

els.toggleAnswerBtn.addEventListener("click", () => {
  const collapsed = els.answerText.classList.toggle("collapsed");
  els.toggleAnswerBtn.textContent = collapsed ? "展开" : "收起";
});

els.roomSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageRoom() || !state.room) return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/settings`, {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        name: els.settingsRoomNameInput.value,
        maxMembers: els.settingsMaxMembersInput.value,
        sanMax: els.settingsSanMaxInput.value,
        sanValue: els.settingsSanValueInput.value,
        locked: els.settingsLockedInput.checked,
      }),
    });
    applyRoomState(data.room);
  } catch (error) {
    alert(error.message);
  }
});

els.resetGameBtn.addEventListener("click", async () => {
  if (!canManageRoom() || !state.room) return;
  const confirmed = window.confirm("确认重置游戏？这会清空提问、聊天、关键节点，并把 SAN 恢复到上限。");
  if (!confirmed) return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/reset`, {
      method: "POST",
      body: JSON.stringify({ userId: state.user.id }),
    });
    applyRoomState(data.room);
  } catch (error) {
    alert(error.message);
  }
});

els.saveSoupBtn.addEventListener("click", () => {
  const soupTitle = els.hostSoupTitleInput.value.trim();
  const soupText = els.hostSoupInput.value.trim();
  const answerText = els.hostAnswerInput.value.trim();
  if (!soupTitle || !soupText || !answerText) {
    alert("汤面名称、汤面和汤底都不能为空。");
    return;
  }
  state.hostAnswerText = answerText;
  state.socket?.emit("soup_update", { soupTitle, soupText, answerText });
});

els.revealAnswerBtn.addEventListener("click", () => {
  const confirmed = window.confirm("确认显示汤底？这会把汤底同步给所有玩家，且无法撤回。");
  if (!confirmed) return;
  state.socket?.emit("answer_reveal");
});

els.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  if (!question || state.san <= 0) return;
  state.socket?.emit("question_submit", { content: question });
  els.questionInput.value = "";
});

els.judgeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.lastQuestionId) return;
    const result = button.dataset.result;
    const note = els.hostHintInput.value.trim();
    state.socket?.emit("question_result", {
      questionId: state.lastQuestionId,
      result,
      note,
      sanCost: 2,
    });
    els.hostHintInput.value = "";
  });
});

els.sendHintBtn.addEventListener("click", () => {
  const hint = els.hostHintInput.value.trim();
  if (!hint) return;
  state.socket?.emit("host_hint", { content: hint });
  els.hostHintInput.value = "";
});

els.resultList.addEventListener("click", (event) => {
  const featureButton = event.target.closest(".result-feature-btn");
  if (featureButton) {
    state.socket?.emit("question_feature", {
      questionId: featureButton.dataset.questionId,
      featured: featureButton.dataset.featured !== "true",
    });
    return;
  }
  const button = event.target.closest(".result-delete-btn");
  if (!button) return;
  const confirmed = window.confirm("确认删除这条提问结果？删除后会从所有人记录里移除。");
  if (!confirmed) return;
  state.socket?.emit("question_delete", { questionId: button.dataset.questionId });
});

els.compactResultsBtn.addEventListener("click", () => {
  state.compactResults = !state.compactResults;
  renderResults();
});

els.memberList.addEventListener("click", (event) => {
  const button = event.target.closest(".kick-btn");
  if (!button) return;
  const member = state.room?.members.find((item) => item.id === button.dataset.playerId);
  const confirmed = window.confirm(`确认踢出 ${member?.name || "该玩家"}？`);
  if (!confirmed) return;
  state.socket?.emit("player_kick", { playerId: button.dataset.playerId });
});

els.progressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = els.progressInput.value.trim();
  if (!label) return;
  state.socket?.emit("progress_add", { label });
  els.progressInput.value = "";
});

els.hostProgressList.addEventListener("change", (event) => {
  const item = event.target.closest(".progress-item");
  if (!item) return;
  const textInput = item.querySelector('input[type="text"]');
  const checkbox = item.querySelector('input[type="checkbox"]');
  state.socket?.emit("progress_update", {
    id: item.dataset.nodeId,
    label: textInput.value,
    completed: checkbox.checked,
  });
});

els.hostProgressList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const item = event.target.closest(".progress-item");
  if (!button || !item) return;
  state.socket?.emit("progress_delete", { id: item.dataset.nodeId });
});

els.voiceList.addEventListener("click", (event) => {
  const kickButton = event.target.closest(".voice-kick-btn");
  if (kickButton) {
    const member = state.room?.members.find((item) => item.id === kickButton.dataset.playerId);
    const confirmed = window.confirm(`确认踢出 ${member?.name || "该玩家"}？`);
    if (!confirmed) return;
    state.socket?.emit("player_kick", { playerId: kickButton.dataset.playerId });
    return;
  }
  const button = event.target.closest(".voice-block-btn");
  if (!button) return;
  state.socket?.emit("voice_block", {
    playerId: button.dataset.playerId,
    blocked: button.dataset.blocked !== "true",
  });
});

els.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  state.socket?.emit("chat_message", { text: message });
  els.chatInput.value = "";
  autoGrowTextarea(els.chatInput);
});

els.chatInput.addEventListener("input", () => autoGrowTextarea(els.chatInput));

let avatarHoldTimer = null;
let avatarHoldTriggered = false;

els.chatList.addEventListener("dblclick", (event) => {
  const avatar = event.target.closest(".avatar[data-user-id]");
  if (!avatar?.dataset.userId || avatar.dataset.userId === state.user?.id) return;
  state.socket?.emit("chat_pat", { playerId: avatar.dataset.userId });
});

els.chatList.addEventListener("contextmenu", (event) => {
  const avatar = event.target.closest(".avatar[data-user-name]");
  if (!avatar?.dataset.userName) return;
  event.preventDefault();
  mentionUser(avatar.dataset.userName);
});

els.chatList.addEventListener("pointerdown", (event) => {
  const avatar = event.target.closest(".avatar[data-user-name]");
  if (!avatar?.dataset.userName || event.pointerType === "mouse") return;
  avatarHoldTriggered = false;
  clearTimeout(avatarHoldTimer);
  avatarHoldTimer = setTimeout(() => {
    avatarHoldTriggered = true;
    mentionUser(avatar.dataset.userName);
  }, 520);
});

["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
  els.chatList.addEventListener(type, () => {
    clearTimeout(avatarHoldTimer);
  });
});

els.chatList.addEventListener("click", (event) => {
  if (!avatarHoldTriggered) return;
  event.preventDefault();
  avatarHoldTriggered = false;
});

els.mobileTabs.forEach((button) => {
  button.addEventListener("click", () => {
    els.mobileTabs.forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    els.gameView.dataset.activePanel = button.dataset.panel;
  });
});

window.addEventListener("beforeunload", () => {
  sendLeaveBeacon();
  saveSession();
});

restoreSession();
