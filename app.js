const SUPABASE_URL = "https://ftcrohylqnlmwlhybkha.supabase.co";
const SUPABASE_KEY = "sb_publishable_uf_7B5i4YVsQWw7RjiQ_wQ_9KKoop4M";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
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

  if (!events || events.length === 0) {
    root.innerHTML = '<p class="muted">現在、登録されているイベントはありません。</p>';
    return;
  }

  const { data: responses, error: responseError } = await db
    .from("event_responses")
    .select("*");

  if (responseError) console.error(responseError);

  root.innerHTML = events.map((event) => {
    const members = (responses || []).filter(
      (response) =>
        response.event_id === event.id &&
        response.attendance === "参加"
    );

    const date = escapeHTML(event.event_date || "");
    const time = escapeHTML(event.event_time || "");
    const location = escapeHTML(event.location || "");
    const description = escapeHTML(event.description || "");

    return `
      <article class="event-card">
        <h3>${escapeHTML(event.title)}</h3>
        <div class="event-meta">
          📅 ${date} ${time}<br>
          📍 ${location}<br>
          👥 参加 ${members.length}人
        </div>
        <p class="event-description">${description}</p>
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

async function joinEvent(eventId) {
  const name = prompt("参加する方のお名前を入力してください。");
  if (!name || !name.trim()) return;

  const memberName = name.trim();

  const { error } = await db
    .from("event_responses")
    .upsert({
      event_id: eventId,
      member_name: memberName,
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
    console.error(error);
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
  const time = $("event-time").value.trim();
  const location = $("event-location").value.trim();
  const description = $("event-description").value.trim();

  if (!title || !date || !location || !description) {
    showMessage("event-admin-message", "イベント名・開催日・場所・内容を入力してください。", true);
    return;
  }

  const { error } = await db.from("events").insert({
    title,
    event_date: date,
    event_time: time,
    location,
    description
  });

  if (error) {
    showMessage("event-admin-message", "登録エラー：" + error.message, true);
    return;
  }

  ["event-title", "event-date", "event-time", "event-location", "event-description"]
    .forEach((id) => $(id).value = "");

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

document.addEventListener("DOMContentLoaded", async () => {
  $("login-button").addEventListener("click", login);
  $("logout-button").addEventListener("click", logout);
  $("add-event-button").addEventListener("click", addEvent);
  $("add-announcement-button").addEventListener("click", addAnnouncement);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("events-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "join") await joinEvent(id);
    if (action === "cancel") await cancelEvent(id);
    if (action === "delete-event") await deleteEvent(id);
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
});
