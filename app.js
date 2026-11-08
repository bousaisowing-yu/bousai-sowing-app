const SUPABASE_URL = "https://ftcrohylqnlmwlhybkha.supabase.co";
const SUPABASE_KEY = "sb_publishable_uf_7B5i4YVsQWw7RjiQ_wQ_9KKoop4M";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const IMAGE_BUCKET = "site-images";

let currentUser = null;
let isAdmin = false;
let allEvents = [];
let allResponses = [];
let allInterests = {};

let calendarDate = new Date();
let selectedDate = formatDate(new Date());
let editingEventId = null;
let originalEventButtonText = "";
let currentEventImageUrl = "";
let currentHeroImageUrl = "";

const interestBusy = new Set();

/* -----------------------------
   共通処理
----------------------------- */

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

/* -----------------------------
   匿名ログイン
----------------------------- */

async function ensureUserSession() {
  const { data, error } = await db.auth.getSession();

  if (error) throw error;

  if (data?.session?.user) {
    currentUser = data.session.user;
    return currentUser;
  }

  const { data: anonData, error: anonError } =
    await db.auth.signInAnonymously();

  if (anonError) throw anonError;

  currentUser = anonData.user;

  return currentUser;
}

/* -----------------------------
   カレンダー用スタイル
----------------------------- */

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

    .event-view-switch button {
      flex:1;
    }

    .calendar-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin:20px 0;
    }

    .calendar-header h3 {
      margin:0;
    }

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

    .calendar-day.other-month {
      opacity:.35;
    }

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

    .calendar-selected-events {
      margin-top:24px;
    }

    .calendar-selected-events h3 {
      font-size:17px;
      border-bottom:2px solid #315d42;
      padding-bottom:10px;
    }

    .event-card-image {
      display:block;
      width:100%;
      max-height:320px;
      aspect-ratio:16/9;
      object-fit:cover;
      background:#eaf1e9;
      border-radius:12px;
      margin-bottom:14px;
    }

    .event-card-content {
      padding:16px;
    }

    .image-preview {
      display:block;
      width:100%;
      max-height:300px;
      object-fit:contain;
      background:#eaf1e9;
      border-radius:12px;
      margin-top:12px;
    }

    .event-card {
      border:1px solid #dce5dc;
      border-radius:14px;
      padding:16px;
      margin:14px 0;
      overflow:hidden;
    }

    .event-card h3 {
      margin-top:0;
    }

    .event-description {
      white-space:pre-wrap;
    }

    .participant-list {
      margin-top:12px;
    }

    .event-actions {
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-top:14px;
    }

    .event-actions button {
      margin:0;
    }

    /* 気になる機能 */

    .event-interest {
      display:flex;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      gap:10px;
      margin-top:16px;
      padding:12px;
      background:#f1f6f1;
      border-radius:10px;
    }

    .event-interest-count {
      font-weight:bold;
      color:#315d42;
    }

    .interest-button {
      border:1px solid #315d42;
      border-radius:20px;
      padding:8px 16px;
      background:white;
      color:#315d42;
      font-weight:bold;
      cursor:pointer;
    }

    .interest-button.active {
      background:#315d42;
      color:white;
    }

    .interest-button:disabled {
      opacity:.5;
      cursor:not-allowed;
    }

    [hidden] {
      display:none !important;
    }
  `;

  document.head.appendChild(style);
}

/* -----------------------------
   タブ・表示切り替え
----------------------------- */

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
    String(response.event_id) === String(eventId) &&
    response.attendance === "参加"
  );
}

/* -----------------------------
   気になる機能
----------------------------- */

async function loadEventInterests() {
  allInterests = {};

  if (!allEvents.length) return;

  try {
    await ensureUserSession();

    const results = await Promise.all(
      allEvents.map(async event => {
        const { data, error } = await db.rpc(
          "get_event_interest_status",
          {
            p_event_id: event.id
          }
        );

        if (error) {
          console.error("気になる情報の取得エラー:", error);

          return [
            event.id,
            {
              count: 0,
              isInterested: false,
              unavailable: true
            }
          ];
        }

        const result = Array.isArray(data) ? data[0] : data;

        return [
          event.id,
          {
            count: Number(result?.interest_count || 0),
            isInterested: !!result?.is_interested,
            unavailable: false
          }
        ];
      })
    );

    allInterests = Object.fromEntries(results);

  } catch (error) {
    console.error("気になる情報を読み込めませんでした:", error);
  }
}

async function toggleEventInterest(id) {
  const key = String(id);

  if (interestBusy.has(key)) return;

  interestBusy.add(key);

  document.querySelectorAll(".interest-button").forEach(button => {
    if (String(button.dataset.id) === key) {
      button.disabled = true;
    }
  });

  try {
    await ensureUserSession();

    const { data, error } = await db.rpc(
      "toggle_event_interest",
      {
        p_event_id: id
      }
    );

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    allInterests[id] = {
      count: Number(result?.interest_count || 0),
      isInterested: !!result?.is_interested,
      unavailable: false
    };

    renderAllEventViews();

  } catch (error) {
    console.error(error);

    alert(
      "「気になる」の登録・解除ができませんでした。\n" +
      error.message
    );

  } finally {
    interestBusy.delete(key);

    document.querySelectorAll(".interest-button").forEach(button => {
      if (String(button.dataset.id) === key) {
        button.disabled = false;
      }
    });
  }
}

/* -----------------------------
   イベント画面の再描画
----------------------------- */

function renderAllEventViews() {
  $("events-list").innerHTML = allEvents.length
    ? renderEventCards(allEvents)
    : '<p class="muted">現在、登録されているイベントはありません。</p>';

  renderCalendar();
}

/* -----------------------------
   画像アップロード共通処理
----------------------------- */

function isValidImage(file) {
  if (!file) return false;

  if (!file.type || !file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return false;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("画像は5MB以下のファイルを選択してください。");
    return false;
  }

  return true;
}

function getSafeExtension(file) {
  const allowed = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  return allowed[file.type] || "";
}

async function uploadImage(file, folder) {
  if (!isValidImage(file)) {
    throw new Error("画像ファイルを確認してください。");
  }

  const extension = getSafeExtension(file);

  if (!extension) {
    throw new Error("JPEG、PNG、WebP、GIF形式の画像を使用してください。");
  }

  const uniqueName =
    `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from(IMAGE_BUCKET)
    .upload(uniqueName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  const { data } = db.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(uniqueName);

  return data.publicUrl;
}

/* -----------------------------
   トップ画像
----------------------------- */

function setHeroImage(url) {
  if (!url) return;

  currentHeroImageUrl = url;

  const heroImage = $("hero-image");
  const preview = $("hero-image-preview");

  if (heroImage) heroImage.src = url;
  if (preview) preview.src = url;
}

async function loadHeroImage() {
  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "home_image_url")
    .maybeSingle();

  if (error) {
    console.warn("トップ画像設定を読み込めませんでした。", error.message);
    return;
  }

  if (data?.value) {
    setHeroImage(data.value);
  }
}

async function saveHeroImage() {
  if (!isAdmin) {
    showMessage("hero-image-message", "管理者ログインが必要です。", true);
    return;
  }

  const file = $("hero-image-file")?.files?.[0];

  if (!file) {
    showMessage("hero-image-message", "保存する画像を選択してください。", true);
    return;
  }

  if (!isValidImage(file)) return;

  const button = $("save-hero-image-button");
  button.disabled = true;

  showMessage("hero-image-message", "画像をアップロードしています…");

  try {
    const imageUrl = await uploadImage(file, "home");

    const { error } = await db
      .from("site_settings")
      .upsert({
        key: "home_image_url",
        value: imageUrl
      }, {
        onConflict: "key"
      });

    if (error) throw error;

    setHeroImage(imageUrl);
    $("hero-image-file").value = "";

    showMessage("hero-image-message", "トップ画像を保存しました！");

  } catch (error) {
    console.error(error);

    showMessage(
      "hero-image-message",
      "画像を保存できませんでした：" + error.message,
      true
    );

  } finally {
    button.disabled = false;
  }
}

/* -----------------------------
   イベント表示
----------------------------- */

function renderEventCards(events) {
  if (!events || events.length === 0) {
    return '<p class="muted">この日のイベントはありません。</p>';
  }

  return events.map(event => {
    const members = getEventMembers(event.id);

    const interest = allInterests[event.id] || {
      count: 0,
      isInterested: false,
      unavailable: false
    };

    const imageHtml = event.image_url
      ? `<img class="event-card-image"
          src="${escapeHTML(event.image_url)}"
          alt="${escapeHTML(event.title)}の画像"
          loading="lazy">`
      : "";

    return `
      <article class="event-card">
        ${imageHtml}

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
            ? members.map(member =>
                escapeHTML(member.member_name)
              ).join("、")
            : "まだ参加者はいません"}
        </div>

        <div class="event-interest">
          <span class="event-interest-count">
            ♥ 気になる ${interest.count}人
          </span>

          <button
            type="button"
            class="interest-button ${interest.isInterested ? "active" : ""}"
            data-action="toggle-interest"
            data-id="${escapeHTML(event.id)}"
            ${interestBusy.has(String(event.id)) ? "disabled" : ""}
            ${interest.unavailable ? "disabled" : ""}
          >
            ${interest.isInterested
              ? "♥ 気になるを解除"
              : "♡ 気になる"}
          </button>
        </div>

        <div class="event-actions">
          <button class="primary-button"
            data-action="join"
            data-id="${escapeHTML(event.id)}">
            参加する
          </button>

          <button class="secondary-button"
            data-action="cancel"
            data-id="${escapeHTML(event.id)}">
            参加を取り消す
          </button>

          ${isAdmin
            ? `
              <button class="secondary-button"
                data-action="edit-event"
                data-id="${escapeHTML(event.id)}">
                編集
              </button>

              <button class="secondary-button danger-button"
                data-action="delete-event"
                data-id="${escapeHTML(event.id)}">
                削除
              </button>
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

  await loadEventInterests();

  renderAllEventViews();
}

/* -----------------------------
   カレンダー
----------------------------- */

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
        <span class="calendar-day-number">
          ${inMonth ? number : ""}
        </span>

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

/* -----------------------------
   参加登録・キャンセル
----------------------------- */

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

/* -----------------------------
   イベント削除・編集
----------------------------- */

async function deleteEvent(id) {
  if (!isAdmin || !confirm("このイベントを削除しますか？")) return;

  const { error } = await db.from("events").delete().eq("id", id);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadEvents();
}

function setTimeInputs(prefix, time) {
  const match = (time || "").trim().match(/^(\d{1,2}):(\d{1,2})$/);

  $(prefix + "-hour").value = match ? Number(match[1]) : "";
  $(prefix + "-minute").value = match ? Number(match[2]) : "";
}

function getTimeValue(prefix) {
  const hourText = $(prefix + "-hour").value.trim();
  const minuteText = $(prefix + "-minute").value.trim();

  if (hourText === "" || minuteText === "") {
    return {
      error: "開始・終了時間の時と分をすべて入力してください。"
    };
  }

  if (!/^\d+$/.test(hourText) || !/^\d+$/.test(minuteText)) {
    return {
      error: "時刻は数字で入力してください。"
    };
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour < 0 || hour > 23) {
    return {
      error: "時は0〜23の範囲で入力してください。"
    };
  }

  if (minute < 0 || minute > 59) {
    return {
      error: "分は0〜59の範囲で入力してください。"
    };
  }

  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  };
}

function previewEventImage(url) {
  const preview = $("event-image-preview");

  if (!preview) return;

  if (url) {
    preview.src = url;
    preview.hidden = false;
  } else {
    preview.removeAttribute("src");
    preview.hidden = true;
  }
}

function startEditEvent(id) {
  if (!isAdmin) return;

  const event = allEvents.find(item =>
    String(item.id) === String(id)
  );

  if (!event) return;

  editingEventId = id;
  currentEventImageUrl = event.image_url || "";

  const timeParts = (event.event_time || "").split(/[～〜~]/);

  $("event-title").value = event.title || "";
  $("event-date").value = event.event_date || "";

  setTimeInputs("event-start", timeParts[0] || "");
  setTimeInputs("event-end", timeParts[1] || "");

  $("event-location").value = event.location || "";
  $("event-description").value = event.description || "";

  if ($("event-image-file")) {
    $("event-image-file").value = "";
  }

  previewEventImage(currentEventImageUrl);

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
  currentEventImageUrl = "";

  [
    "event-title",
    "event-date",
    "event-start-hour",
    "event-start-minute",
    "event-end-hour",
    "event-end-minute",
    "event-location",
    "event-description"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("event-image-file")) {
    $("event-image-file").value = "";
  }

  previewEventImage("");

  $("add-event-button").textContent =
    originalEventButtonText || "イベントを登録";

  $("event-edit-cancel-button").hidden = true;

  showMessage("event-admin-message", "編集をキャンセルしました。");
}

async function addEvent() {
  if (!isAdmin) return;

  const title = $("event-title").value.trim();
  const date = $("event-date").value;
  const location = $("event-location").value.trim();
  const description = $("event-description").value.trim();

  if (!title || !date || !location || !description) {
    showMessage(
      "event-admin-message",
      "すべての項目を入力してください。",
      true
    );
    return;
  }

  const startResult = getTimeValue("event-start");

  if (startResult.error) {
    showMessage("event-admin-message", startResult.error, true);
    return;
  }

  const endResult = getTimeValue("event-end");

  if (endResult.error) {
    showMessage("event-admin-message", endResult.error, true);
    return;
  }

  const start = startResult.value;
  const end = endResult.value;

  if (start >= end) {
    showMessage(
      "event-admin-message",
      "終了時間は開始時間より後にしてください。",
      true
    );
    return;
  }

  const saveButton = $("add-event-button");
  saveButton.disabled = true;

  try {
    let imageUrl = currentEventImageUrl;
    const imageFile = $("event-image-file")?.files?.[0];

    if (imageFile) {
      imageUrl = await uploadImage(imageFile, "events");
    }

    const eventData = {
      title,
      event_date: date,
      event_time: `${start}～${end}`,
      location,
      description,
      image_url: imageUrl || null
    };

    let error;

    if (editingEventId) {
      ({ error } = await db.from("events")
        .update(eventData)
        .eq("id", editingEventId));
    } else {
      ({ error } = await db.from("events").insert(eventData));
    }

    if (error) throw error;

    const wasEditing = !!editingEventId;

    cancelEditEvent();

    showMessage(
      "event-admin-message",
      wasEditing
        ? "イベントを更新しました！"
        : "イベントを登録しました！"
    );

    await loadEvents();

  } catch (error) {
    console.error(error);

    showMessage(
      "event-admin-message",
      "保存できませんでした：" + error.message,
      true
    );

  } finally {
    saveButton.disabled = false;
  }
}

/* -----------------------------
   お知らせ
----------------------------- */

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

      <p class="announcement-content">
        ${escapeHTML(item.content)}
      </p>

      <p class="muted">
        ${escapeHTML(
          item.created_at
            ? new Date(item.created_at).toLocaleString("ja-JP")
            : ""
        )}
      </p>

      ${isAdmin
        ? `<button class="secondary-button"
            data-action="delete-announcement"
            data-id="${escapeHTML(item.id)}">
            削除
          </button>`
        : ""}
    </article>
  `).join("");
}

async function addAnnouncement() {
  if (!isAdmin) return;

  const title = $("announcement-title").value.trim();
  const content = $("announcement-content").value.trim();

  if (!title || !content) {
    showMessage(
      "announcement-admin-message",
      "タイトルと本文を入力してください。",
      true
    );
    return;
  }

  const { error } = await db.from("announcements").insert({
    title,
    content
  });

  if (error) {
    showMessage(
      "announcement-admin-message",
      "投稿エラー：" + error.message,
      true
    );
    return;
  }

  $("announcement-title").value = "";
  $("announcement-content").value = "";

  showMessage(
    "announcement-admin-message",
    "お知らせを投稿しました！"
  );

  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!isAdmin || !confirm("このお知らせを削除しますか？")) return;

  const { error } = await db.from("announcements")
    .delete()
    .eq("id", id);

  if (error) {
    alert("削除できませんでした：" + error.message);
    return;
  }

  await loadAnnouncements();
}

/* -----------------------------
   管理者ログイン
----------------------------- */

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

  if ($("admin-functions")) {
    $("admin-functions").hidden = !isAdmin;
  }

  const authPanel = document.querySelector(".auth-panel");

  if (authPanel) {
    authPanel.hidden = isAdmin;
  }

  if ($("admin-tab")) {
    $("admin-tab").hidden = false;
  }
}

async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  if (!email || !password) {
    showMessage(
      "auth-message",
      "メールアドレスとパスワードを入力してください。",
      true
    );
    return;
  }

  $("login-button").disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    await checkAdmin();

    if (!isAdmin) {
      await db.auth.signOut();

      currentUser = null;

      await ensureUserSession();
      await checkAdmin();

      showMessage(
        "auth-message",
        "管理者アカウントではありません。",
        true
      );

      return;
    }

    showMessage(
      "auth-message",
      "管理者としてログインしました。"
    );

    await loadEvents();
    await loadAnnouncements();

  } catch (error) {
    console.error(error);

    showMessage(
      "auth-message",
      "ログインできませんでした。入力内容を確認してください。",
      true
    );

  } finally {
    $("login-button").disabled = false;
  }
}

async function logout() {
  await db.auth.signOut();

  currentUser = null;
  isAdmin = false;

  try {
    await ensureUserSession();
  } catch (error) {
    console.error("匿名ログインに失敗しました:", error);
  }

  if (editingEventId) {
    cancelEditEvent();
  }

  await checkAdmin();

  showMessage("auth-message", "ログアウトしました。");

  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
}

/* -----------------------------
   初期化・ボタン設定
----------------------------- */

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

  if ($("save-hero-image-button")) {
    $("save-hero-image-button").addEventListener(
      "click",
      saveHeroImage
    );
  }

  // トップ画像のプレビュー

  if ($("hero-image-file")) {
    $("hero-image-file").addEventListener("change", () => {
      const file = $("hero-image-file").files?.[0];

      if (!file) return;

      if (!isValidImage(file)) {
        $("hero-image-file").value = "";
        return;
      }

      $("hero-image-preview").src = URL.createObjectURL(file);
    });
  }

  // イベント画像のプレビュー

  if ($("event-image-file")) {
    $("event-image-file").addEventListener("change", () => {
      const file = $("event-image-file").files?.[0];

      if (!file) return;

      if (!isValidImage(file)) {
        $("event-image-file").value = "";
        return;
      }

      previewEventImage(URL.createObjectURL(file));
    });
  }

  // ボタン操作

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

    if (action === "join") {
      joinEvent(id);
      return;
    }

    if (action === "cancel") {
      cancelEvent(id);
      return;
    }

    if (action === "toggle-interest") {
      toggleEventInterest(id);
      return;
    }

    if (action === "edit-event") {
      startEditEvent(id);
      return;
    }

    if (action === "delete-event") {
      deleteEvent(id);
      return;
    }

    if (action === "delete-announcement") {
      deleteAnnouncement(id);
      return;
    }
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  // 匿名ログインまたは既存セッションの取得

  try {
    await ensureUserSession();
  } catch (error) {
    console.error("ログインセッションを準備できませんでした:", error);
  }

  await checkAdmin();

  await loadHeroImage();
  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
  setEventView("list");
});


/* =================================
   重要イベント機能
   ================================= */

// 重要マークの表示スタイル
const importantStyles = document.createElement("style");

importantStyles.textContent = `
  .important-setting {
    display:flex;
    align-items:center;
    gap:10px;
    margin:18px 0;
    padding:14px;
    border:1px solid #e3b341;
    border-radius:10px;
    background:#fff9e8;
    color:#765400;
    font-weight:bold;
  }

  .important-setting input {
    width:20px;
    height:20px;
    accent-color:#c58b00;
  }

  .important-event-badge {
    display:inline-flex;
    align-items:center;
    gap:5px;
    margin:0 0 12px;
    padding:5px 12px;
    border-radius:20px;
    background:#fff0c2;
    color:#805600;
    border:1px solid #e4b43c;
    font-size:13px;
    font-weight:bold;
  }
`;

document.head.appendChild(importantStyles);


// イベントカード表示を拡張
function renderEventCards(events) {
  if (!events || events.length === 0) {
    return '<p class="muted">この日のイベントはありません。</p>';
  }

  return events.map(event => {
    const members = getEventMembers(event.id);

    const interest = allInterests[event.id] || {
      count: 0,
      isInterested: false,
      unavailable: false
    };

    const imageHtml = event.image_url
      ? `<img class="event-card-image"
          src="${escapeHTML(event.image_url)}"
          alt="${escapeHTML(event.title)}の画像"
          loading="lazy">`
      : "";

    return `
      <article class="event-card">
        ${imageHtml}

        ${event.is_important
          ? '<div class="important-event-badge">★ 重要</div>'
          : ""}

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
            ? members.map(member =>
                escapeHTML(member.member_name)
              ).join("、")
            : "まだ参加者はいません"}
        </div>

        <div class="event-interest">
          <span class="event-interest-count">
            ♥ 気になる ${interest.count}人
          </span>

          <button
            type="button"
            class="interest-button ${interest.isInterested ? "active" : ""}"
            data-action="toggle-interest"
            data-id="${escapeHTML(event.id)}"
            ${interestBusy.has(String(event.id)) ? "disabled" : ""}
            ${interest.unavailable ? "disabled" : ""}
          >
            ${interest.isInterested
              ? "♥ 気になるを解除"
              : "♡ 気になる"}
          </button>
        </div>

        <div class="event-actions">
          <button class="primary-button"
            data-action="join"
            data-id="${escapeHTML(event.id)}">
            参加する
          </button>

          <button class="secondary-button"
            data-action="cancel"
            data-id="${escapeHTML(event.id)}">
            参加を取り消す
          </button>

          ${isAdmin
            ? `
              <button class="secondary-button"
                data-action="edit-event"
                data-id="${escapeHTML(event.id)}">
                編集
              </button>

              <button class="secondary-button danger-button"
                data-action="delete-event"
                data-id="${escapeHTML(event.id)}">
                削除
              </button>
            `
            : ""}
        </div>
      </article>
    `;
  }).join("");
}


// イベント編集時に重要設定を読み込む
function startEditEvent(id) {
  if (!isAdmin) return;

  const event = allEvents.find(item =>
    String(item.id) === String(id)
  );

  if (!event) return;

  editingEventId = id;
  currentEventImageUrl = event.image_url || "";

  const timeParts = (event.event_time || "").split(/[～〜~]/);

  $("event-title").value = event.title || "";
  $("event-date").value = event.event_date || "";

  setTimeInputs("event-start", timeParts[0] || "");
  setTimeInputs("event-end", timeParts[1] || "");

  $("event-location").value = event.location || "";
  $("event-description").value = event.description || "";

  $("event-is-important").checked = !!event.is_important;

  if ($("event-image-file")) {
    $("event-image-file").value = "";
  }

  previewEventImage(currentEventImageUrl);

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


// 編集キャンセル時に重要設定もリセット
function cancelEditEvent() {
  editingEventId = null;
  currentEventImageUrl = "";

  [
    "event-title",
    "event-date",
    "event-start-hour",
    "event-start-minute",
    "event-end-hour",
    "event-end-minute",
    "event-location",
    "event-description"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("event-is-important")) {
    $("event-is-important").checked = false;
  }

  if ($("event-image-file")) {
    $("event-image-file").value = "";
  }

  previewEventImage("");

  $("add-event-button").textContent =
    originalEventButtonText || "イベントを登録";

  $("event-edit-cancel-button").hidden = true;

  showMessage("event-admin-message", "編集をキャンセルしました。");
}


// イベント登録・更新時に重要設定を保存
async function addEvent() {
  if (!isAdmin) return;

  const title = $("event-title").value.trim();
  const date = $("event-date").value;
  const location = $("event-location").value.trim();
  const description = $("event-description").value.trim();

  if (!title || !date || !location || !description) {
    showMessage(
      "event-admin-message",
      "すべての項目を入力してください。",
      true
    );
    return;
  }

  const startResult = getTimeValue("event-start");

  if (startResult.error) {
    showMessage("event-admin-message", startResult.error, true);
    return;
  }

  const endResult = getTimeValue("event-end");

  if (endResult.error) {
    showMessage("event-admin-message", endResult.error, true);
    return;
  }

  const start = startResult.value;
  const end = endResult.value;

  if (start >= end) {
    showMessage(
      "event-admin-message",
      "終了時間は開始時間より後にしてください。",
      true
    );
    return;
  }

  const saveButton = $("add-event-button");
  saveButton.disabled = true;

  try {
    let imageUrl = currentEventImageUrl;
    const imageFile = $("event-image-file")?.files?.[0];

    if (imageFile) {
      imageUrl = await uploadImage(imageFile, "events");
    }

    const eventData = {
      title,
      event_date: date,
      event_time: `${start}～${end}`,
      location,
      description,
      image_url: imageUrl || null,
      is_important: $("event-is-important").checked
    };

    let error;

    if (editingEventId) {
      ({ error } = await db.from("events")
        .update(eventData)
        .eq("id", editingEventId));
    } else {
      ({ error } = await db.from("events").insert(eventData));
    }

    if (error) throw error;

    const wasEditing = !!editingEventId;

    cancelEditEvent();

    showMessage(
      "event-admin-message",
      wasEditing
        ? "イベントを更新しました！"
        : "イベントを登録しました！"
    );

    await loadEvents();

  } catch (error) {
    console.error(error);

    showMessage(
      "event-admin-message",
      "保存できませんでした：" + error.message,
      true
    );

  } finally {
    saveButton.disabled = false;
  }
}

