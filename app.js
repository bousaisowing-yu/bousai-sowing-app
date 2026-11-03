
const SUPABASE_URL = "https://ftcrohylqnlmwlhybkha.supabase.co";
const SUPABASE_KEY = "sb_publishable_uf_7B5i4YVsQWw7RjiQ_wQ_9KKoop4M";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let allEvents = [];
let allResponses = [];
let calendarDate = new Date();
let selectedDate = formatDate(new Date());
let editingEventId = null;
let originalEventButtonText = "";

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? "#b42318" : "#315d42";
}

function addCalendarStyles() {
  if ($("calendar-dynamic-styles")) return;

  const style = document.createElement("style");
  style.id = "calendar-dynamic-styles";
  style.textContent = `
    .event-view-switch {
      display:flex;
      gap:10px;
      margin:18px 0;
    }
    .event-view-switch button { flex:1; }
    .calendar-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin:20px 0;
    }
    .calendar-header h3 { margin:0; }
    .calendar-header button {
      background:#234b35;
      color:white;
      font-size:24px;
      width:42px;
      height:42px;
      padding:0;
    }
    .calendar-grid {
      display:grid;
      grid-template-columns:repeat(7,minmax(0,1fr));
      gap:4px;
    }
    .calendar-weekday {
      text-align:center;
      font-size:12px;
      font-weight:bold;
      padding:8px 0;
    }
    .calendar-day {
      min-width:0;
      min-height:58px;
      border:1px solid #ddd;
      border-radius:8px;
      background:white;
      color:#333;
      padding:5px 2px;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:5px;
    }
    .calendar-day.other-month { opacity:.35; }
    .calendar-day.selected {
      border:2px solid #315d42;
      background:#e8f1e9;
      font-weight:bold;
    }
    .calendar-day.today {
      color:#267344;
      font-weight:bold;
    }
    .calendar-event-dot {
      width:7px;
      height:7px;
      border-radius:50%;
      background:#315d42;
    }
    .calendar-selected-events { margin-top:24px; }
    .calendar-selected-events h3 {
      font-size:17px;
      border-bottom:2px solid #315d42;
      padding-bottom:10px;
    }
    [hidden] { display:none !important; }
  `;
  document.head.appendChild(style);
}

function switchTab(tab) {
  ["events", "news", "admin"].forEach(name => {
    const page = $(name + "-page");
    if (page) page.hidden = name !== tab;
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
}

function setEventView(view) {
  const calendar = view === "calendar";

  $("events-list").hidden = calendar;
  $("events-calendar").hidden = !calendar;

  $("event-list-view-button").className =
    calendar ? "secondary-button" : "primary-button";

  $("event-calendar-view-button").className =
    calendar ? "primary-button" : "secondary-button";

  if (calendar) renderCalendar();
}

function getEventMembers(eventId) {
  return allResponses.filter(response =>
    response.event_id === eventId &&
    response.attendance === "参加"
  );
}

function renderEventCards(events) {
  if (!events || events.length === 0) {
    return '<p class="muted">この日のイベントはありません。</p>';
  }

  return events.map(event => {
    const members = getEventMembers(event.id);

    return `
      <article class="event-card">
        <h3>${escapeHTML(event.title)}</h3>
        <div class="event-meta">
          📅 ${escapeHTML(event.event_date || "")}
          ${escapeHTML(event.event_time || "")}<br>
          📍 ${escapeHTML(event.location || "")}<br>
          👥 参加 ${members.length}人
        </div>
        <p class="event-description">${escapeHTML(event.description || "")}</p>
        <div class="participant-list">
          <strong>参加予定</strong><br>
          ${members.length
            ? members.map(member => escapeHTML(member.member_name)).join("、")
            : "まだ参加者はいません"}
        </div>
        <div class="event-actions">
          <button class="primary-button" data-action="join" data-id="${event.id}">参加する</button>
          <button class="secondary-button" data-action="cancel" data-id="${event.id}">参加を取り消す</button>
          ${isAdmin
            ? `
              <button class="secondary-button" data-action="edit-event" data-id="${event.id}">編集</button>
              <button class="secondary-button" data-action="delete-event" data-id="${event.id}">削除</button>
            `
            : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function loadEvents() {
  $("events-list").innerHTML = '<p class="muted">読み込み中…</p>';

  const { data: events, error } = await db
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) {
    $("events-list").textContent = "イベントを読み込めませんでした。";
    console.error(error);
    return;
  }

  allEvents = events || [];

  const { data: responses, error: responseError } = await db
    .from("event_responses")
    .select("*");

  if (responseError) console.error(responseError);

  allResponses = responses || [];

  $("events-list").innerHTML = allEvents.length
    ? renderEventCards(allEvents)
    : '<p class="muted">現在、登録されているイベントはありません。</p>';

  renderCalendar();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  $("calendar-month").textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const today = formatDate(new Date());

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  let html = weekdays.map(day =>
    `<div class="calendar-weekday">${day}</div>`
  ).join("");

  for (let i = 0; i < totalCells; i++) {
    const number = i - firstDay + 1;
    const date = new Date(year, month, number);
    const dateString = formatDate(date);
    const inMonth = number >= 1 && number <= daysInMonth;

    const hasEvent = allEvents.some(event =>
      event.event_date === dateString
    );

    const classes = [
      "calendar-day",
      inMonth ? "" : "other-month",
      dateString === selectedDate ? "selected" : "",
      dateString === today ? "today" : ""
    ].filter(Boolean).join(" ");

    html += `
      <button type="button"
        class="${classes}"
        data-calendar-date="${dateString}"
        ${inMonth ? "" : "disabled"}>
        <span class="calendar-day-number">${inMonth ? number : ""}</span>
        ${hasEvent && inMonth
          ? '<span class="calendar-event-dot"></span>'
          : ""}
      </button>
    `;
  }

  $("calendar-grid").innerHTML = html;
  renderSelectedDay();
}

function renderSelectedDay() {
  const date = new Date(selectedDate + "T00:00:00");

  $("calendar-selected-date").textContent =
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日のイベント`;

  const events = allEvents.filter(event =>
    event.event_date === selectedDate
  );

  $("calendar-day-events").innerHTML = renderEventCards(events);
}

function changeCalendarMonth(amount) {
  calendarDate = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + amount,
    1
  );

  selectedDate = formatDate(calendarDate);
  renderCalendar();
}

async function joinEvent(id) {
  const name = prompt("参加する方のお名前を入力してください。");
  if (!name || !name.trim()) return;

  const { error } = await db.from("event_responses").upsert({
    event_id: id,
    member_name: name.trim(),
    attendance: "参加"
  }, {
    onConflict: "event_id,member_name"
  });

  if (error) {
    alert("参加登録できませんでした：" + error.message);
    return;
  }

  alert("参加登録しました！");
  await loadEvents();
}

async function cancelEvent(id) {
  const name = prompt("参加登録したときのお名前を入力してください。");
  if (!name || !name.trim()) return;

  const { error } = await db.from("event_responses")
    .delete()
    .eq("event_id", id)
    .eq("member_name", name.trim());

  if (error) {
    alert("参加を取り消せませんでした：" + error.message);
    return;
  }

  alert("参加を取り消しました。");
  await loadEvents();
}

async function deleteEvent(id) {
  if (!isAdmin || !confirm("このイベントを削除しますか？")) return;

  const { error } = await db.from("events").delete().eq("id", id);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadEvents();
}

function startEditEvent(id) {
  if (!isAdmin) return;

  const event = allEvents.find(item => item.id === id);
  if (!event) return;

  editingEventId = id;

  const timeParts = (event.event_time || "").split(/[～〜~]/);

  $("event-title").value = event.title || "";
  $("event-date").value = event.event_date || "";
  $("event-time-start").value = timeParts[0]?.trim() || "";
  $("event-time-end").value = timeParts[1]?.trim() || "";
  $("event-location").value = event.location || "";
  $("event-description").value = event.description || "";

  const button = $("add-event-button");
  if (!originalEventButtonText) {
    originalEventButtonText = button.textContent;
  }
  button.textContent = "変更を保存";

  $("event-edit-cancel-button").hidden = false;

  showMessage("event-admin-message", "イベントを編集中です。");
  switchTab("admin");

  $("event-title").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function cancelEditEvent() {
  editingEventId = null;

  [
    "event-title", "event-date", "event-time-start",
    "event-time-end", "event-location", "event-description"
  ].forEach(id => $(id).value = "");

  $("add-event-button").textContent =
    originalEventButtonText || "イベントを登録";

  $("event-edit-cancel-button").hidden = true;
  showMessage("event-admin-message", "編集をキャンセルしました。");
}

async function addEvent() {
  if (!isAdmin) return;

  const title = $("event-title").value.trim();
  const date = $("event-date").value;
  const start = $("event-time-start").value;
  const end = $("event-time-end").value;
  const location = $("event-location").value.trim();
  const description = $("event-description").value.trim();

  if (!title || !date || !start || !end || !location || !description) {
    showMessage("event-admin-message", "すべての項目を入力してください。", true);
    return;
  }

  if (start >= end) {
    showMessage("event-admin-message", "終了時間は開始時間より後にしてください。", true);
    return;
  }

  const eventData = {
    title,
    event_date: date,
    event_time: `${start}～${end}`,
    location,
    description
  };

  let error;

  if (editingEventId) {
    ({ error } = await db.from("events")
      .update(eventData)
      .eq("id", editingEventId));
  } else {
    ({ error } = await db.from("events").insert(eventData));
  }

  if (error) {
    showMessage(
      "event-admin-message",
      "保存エラー：" + error.message,
      true
    );
    return;
  }

  const wasEditing = !!editingEventId;
  cancelEditEvent();

  showMessage(
    "event-admin-message",
    wasEditing ? "イベントを更新しました！" : "イベントを登録しました！"
  );

  await loadEvents();
}

async function loadAnnouncements() {
  const root = $("announcements-list");
  root.innerHTML = '<p class="muted">読み込み中…</p>';

  const { data, error } = await db.from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    root.textContent = "お知らせを読み込めませんでした。";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    root.innerHTML = '<p class="muted">現在、お知らせはありません。</p>';
    return;
  }

  root.innerHTML = data.map(item => `
    <article class="announcement-card">
      <h3>${escapeHTML(item.title)}</h3>
      <p class="announcement-content">${escapeHTML(item.content)}</p>
      <p class="muted">${escapeHTML(new Date(item.created_at).toLocaleString("ja-JP"))}</p>
      ${isAdmin
        ? `<button class="secondary-button" data-action="delete-announcement" data-id="${item.id}">削除</button>`
        : ""}
    </article>
  `).join("");
}

async function addAnnouncement() {
  if (!isAdmin) return;

  const title = $("announcement-title").value.trim();
  const content = $("announcement-content").value.trim();

  if (!title || !content) {
    showMessage("announcement-admin-message", "タイトルと本文を入力してください。", true);
    return;
  }

  const { error } = await db.from("announcements").insert({
    title,
    content
  });

  if (error) {
    showMessage("announcement-admin-message", "投稿エラー：" + error.message, true);
    return;
  }

  $("announcement-title").value = "";
  $("announcement-content").value = "";
  showMessage("announcement-admin-message", "お知らせを投稿しました！");
  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!isAdmin || !confirm("このお知らせを削除しますか？")) return;

  const { error } = await db.from("announcements").delete().eq("id", id);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadAnnouncements();
}

async function checkAdmin() {
  if (!currentUser) {
    isAdmin = false;
  } else {
    const { data, error } = await db.from("admin_users")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    isAdmin = !error && !!data;
  }

  $("admin-functions").hidden = !isAdmin;
  document.querySelector(".auth-panel").hidden = isAdmin;
  $("admin-tab").hidden = false;
}

async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  if (!email || !password) {
    showMessage("auth-message", "メールアドレスとパスワードを入力してください。", true);
    return;
  }

  $("login-button").disabled = true;

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  $("login-button").disabled = false;

  if (error) {
    showMessage("auth-message", "ログインできませんでした。入力内容を確認してください。", true);
    return;
  }

  currentUser = data.user;
  await checkAdmin();

  if (!isAdmin) {
    await db.auth.signOut();
    currentUser = null;
    showMessage("auth-message", "管理者アカウントではありません。", true);
    return;
  }

  showMessage("auth-message", "管理者としてログインしました。");
  await loadEvents();
  await loadAnnouncements();
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  isAdmin = false;

  if (editingEventId) cancelEditEvent();

  await checkAdmin();
  showMessage("auth-message", "ログアウトしました。");
  await loadEvents();
  await loadAnnouncements();
  switchTab("events");
}

document.addEventListener("DOMContentLoaded", async () => {
  addCalendarStyles();

  const eventButton = $("add-event-button");
  originalEventButtonText = eventButton.textContent;

  const cancelButton = document.createElement("button");
  cancelButton.id = "event-edit-cancel-button";
  cancelButton.type = "button";
  cancelButton.className = "secondary-button";
  cancelButton.textContent = "編集をキャンセル";
  cancelButton.hidden = true;
  cancelButton.addEventListener("click", cancelEditEvent);
  eventButton.insertAdjacentElement("afterend", cancelButton);

  $("login-button").addEventListener("click", login);
  $("logout-button").addEventListener("click", logout);
  $("add-event-button").addEventListener("click", addEvent);
  $("add-announcement-button").addEventListener("click", addAnnouncement);

  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.id === "event-list-view-button") {
      event.preventDefault();
      setEventView("list");
      return;
    }

    if (button.id === "event-calendar-view-button") {
      event.preventDefault();
      setEventView("calendar");
      return;
    }

    if (button.id === "calendar-prev") {
      changeCalendarMonth(-1);
      return;
    }

    if (button.id === "calendar-next") {
      changeCalendarMonth(1);
      return;
    }

    if (button.dataset.calendarDate) {
      selectedDate = button.dataset.calendarDate;
      renderCalendar();
      return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "join") joinEvent(id);
    if (action === "cancel") cancelEvent(id);
    if (action === "edit-event") startEditEvent(id);
    if (action === "delete-event") deleteEvent(id);
    if (action === "delete-announcement") deleteAnnouncement(id);
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  const { data } = await db.auth.getSession();
  if (data.session) currentUser = data.session.user;

  await checkAdmin();
  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
  setEventView("list");
});
