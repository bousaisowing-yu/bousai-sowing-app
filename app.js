
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

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      display: flex;
      gap: 10px;
      margin: 18px 0;
    }

    .event-view-switch button {
      flex: 1;
    }

    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 20px 0;
    }

    .calendar-header h3 {
      margin: 0;
    }

    .calendar-header button {
      border: none;
      border-radius: 8px;
      background: #234b35;
      color: white;
      font-size: 24px;
      width: 42px;
      height: 42px;
      cursor: pointer;
    }

    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .calendar-weekday {
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      padding: 8px 0;
      color: #555;
    }

    .calendar-day {
      min-width: 0;
      min-height: 58px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      color: #333;
      padding: 5px 2px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 5px;
    }

    .calendar-day.other-month {
      opacity: 0.35;
    }

    .calendar-day.selected {
      border: 2px solid #315d42;
      background: #e8f1e9;
      font-weight: bold;
    }

    .calendar-day.today {
      color: #267344;
      font-weight: bold;
    }

    .calendar-day-number {
      font-size: 14px;
    }

    .calendar-event-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #315d42;
    }

    .calendar-selected-events {
      margin-top: 24px;
    }

    .calendar-selected-events h3 {
      font-size: 17px;
      border-bottom: 2px solid #315d42;
      padding-bottom: 10px;
    }
  `;

  document.head.appendChild(style);
}

async function checkAdmin() {
  if (!currentUser) {
    isAdmin = false;
  } else {
    const { data, error } = await db
      .from("admin_users")
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
  await checkAdmin();
  showMessage("auth-message", "ログアウトしました。");
  await loadEvents();
  await loadAnnouncements();
  switchTab("events");
}

function switchTab(tab) {
  ["events", "news", "admin"].forEach((name) => {
    const page = $(name + "-page");
    if (page) page.hidden = name !== tab;
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
}

function setEventView(view) {
  const isCalendar = view === "calendar";

  $("events-list").hidden = isCalendar;
  $("events-calendar").hidden = !isCalendar;

  $("event-list-view-button").className =
    isCalendar ? "secondary-button" : "primary-button";

  $("event-calendar-view-button").className =
    isCalendar ? "primary-button" : "secondary-button";

  if (isCalendar) {
    renderCalendar();
  }
}

function getEventMembers(eventId) {
  return allResponses.filter(
    (response) =>
      response.event_id === eventId &&
      response.attendance === "参加"
  );
}

function renderEventCards(events) {
  if (!events || events.length === 0) {
    return '<p class="muted">この日のイベントはありません。</p>';
  }

  return events.map((event) => {
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

        <p class="event-description">
          ${escapeHTML(event.description || "")}
        </p>

        <div class="participant-list">
          <strong>参加予定</strong><br>
          ${members.length
            ? members.map((member) => escapeHTML(member.member_name)).join("、")
            : "まだ参加者はいません"}
        </div>

        <div class="event-actions">
          <button class="primary-button" data-action="join" data-id="${event.id}">
            参加する
          </button>

          <button class="secondary-button" data-action="cancel" data-id="${event.id}">
            参加を取り消す
          </button>

          ${
            isAdmin
              ? `<button class="secondary-button" data-action="delete-event" data-id="${event.id}">削除</button>`
              : ""
          }
        </div>
      </article>
    `;
  }).join("");
}

async function loadEvents() {
  const root = $("events-list");
  root.innerHTML = '<p class="muted">読み込み中…</p>';

  const { data: events, error } = await db
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) {
    root.textContent = "イベントを読み込めませんでした。";
    console.error(error);
    return;
  }

  allEvents = events || [];

  const { data: responses, error: responseError } = await db
    .from("event_responses")
    .select("*");

  if (responseError) console.error(responseError);

  allResponses = responses || [];

  if (allEvents.length === 0) {
    root.innerHTML = '<p class="muted">現在、登録されているイベントはありません。</p>';
  } else {
    root.innerHTML = renderEventCards(allEvents);
  }

  renderCalendar();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  $("calendar-month").textContent =
    `${year}年${month + 1}月`;

  const grid = $("calendar-grid");

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = formatDate(new Date());

  let html = weekdays.map(day =>
    `<div class="calendar-weekday">${day}</div>`
  ).join("");

  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - startDay + 1;
    const date = new Date(year, month, dayNumber);
    const dateString = formatDate(date);

    const inCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    const hasEvent = allEvents.some(
      event => event.event_date === dateString
    );

    const classes = [
      "calendar-day",
      inCurrentMonth ? "" : "other-month",
      dateString === selectedDate ? "selected" : "",
      dateString === today ? "today" : ""
    ].filter(Boolean).join(" ");

    html += `
      <button
        type="button"
        class="${classes}"
        data-calendar-date="${dateString}"
        ${inCurrentMonth ? "" : "disabled"}
      >
        <span class="calendar-day-number">
          ${inCurrentMonth ? dayNumber : ""}
        </span>
        ${hasEvent && inCurrentMonth
          ? '<span class="calendar-event-dot"></span>'
          : ""}
      </button>
    `;
  }

  grid.innerHTML = html;
  renderSelectedDay();
}

function renderSelectedDay() {
  const date = new Date(selectedDate + "T00:00:00");

  $("calendar-selected-date").textContent =
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日のイベント`;

  const dayEvents = allEvents.filter(
    event => event.event_date === selectedDate
  );

  $("calendar-day-events").innerHTML = renderEventCards(dayEvents);
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

async function joinEvent(eventId) {
  const name = prompt("参加する方のお名前を入力してください。");
  if (!name || !name.trim()) return;

  const { error } = await db
    .from("event_responses")
    .upsert({
      event_id: eventId,
      member_name: name.trim(),
      attendance: "参加"
    }, {
      onConflict: "event_id,member_name"
    });

  if (error) {
    alert("参加登録できませんでした：" + error.message);
    console.error(error);
    return;
  }

  alert("参加登録しました！");
  await loadEvents();
}

async function cancelEvent(eventId) {
  const name = prompt("参加登録したときのお名前を入力してください。");
  if (!name || !name.trim()) return;

  const { error } = await db
    .from("event_responses")
    .delete()
    .eq("event_id", eventId)
    .eq("member_name", name.trim());

  if (error) {
    alert("参加を取り消せませんでした：" + error.message);
    return;
  }

  alert("参加を取り消しました。");
  await loadEvents();
}

async function deleteEvent(eventId) {
  if (!isAdmin) return;
  if (!confirm("このイベントを削除しますか？")) return;

  const { error } = await db
    .from("events")
    .delete()
    .eq("id", eventId);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadEvents();
}

async function loadAnnouncements() {
  const root = $("announcements-list");
  root.innerHTML = '<p class="muted">読み込み中…</p>';

  const { data, error } = await db
    .from("announcements")
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

  root.innerHTML = data.map((item) => `
    <article class="announcement-card">
      <h3>${escapeHTML(item.title)}</h3>
      <p class="announcement-content">${escapeHTML(item.content)}</p>
      <p class="muted">${escapeHTML(new Date(item.created_at).toLocaleString("ja-JP"))}</p>
      ${
        isAdmin
          ? `<button class="secondary-button" data-action="delete-announcement" data-id="${item.id}">削除</button>`
          : ""
      }
    </article>
  `).join("");
}

async function addEvent() {
  if (!isAdmin) return;

  const title = $("event-title").value.trim();
  const date = $("event-date").value;
  const startTime = $("event-time-start").value;
  const endTime = $("event-time-end").value;
  const location = $("event-location").value.trim();
  const description = $("event-description").value.trim();

  if (!title || !date || !startTime || !endTime || !location || !description) {
    showMessage("event-admin-message", "すべての項目を入力してください。", true);
    return;
  }

  if (startTime >= endTime) {
    showMessage("event-admin-message", "終了時間は開始時間より後にしてください。", true);
    return;
  }

  const eventTime = `${startTime}～${endTime}`;

  const { error } = await db.from("events").insert({
    title,
    event_date: date,
    event_time: eventTime,
    location,
    description
  });

  if (error) {
    showMessage("event-admin-message", "登録エラー：" + error.message, true);
    return;
  }

  [
    "event-title",
    "event-date",
    "event-time-start",
    "event-time-end",
    "event-location",
    "event-description"
  ].forEach((id) => $(id).value = "");

  showMessage("event-admin-message", "イベントを登録しました！");
  await loadEvents();
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
  if (!isAdmin) return;
  if (!confirm("このお知らせを削除しますか？")) return;

  const { error } = await db
    .from("announcements")
    .delete()
    .eq("id", id);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadAnnouncements();
}

function handleEventAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "join") joinEvent(id);
  if (action === "cancel") cancelEvent(id);
  if (action === "delete-event") deleteEvent(id);
}

document.addEventListener("DOMContentLoaded", async () => {
  addCalendarStyles();

  $("login-button").addEventListener("click", login);
  $("logout-button").addEventListener("click", logout);
  $("add-event-button").addEventListener("click", addEvent);
  $("add-announcement-button").addEventListener("click", addAnnouncement);

  $("event-list-view-button").addEventListener("click", () => {
    setEventView("list");
  });

  $("event-calendar-view-button").addEventListener("click", () => {
    setEventView("calendar");
  });

  $("calendar-prev").addEventListener("click", () => {
    changeCalendarMonth(-1);
  });

  $("calendar-next").addEventListener("click", () => {
    changeCalendarMonth(1);
  });

  $("calendar-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button || button.disabled) return;

    selectedDate = button.dataset.calendarDate;
    renderCalendar();
  });

  $("events-list").addEventListener("click", handleEventAction);
  $("calendar-day-events").addEventListener("click", handleEventAction);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("announcements-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    if (button.dataset.action === "delete-announcement") {
      await deleteAnnouncement(button.dataset.id);
    }
  });

  const { data } = await db.auth.getSession();

  if (data.session) {
    currentUser = data.session.user;
  }

  await checkAdmin();
  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
  setEventView("list");
});
