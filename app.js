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
let recoverySessionActive = false;

/* -----------------------------
   イベントマーク設定
----------------------------- */

const EVENT_TAGS = {
  first_time: { label: "初参加歓迎", icon: "🌱", group: "参加しやすさ" },
  observation: { label: "見学OK", icon: "👀", group: "参加しやすさ" },
  midway: { label: "途中参加OK", icon: "🕒", group: "参加しやすさ" },
  no_qualification: { label: "資格不要", icon: "👌", group: "参加しやすさ" },
  solo_welcome: { label: "ひとり参加歓迎", icon: "🙌", group: "参加しやすさ" },
  no_equipment: { label: "手ぶら参加OK", icon: "🎒", group: "参加しやすさ" },
  same_day: { label: "当日参加OK", icon: "📢", group: "参加しやすさ" },
  actively_recruiting: { label: "積極募集中", icon: "🔥", group: "募集・注目" },
  limited: { label: "人数限定", icon: "👥", group: "募集・注目" },
  few_remaining: { label: "残りわずか", icon: "⏳", group: "募集・注目" },
  new: { label: "新着イベント", icon: "✨", group: "募集・注目" },
  regular: { label: "定期開催", icon: "🔁", group: "募集・注目" },
  expertise: { label: "専門性を活かせる", icon: "🛠️", group: "活動の特徴" }
};

function getEventTags(event) {
  return Array.isArray(event.event_tags) ? event.event_tags : [];
}

function renderEventTags(event) {
  const tags = getEventTags(event);

  if (!tags.length) return "";

  return `
    <div class="event-tags">
      ${tags
        .filter(tag => EVENT_TAGS[tag])
        .map(tag => `
          <span class="event-tag-badge">
            <span class="ec-tag-icon">${EVENT_TAGS[tag].icon}</span>#${escapeHTML(EVENT_TAGS[tag].label)}
          </span>
        `).join("")}
    </div>
  `;
}

/* -----------------------------
   イベントカード用のアイコン・表示
----------------------------- */

const ICONS = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M7 2.5v3.5M17 2.5v3.5"/><rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="currentColor" d="M3 8h18v2H3z"/><rect x="6.5" y="12" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="10.5" y="12" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="14.5" y="12" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="6.5" y="16" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="10.5" y="16" width="3" height="2.6" rx=".6" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7.5" r="3.6" fill="currentColor"/><circle cx="16.8" cy="8.3" r="2.9" fill="currentColor"/><path fill="currentColor" d="M2 19.5c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3V21H2zM17.2 21v-1.5c0-2-.8-3.8-2.2-5 .6-.2 1.2-.3 1.9-.3 3 0 5.1 2.2 5.1 5V21z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-8.5-5.3-8.5-11.4A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3C20.5 15.7 12 21 12 21z"/></svg>',
  heartOutline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" d="M12 20s-8-5-8-10.6A4.5 4.5 0 0 1 12 6.9a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z"/></svg>'
};

ICONS.share = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M21.5 2.5 2.9 10.2c-.8.3-.8 1.4 0 1.7l6.9 2.4 2.4 6.9c.3.8 1.4.8 1.7 0z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9.8 14.3 21.5 2.5"/></svg>';

ICONS.clock = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 7v5l3.5 2"/></svg>';

ICONS.trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 6h17M9 6V3.8h6V6M5.8 6l1 14.2h10.4l1-14.2M10 10.5v6M14 10.5v6"/></svg>';

ICONS.pencil = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" d="M4 20l1-4.5L16.2 4.3a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19zM14 6.5l3.5 3.5"/></svg>';

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-12-19" → "2026年12月19日（土）"
function formatEventDateJa(dateText) {
  const match = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateText || "日程未定";

  const [, y, m, d] = match;
  const day = new Date(Number(y), Number(m) - 1, Number(d)).getDay();

  return `${y}年${Number(m)}月${Number(d)}日（${WEEKDAYS_JA[day]}）`;
}

// 帯に出す日付 "2026-11-19" → "11/19（木）"（今年以外は年も付ける）
function formatEventBandDate(dateText) {
  const match = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateText || "日程未定";

  const [, y, m, d] = match;
  const day = new Date(Number(y), Number(m) - 1, Number(d)).getDay();
  const yearText = Number(y) === new Date().getFullYear() ? "" : `${y}/`;

  return `${yearText}${Number(m)}/${Number(d)}（${WEEKDAYS_JA[day]}）`;
}

// 締め切りの状態を調べる（締め切り日の夜23:59まで受付）
function getDeadlineInfo(event) {
  const deadline = event.deadline;
  if (!deadline) return null;

  const today = formatDate(new Date());
  const toDate = s => new Date(s + "T00:00:00");
  const daysLeft = Math.round((toDate(deadline) - toDate(today)) / 86400000);

  return {
    text: formatEventBandDate(deadline),
    daysLeft,
    closed: daysLeft < 0
  };
}

function renderDeadline(info) {
  if (!info) return "";

  let chip = "";
  if (info.closed) chip = '<span class="ec-dl-chip closed">締め切りました</span>';
  else if (info.daysLeft === 0) chip = '<span class="ec-dl-chip soon">今日まで</span>';
  else if (info.daysLeft <= 3) chip = `<span class="ec-dl-chip soon">あと${info.daysLeft}日</span>`;

  return `<span class="ec-meta-item ec-deadline ${info.closed ? "is-closed" : ""}">
    ${ICONS.clock}<span>締切 ${escapeHTML(info.text)}まで</span>${chip}
  </span>`;
}

// "09:00～12:00" → "09:00 〜 12:00"
function formatEventTimeJa(timeText) {
  const parts = String(timeText || "")
    .split(/[～〜~]/)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.join(" 〜 ");
}

// 行頭の ①② や「1.」を丸数字のマークにして表示
function renderDescription(text) {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

  return String(text || "")
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      const first = trimmed.charAt(0);
      const circledIndex = circled.indexOf(first);
      const numbered = trimmed.match(/^(\d{1,2})[.．、)）](?!\d)\s*(.*)$/);

      let number = null;
      let body = line;

      if (circledIndex >= 0) {
        number = circledIndex + 1;
        body = trimmed.slice(1).trim();
      } else if (numbered) {
        number = Number(numbered[1]);
        body = numbered[2];
      }

      if (number !== null) {
        return `<div class="ec-step"><span class="ec-step-num">${number}</span><span>${escapeHTML(body)}</span></div>`;
      }

      return `<div class="ec-line">${trimmed ? escapeHTML(line) : "&nbsp;"}</div>`;
    })
    .join("");
}

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

/* 管理者ログインの前の「会員としてのログイン」を覚えておき、
   ログアウトした時にそれに戻す（会員コードを入れ直さなくてよいように） */
const MEMBER_SESSION_KEY = "bousai-member-session";

async function rememberMemberSession() {
  try {
    const { data } = await db.auth.getSession();
    const session = data?.session;
    if (session?.user?.is_anonymous && session.refresh_token) {
      localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }));
    }
  } catch (error) {
    console.warn("会員のログインを覚えておけませんでした:", error);
  }
}

async function backToMemberSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(MEMBER_SESSION_KEY) || "null");
  } catch (error) {
    saved = null;
  }

  if (saved?.refresh_token) {
    try {
      const { data, error } = await db.auth.setSession(saved);
      if (!error && data?.session?.user) {
        currentUser = data.session.user;
        try { localStorage.removeItem(MEMBER_SESSION_KEY); } catch (e) {}
        return currentUser;
      }
    } catch (error) {
      console.warn("会員のログインに戻れませんでした:", error);
    }
    try { localStorage.removeItem(MEMBER_SESSION_KEY); } catch (e) {}
  }

  return ensureUserSession();
}

/* -----------------------------
   カレンダー・共通スタイル
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

    .event-settings-section {
      margin:22px 0;
      padding:16px;
      border:1px solid #dce5dc;
      border-radius:12px;
      background:#f8fbf8;
    }

    .event-settings-section h3 {
      margin:0 0 8px;
      color:#234b35;
      font-size:17px;
    }

    .event-settings-section h4 {
      margin:18px 0 10px;
      color:#315d42;
      font-size:14px;
    }

    .recruitment-setting {
      display:flex;
      align-items:flex-start;
      gap:12px;
      padding:14px;
      border:1px solid #b9d0bd;
      border-radius:10px;
      background:white;
      cursor:pointer;
    }

    .recruitment-setting input {
      width:21px;
      height:21px;
      flex-shrink:0;
      accent-color:#315d42;
    }

    .recruitment-setting span {
      display:flex;
      flex-direction:column;
      gap:5px;
    }

    .recruitment-setting small {
      color:#647568;
      font-weight:normal;
      line-height:1.5;
    }

    .event-tag-grid {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:8px;
    }

    .event-tag-grid label {
      display:flex;
      align-items:center;
      gap:8px;
      min-width:0;
      padding:11px 9px;
      border:1px solid #d5e1d6;
      border-radius:9px;
      background:white;
      font-size:13px;
      cursor:pointer;
    }

    .event-tag-grid input {
      width:18px;
      height:18px;
      flex-shrink:0;
      accent-color:#315d42;
    }

    .event-tags {
      display:flex;
      flex-wrap:wrap;
      gap:7px;
      margin:12px 0;
    }

    .event-tag-badge {
      display:inline-flex;
      align-items:center;
      gap:4px;
      padding:5px 9px;
      border-radius:20px;
      background:#eaf2eb;
      border:1px solid #cbdccc;
      color:#285239;
      font-size:12px;
      font-weight:bold;
    }

    .recruitment-closed-badge {
      display:inline-block;
      padding:5px 10px;
      margin:8px 0;
      border-radius:20px;
      background:#f1f1f1;
      color:#666;
      font-size:12px;
      font-weight:bold;
    }

    /* パスワード再設定 */
    .password-recovery-link {
      display:block;
      width:100%;
      margin-top:12px;
      padding:10px;
      border:0;
      background:transparent;
      color:#315d42;
      text-decoration:underline;
      cursor:pointer;
      font-size:14px;
    }

    .recovery-overlay {
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,0,0,.55);
    }

    .recovery-dialog {
      width:100%;
      max-width:420px;
      padding:24px;
      border-radius:16px;
      background:white;
      box-shadow:0 10px 40px rgba(0,0,0,.2);
    }

    .recovery-dialog h2 {
      margin-top:0;
      color:#234b35;
    }

    .recovery-dialog input {
      display:block;
      width:100%;
      box-sizing:border-box;
      margin:10px 0;
      padding:13px;
      border:1px solid #ccc;
      border-radius:8px;
      font-size:16px;
    }

    .recovery-dialog button {
      width:100%;
      margin-top:10px;
    }

    .recovery-message {
      margin-top:12px;
      line-height:1.6;
      font-size:14px;
    }

    [hidden] {
      display:none !important;
    }

    @media(max-width:420px) {
      .event-tag-grid {
        grid-template-columns:1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

/* -----------------------------
   タブ・表示切り替え
----------------------------- */

function setAdminSection(name) {
  document.querySelectorAll(".admin-section").forEach(section => {
    section.hidden = section.id !== "admin-section-" + name;
  });

  document.querySelectorAll(".admin-switch-button").forEach(button => {
    button.classList.toggle("active", button.dataset.adminSection === name);
  });
}

function switchTab(tab) {
  document.querySelectorAll("main .page").forEach(page => {
    page.hidden = page.id !== tab + "-page";
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
          { p_event_id: event.id }
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
      { p_event_id: id }
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

  // 写真が設定されているときは、写真の上に文字を重ねる見た目にする
  const heroPanel = document.querySelector(".hero-panel");
  if (heroPanel) heroPanel.classList.add("has-photo");
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

    // 画像は切らずに全体を表示。押すと元の大きさで開く
    const imageHtml = event.image_url
      ? `<a class="ec-image-link" href="${escapeHTML(event.image_url)}" target="_blank" rel="noopener">
          <img class="event-card-image"
            src="${escapeHTML(event.image_url)}"
            alt="${escapeHTML(event.title)}の画像"
            loading="lazy">
          <span class="ec-image-hint">タップで拡大</span>
        </a>`
      : "";

    const recruitmentEnabled = event.recruitment_enabled !== false;
    const deadlineInfo = getDeadlineInfo(event);

    const memberActions = recruitmentEnabled && deadlineInfo && deadlineInfo.closed
      ? `
        <span class="recruitment-closed-badge">
          参加の受付は締め切りました
        </span>

        <button class="secondary-button"
          data-action="cancel"
          data-id="${escapeHTML(event.id)}">
          ${ICONS.trash}参加を取り消す
        </button>
      `
      : recruitmentEnabled
      ? `
        <button class="primary-button"
          data-action="join"
          data-id="${escapeHTML(event.id)}">
          ${ICONS.calendar}参加する
        </button>

        <button class="secondary-button"
          data-action="cancel"
          data-id="${escapeHTML(event.id)}">
          ${ICONS.trash}参加を取り消す
        </button>
      `
      : `
        <span class="recruitment-closed-badge">
          現在、参加募集は行っていません
        </span>
      `;

    return `
      <article class="event-card ec" id="event-${escapeHTML(event.id)}">
        <div class="ec-band">
          <span class="ec-band-icon">${ICONS.calendar}</span>
          <span class="ec-band-date">${escapeHTML(formatEventBandDate(event.event_date))}</span>
          <span class="ec-band-time">${escapeHTML(formatEventTimeJa(event.event_time))}</span>
          <button type="button" class="ec-share"
            data-action="share-event"
            data-id="${escapeHTML(event.id)}"
            aria-label="このイベントを共有">${ICONS.share}</button>
        </div>

        ${imageHtml}

        ${event.is_important
          ? `<div class="ec-important">${ICONS.star} 重要</div>`
          : ""}

        <h3 class="ec-title">${escapeHTML(event.title)}</h3>

        ${renderEventTags(event)}

        <div class="ec-meta">
          ${event.location
            ? `<a class="ec-meta-item ec-map-link"
                href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}"
                target="_blank" rel="noopener">
                ${ICONS.pin}<span>${escapeHTML(event.location)}</span><span class="ec-map-chip">地図</span>
              </a>`
            : `<span class="ec-meta-item">${ICONS.pin}未定</span>`}
          <span class="ec-meta-item">${ICONS.people}参加 ${members.length}人${event.capacity ? `／募集 ${escapeHTML(String(event.capacity))}人` : ""}</span>
          ${recruitmentEnabled ? renderDeadline(deadlineInfo) : ""}
        </div>

        <div class="ec-section">
          <span class="ec-label">内容</span>
          <div class="ec-description">${renderDescription(event.description)}</div>
        </div>

        ${members.length
          ? `<p class="ec-members">参加予定：${members.map(member =>
              escapeHTML(member.member_name)).join("、")}</p>`
          : ""}

        <div class="ec-interest">
          <span class="ec-interest-count">
            ${ICONS.heart} 気になる ${interest.count}人
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
              ? `${ICONS.heart} 気になる`
              : `${ICONS.heartOutline} 気になる`}
          </button>
        </div>

        <div class="event-actions ec-actions">
          ${memberActions}

          ${isAdmin
            ? `
              <button class="secondary-button"
                data-action="edit-event"
                data-id="${escapeHTML(event.id)}">
                ${ICONS.pencil}編集
              </button>

              <button class="secondary-button danger-button"
                data-action="delete-event"
                data-id="${escapeHTML(event.id)}">
                ${ICONS.trash}削除
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

// 会員としてログインしていれば、その名前を自動で使う（確認だけ）
// ログインしていない（管理者だけ等）ときは、これまで通り名前を入力してもらう
function askMemberName(confirmText, promptText) {
  const memberName =
    typeof currentMember !== "undefined" && currentMember?.display_name;

  if (memberName) {
    return confirm(`${memberName} さん${confirmText}`) ? memberName : "";
  }

  const typed = prompt(promptText);
  return typed ? typed.trim() : "";
}

/* 参加登録：自分で参加／代わりに登録（子どもなど携帯を持っていない人）を切り替える */
const PROXY_SUFFIX = name => `（${name}さんの代理）`;

function myMemberName() {
  return (typeof currentMember !== "undefined" && currentMember?.display_name) || "";
}

// 代わりに登録できる名前：管理者は手で入れる。ほかの人は管理者が決めた名前だけ
function proxyRule() {
  if (isAdmin) return { free: true, names: [] };
  const names = Array.isArray(currentMember?.proxy_names)
    ? currentMember.proxy_names.map(name => String(name).trim()).filter(Boolean)
    : [];
  return { free: false, names };
}

function closeJoinPanels() {
  document.querySelectorAll(".ec-join-panel").forEach(panel => panel.remove());
}

function checkCanJoin(event) {
  if (event && event.recruitment_enabled === false) {
    alert("このイベントは現在、参加募集を行っていません。");
    return false;
  }
  const deadlineInfo = event ? getDeadlineInfo(event) : null;
  if (deadlineInfo && deadlineInfo.closed) {
    alert("このイベントの参加受付は締め切りました。");
    return false;
  }
  return true;
}

function openJoinPanel(id, mode = "self") {
  const event = allEvents.find(item => String(item.id) === String(id));
  if (!checkCanJoin(event)) return;

  const card = document.getElementById(`event-${id}`);
  const actions = card?.querySelector(".ec-actions");
  if (!actions) return;

  closeJoinPanels();
  const me = myMemberName();
  const sid = escapeHTML(String(id));
  const rule = proxyRule();
  const canProxy = rule.free || rule.names.length > 0;
  if (!canProxy) mode = "self";

  const proxyHtml = rule.free
    ? `<p class="ec-join-note">18歳未満の子や、携帯を持っていない人の分を登録できます。</p>
       <label for="ec-join-name-${sid}">参加する人のお名前</label>
       <input id="ec-join-name-${sid}" type="text" lang="ja" autocomplete="off" placeholder="例：竹内 たろう">`
    : `<p class="ec-join-note">参加する人を選んでください（いくつでも）。</p>
       <div class="ec-proxy-names">
         ${rule.names.map(name => `
           <label class="ec-proxy-name"><input type="checkbox" name="ec-proxy-${sid}" value="${escapeHTML(name)}"> ${escapeHTML(name)}</label>`).join("")}
       </div>`;

  const panel = document.createElement("div");
  panel.className = "ec-join-panel";
  panel.innerHTML = `
    ${canProxy
      ? `<p class="ec-join-title">だれが参加しますか？</p>
         <div class="ec-join-switch" role="group" aria-label="参加の登録のしかた">
           <button type="button" class="${mode === "self" ? "active" : ""}" data-action="join-mode" data-mode="self" data-id="${sid}">自分が参加</button>
           <button type="button" class="${mode === "proxy" ? "active" : ""}" data-action="join-mode" data-mode="proxy" data-id="${sid}">代わりに登録</button>
         </div>`
      : `<p class="ec-join-title">参加の登録</p>`}
    ${mode === "proxy"
      ? proxyHtml
      : me
        ? `<p class="ec-join-note"><strong>${escapeHTML(me)} さん</strong>として参加登録します。</p>`
        : `<label for="ec-join-name-${sid}">参加する方のお名前</label>
           <input id="ec-join-name-${sid}" type="text" lang="ja" autocomplete="off">`}
    <div class="ec-join-buttons">
      <button type="button" class="primary-button" data-action="join-submit" data-mode="${mode}" data-id="${sid}">参加を登録</button>
      <button type="button" class="secondary-button" data-action="join-close">やめる</button>
    </div>
  `;
  actions.after(panel);
  panel.querySelector("input")?.focus();
}

async function submitJoin(id, mode) {
  const event = allEvents.find(item => String(item.id) === String(id));
  if (!checkCanJoin(event)) return;

  const me = myMemberName();
  const typed = ($(`ec-join-name-${id}`)?.value || "").trim();
  let people = [];

  if (mode === "proxy") {
    const rule = proxyRule();
    if (rule.free) {
      if (!typed) return alert("参加する人のお名前を入れてください。");
      people = [typed];
    } else {
      people = [...document.querySelectorAll(`input[name="ec-proxy-${CSS.escape(String(id))}"]:checked`)]
        .map(input => input.value)
        .filter(name => rule.names.includes(name));
      if (!people.length) return alert("参加する人を選んでください。");
    }
  } else {
    const name = me || typed;
    if (!name) return alert("お名前を入れてください。");
    people = [name];
  }

  const rows = people.map(person => ({
    event_id: id,
    member_name: mode === "proxy" && me ? `${person}${PROXY_SUFFIX(me)}` : person,
    attendance: "参加"
  }));

  const { error } = await db.from("event_responses").upsert(rows, {
    onConflict: "event_id,member_name"
  });

  if (error) {
    alert("参加登録できませんでした：" + error.message);
    return;
  }

  closeJoinPanels();
  alert(mode === "proxy" ? `${people.join("、")} さんの参加を登録しました！` : "参加登録しました！");
  await loadEvents();
}

async function joinEvent(id) {
  openJoinPanel(id, "self");
}

function openCancelPanel(id) {
  const event = allEvents.find(item => String(item.id) === String(id));
  if (event && event.recruitment_enabled === false) {
    alert("このイベントは現在、参加募集を行っていません。");
    return;
  }

  const me = myMemberName();
  if (!me) return cancelByName(id, askMemberName("", "参加登録したときのお名前を入力してください。"));

  // 自分の分と、自分が代わりに登録した分
  const suffix = PROXY_SUFFIX(me);
  const mine = getEventMembers(id)
    .map(response => response.member_name)
    .filter(name => name === me || name.endsWith(suffix));

  if (!mine.length) {
    alert("このイベントに、あなたが登録した参加はありません。");
    return;
  }

  const card = document.getElementById(`event-${id}`);
  const actions = card?.querySelector(".ec-actions");
  if (!actions) return;

  closeJoinPanels();
  const sid = escapeHTML(String(id));
  const panel = document.createElement("div");
  panel.className = "ec-join-panel";
  panel.innerHTML = `
    <p class="ec-join-title">どの参加を取り消しますか？</p>
    <div class="ec-cancel-list">
      ${mine.map(name => `
        <button type="button" class="secondary-button" data-action="cancel-name" data-id="${sid}" data-name="${escapeHTML(name)}">
          ${ICONS.trash}${escapeHTML(name === me ? `${me} さん（自分）` : `${name.slice(0, -suffix.length)} さん`)}
        </button>`).join("")}
    </div>
    <div class="ec-join-buttons">
      <button type="button" class="secondary-button" data-action="join-close">やめる</button>
    </div>
  `;
  actions.after(panel);
}

async function cancelByName(id, name) {
  if (!name) return;

  const { error } = await db.from("event_responses")
    .delete()
    .eq("event_id", id)
    .eq("member_name", name);

  if (error) {
    alert("参加を取り消せませんでした：" + error.message);
    return;
  }

  closeJoinPanels();
  alert("参加を取り消しました。");
  await loadEvents();
}

async function cancelEvent(id) {
  openCancelPanel(id);
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

/* -----------------------------
   イベント編集
----------------------------- */

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
  if ($("event-deadline")) $("event-deadline").value = event.deadline || "";

  setTimeInputs("event-start", timeParts[0] || "");
  setTimeInputs("event-end", timeParts[1] || "");

  $("event-location").value = event.location || "";
  if ($("event-capacity")) $("event-capacity").value = event.capacity ?? "";
  $("event-description").value = event.description || "";

  $("event-is-important").checked = !!event.is_important;

  $("event-recruitment-enabled").checked =
    event.recruitment_enabled !== false;

  const savedTags = getEventTags(event);

  document.querySelectorAll(".event-tag").forEach(input => {
    input.checked = savedTags.includes(input.value);
  });

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
  setAdminSection("events");

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
    "event-deadline",
    "event-start-hour",
    "event-start-minute",
    "event-end-hour",
    "event-end-minute",
    "event-location",
    "event-capacity",
    "event-description"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("event-is-important")) {
    $("event-is-important").checked = false;
  }

  if ($("event-recruitment-enabled")) {
    $("event-recruitment-enabled").checked = true;
  }

  document.querySelectorAll(".event-tag").forEach(input => {
    input.checked = false;
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

/* -----------------------------
   イベント登録・更新
----------------------------- */

async function addEvent() {
  if (!isAdmin) return;

  const title = $("event-title").value.trim();
  const date = $("event-date").value;
  const deadline = $("event-deadline") ? $("event-deadline").value : "";

  if (deadline && date && deadline > date) {
    showMessage(
      "event-admin-message",
      "締め切り日は開催日より前（または同じ日）にしてください。",
      true
    );
    return;
  }
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

  // 募集人数（なくてもよい）。全角の数字も受け付ける
  const capacityText = ($("event-capacity")?.value || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim();
  if (capacityText && !/^\d+$/.test(capacityText)) {
    showMessage("event-admin-message", "募集人数は数字だけで入れてください。", true);
    return;
  }
  const capacity = capacityText ? Number(capacityText) : null;
  if (capacity === 0) {
    showMessage("event-admin-message", "募集人数は1人以上にしてください（なければ空のままで大丈夫です）。", true);
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

    const selectedTags = [
      ...document.querySelectorAll(".event-tag:checked")
    ].map(input => input.value);

    // 通知を送るチェックボックスの状態を取得
    const sendNotification = $("event-send-notification")
      ? $("event-send-notification").checked
      : true;

    const eventData = {
      title,
      event_date: date,
      deadline: deadline || null,
      event_time: `${start}～${end}`,
      location,
      description,
      image_url: imageUrl || null,
      is_important: $("event-is-important").checked,
      recruitment_enabled: $("event-recruitment-enabled").checked,
      event_tags: selectedTags,
      capacity
    };

    let error;

    let newEventId = null;
    let notifyNote = "";

    const saveEvent = async data => {
      if (editingEventId) {
        ({ error } = await db.from("events")
          .update(data)
          .eq("id", editingEventId));
      } else {
        let inserted;
        ({ data: inserted, error } = await db.from("events")
          .insert(data)
          .select("id")
          .single());
        newEventId = inserted?.id ?? null;
      }
    };

    await saveEvent(eventData);

    // 募集人数の列がまだ Supabase にないとき：人数が空なら、その列なしで保存する
    if (error && String(error.message || "").includes("capacity")) {
      if (capacity === null) {
        const { capacity: _unused, ...withoutCapacity } = eventData;
        await saveEvent(withoutCapacity);
      } else {
        throw new Error("募集人数を保存する場所がまだありません。Supabase の SQL Editor で 008_event_capacity.sql を実行してください。");
      }
    }

    if (error) {
      if (String(error.message || "").includes("deadline")) {
        throw new Error("締め切り日を保存する場所がまだありません。Supabase で deadline の列を追加してください。");
      }
      throw error;
    }

    // 「会員に通知」にチェックがあれば、新規登録・変更のどちらでも通知を送る
    if (sendNotification) {
      notifyNote = editingEventId
        ? await notifyMembers({
            heading: "防災Sowing イベントの変更",
            message: `イベント「${title}」の内容が変わりました。`,
            url: getEventShareUrl(editingEventId)
          })
        : await notifyMembers({
            heading: "防災Sowing 新着イベント",
            message: `新しいイベント「${title}」が登録されました！`,
            url: newEventId ? getEventShareUrl(newEventId) : getAppUrl()
          });
    }

    const wasEditing = !!editingEventId;

    cancelEditEvent();

    showMessage(
      "event-admin-message",
      (wasEditing
        ? "イベントを更新しました！"
        : "イベントを登録しました！") + notifyNote,
      notifyNote.includes("送れませんでした")
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
   プッシュ通知（会員に知らせる）
   OneSignal の鍵はアプリに置かず、Supabase の
   Edge Function「send-push」が管理者を確かめてから送る
----------------------------- */

function getAppUrl() {
  return `${location.origin}${location.pathname}`;
}

// 結果を画面に出す一言を返す（失敗しても登録自体は済んでいる）
async function notifyMembers({ heading, message, url, audience = "all", projectId = null }) {
  try {
    const { data, error } = await db.functions.invoke("send-push", {
      body: { heading, message, url, audience, project_id: projectId }
    });

    if (error) {
      let detail = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) detail = body.error;
      } catch (_) { /* 本文が読めないときはそのまま */ }
      throw new Error(detail);
    }

    if (data && data.sent === false && data.reason === "no_leads") {
      return "（ほかに担当者がいないため、通知は送りませんでした）";
    }

    if (data && data.sent === false) {
      return "（通知を受け取る設定の会員がまだいないため、通知は送られませんでした）";
    }

    return "（会員に通知を送りました）";

  } catch (notifyError) {
    console.error("プッシュ通知の送信に失敗しました:", notifyError);
    return "　※ただし通知は送れませんでした：" + notifyError.message;
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

  root.innerHTML = data.map(item => {
    const created = item.created_at ? new Date(item.created_at) : null;

    const dateText = created
      ? `${created.getFullYear()}年${created.getMonth() + 1}月${created.getDate()}日（${WEEKDAYS_JA[created.getDay()]}）`
      : "";

    const timeText = created
      ? `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`
      : "";

    // 7日以内のお知らせに NEW を付ける
    const isNew = created && (Date.now() - created.getTime()) < 7 * 24 * 60 * 60 * 1000;

    return `<article class="announcement-card">
      <div class="an-head">
        <span class="an-date">${ICONS.calendar}${escapeHTML(dateText)}<small>${escapeHTML(timeText)}</small></span>
        ${isNew ? '<span class="an-new">NEW</span>' : ""}
      </div>
      <h3 class="an-title">${escapeHTML(item.title)}</h3>
      <div class="announcement-content">${escapeHTML(String(item.content || "").trim())}</div>
      ${isAdmin
        ? `<button class="secondary-button an-delete"
            data-action="delete-announcement"
            data-id="${escapeHTML(item.id)}">削除</button>`
        : ""}
    </article>`;
  }).join("");
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

  const sendNotification = $("announcement-send-notification")
    ? $("announcement-send-notification").checked
    : false;

  const button = $("add-announcement-button");
  button.disabled = true;

  try {
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

    let notifyNote = "";

    if (sendNotification) {
      notifyNote = await notifyMembers({
        heading: "防災Sowing お知らせ",
        message: title,
        url: getAppUrl()
      });
    }

    $("announcement-title").value = "";
    $("announcement-content").value = "";

    showMessage(
      "announcement-admin-message",
      "お知らせを投稿しました！" + notifyNote,
      notifyNote.includes("送れませんでした")
    );
  } finally {
    button.disabled = false;
  }

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
   管理者パスワード再設定
----------------------------- */

function setupPasswordRecovery() {
  const authPanel = document.querySelector(".auth-panel");

  if (!authPanel) {
    console.error("ログイン画面が見つかりません。");
    return;
  }

  if (!$("forgot-password-button")) {
    const forgotButton = document.createElement("button");

    forgotButton.id = "forgot-password-button";
    forgotButton.type = "button";
    forgotButton.className = "password-recovery-link";
    forgotButton.textContent = "パスワードを忘れた方";

    const loginButton = $("login-button");

    if (loginButton) {
      loginButton.insertAdjacentElement("afterend", forgotButton);
    } else {
      authPanel.appendChild(forgotButton);
    }

    forgotButton.addEventListener("click", sendPasswordResetEmail);
  }

  if (!$("password-recovery-overlay")) {
    const overlay = document.createElement("div");

    overlay.id = "password-recovery-overlay";
    overlay.className = "recovery-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <div class="recovery-dialog">
        <h2 id="recovery-title">新しいパスワードの設定</h2>

        <p>
          新しいパスワードを入力してください。
        </p>

        <input
          id="recovery-password"
          type="password"
          autocomplete="new-password"
          placeholder="新しいパスワード（8文字以上）"
        >

        <input
          id="recovery-password-confirm"
          type="password"
          autocomplete="new-password"
          placeholder="新しいパスワード（確認）"
        >

        <button
          id="recovery-save-button"
          type="button"
          class="primary-button"
        >
          パスワードを変更する
        </button>

        <button
          id="recovery-close-button"
          type="button"
          class="secondary-button"
        >
          閉じる
        </button>

        <p
          id="recovery-message"
          class="recovery-message"
          aria-live="polite"
        ></p>
      </div>
    `;

    document.body.appendChild(overlay);

    $("recovery-save-button").addEventListener(
      "click",
      updateRecoveredPassword
    );

    $("recovery-close-button").addEventListener(
      "click",
      closePasswordRecovery
    );
  }

  // メールリンクから戻ったときの認証イベントを監視
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoverySessionActive = true;
      currentUser = session?.user || null;
      openPasswordRecovery();
    }
  });
}

async function sendPasswordResetEmail() {
  const email = $("login-email")?.value.trim();

  if (!email) {
    showMessage(
      "auth-message",
      "メールアドレスを入力してから押してください。",
      true
    );

    $("login-email")?.focus();
    return;
  }

  const button = $("forgot-password-button");
  button.disabled = true;

  showMessage(
    "auth-message",
    "再設定メールを送信しています…"
  );

  try {
    const redirectTo =
      window.location.origin + window.location.pathname;

    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) throw error;

    showMessage(
      "auth-message",
      "再設定メールを送信しました。メールをご確認ください。"
    );

  } catch (error) {
    console.error("再設定メール送信エラー:", error);

    showMessage(
      "auth-message",
      "メールを送信できませんでした。メールアドレスや設定を確認してください。",
      true
    );

  } finally {
    button.disabled = false;
  }
}

function openPasswordRecovery() {
  const overlay = $("password-recovery-overlay");

  if (!overlay) return;

  overlay.hidden = false;

  $("recovery-password").value = "";
  $("recovery-password-confirm").value = "";
  $("recovery-message").textContent = "";

  $("recovery-title").textContent =
    "新しいパスワードの設定";

  $("recovery-save-button").hidden = false;
  $("recovery-close-button").hidden = false;
}

function closePasswordRecovery() {
  const overlay = $("password-recovery-overlay");

  if (overlay) {
    overlay.hidden = true;
  }
}

async function updateRecoveredPassword() {
  const password = $("recovery-password").value;
  const confirmPassword = $("recovery-password-confirm").value;
  const button = $("recovery-save-button");
  const message = $("recovery-message");

  if (!recoverySessionActive) {
    message.textContent =
      "再設定用の認証情報が確認できません。メールのリンクから再度アクセスしてください。";

    message.style.color = "#b42318";
    return;
  }

  if (!password || !confirmPassword) {
    message.textContent =
      "新しいパスワードを2か所に入力してください。";

    message.style.color = "#b42318";
    return;
  }

  if (password.length < 8) {
    message.textContent =
      "パスワードは8文字以上で設定してください。";

    message.style.color = "#b42318";
    return;
  }

  if (password !== confirmPassword) {
    message.textContent =
      "2つのパスワードが一致していません。";

    message.style.color = "#b42318";
    return;
  }

  button.disabled = true;
  message.textContent = "パスワードを変更しています…";
  message.style.color = "#315d42";

  try {
    const { error } = await db.auth.updateUser({
      password
    });

    if (error) throw error;

    message.textContent =
      "パスワードを変更しました！ログイン画面に戻ります。";

    message.style.color = "#315d42";

    $("recovery-password").value = "";
    $("recovery-password-confirm").value = "";

    $("recovery-title").textContent =
      "パスワード変更完了";

    button.hidden = true;
    recoverySessionActive = false;

    setTimeout(async () => {
      closePasswordRecovery();

      try {
        await db.auth.signOut({ scope: "local" });
        currentUser = null;
        isAdmin = false;

        await backToMemberSession();
        await checkAdmin();

      } catch (error) {
        console.error("ログイン状態の切り替えエラー:", error);
      }

      showMessage(
        "auth-message",
        "新しいパスワードで管理者ログインしてください。"
      );

    }, 1800);

  } catch (error) {
    console.error("パスワード変更エラー:", error);

    message.textContent =
      "パスワードを変更できませんでした。メールのリンクが期限切れでないか確認してください。";

    message.style.color = "#b42318";

  } finally {
    button.disabled = false;
  }
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
    await rememberMemberSession();

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    await checkAdmin();

    if (!isAdmin) {
      await db.auth.signOut({ scope: "local" });

      currentUser = null;

      await backToMemberSession();
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

    await refreshMembership();
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
  await db.auth.signOut({ scope: "local" });

  currentUser = null;
  isAdmin = false;

  try {
    await backToMemberSession();
  } catch (error) {
    console.error("匿名ログインに失敗しました:", error);
  }

  if (editingEventId) {
    cancelEditEvent();
  }

  await checkAdmin();

  showMessage("auth-message", "ログアウトしました。");

  await refreshMembership();
  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
}

/* -----------------------------
   初期化・ボタン設定
----------------------------- */

/* -----------------------------
   イベントの共有（LINEなど）
----------------------------- */

function getEventShareUrl(id) {
  return `${location.origin}${location.pathname}#event-${id}`;
}

async function shareEvent(id) {
  const event = allEvents.find(item => String(item.id) === String(id));
  if (!event) return;

  const lines = [
    `【防災Sowing】${event.title}`,
    `📅 ${formatEventBandDate(event.event_date)} ${formatEventTimeJa(event.event_time)}`.trim()
  ];

  if (event.location) lines.push(`📍 ${event.location}`);

  lines.push("詳しくはこちら👇", getEventShareUrl(id));

  const text = lines.join("\n");

  // スマホの共有画面（LINE・メッセージなど）を使う
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return; // 自分で閉じたとき
    }
  }

  // 共有画面が使えないときは LINE の送る画面を開く
  window.open(
    "https://line.me/R/share?text=" + encodeURIComponent(text),
    "_blank",
    "noopener"
  );
}

// 共有リンク（#event-○○）から開いたとき、そのイベントまで移動する
function openSharedEvent() {
  const match = location.hash.match(/^#event-(.+)$/);
  if (!match) return;

  const card = document.getElementById("event-" + decodeURIComponent(match[1]));
  if (!card) return;

  runAfterSplash(() => {
    const top = card.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    card.classList.add("ec-highlight");
    setTimeout(() => card.classList.remove("ec-highlight"), 2600);
  });
}

const splashStartedAt = Date.now();
let splashClosed = false;
let splashVideoWorks = true;
const afterSplashTasks = [];

// 起動画面を閉じる（動画が終わった／タップした／動画が使えないとき）
function closeSplash() {
  if (splashClosed) return;
  splashClosed = true;

  const splash = $("splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 700);
  }

  afterSplashTasks.splice(0).forEach(task => setTimeout(task, 400));
}

// 起動画面が閉じてから実行する
function runAfterSplash(task) {
  if (splashClosed || !$("splash")) task();
  else afterSplashTasks.push(task);
}

function setupSplash() {
  const splash = $("splash");
  if (!splash) {
    splashClosed = true;
    return;
  }

  // 画面のどこをタップしても次へ
  splash.addEventListener("click", closeSplash);

  const video = splash.querySelector("video");

  const videoFailed = () => {
    if (!splashVideoWorks) return;
    splashVideoWorks = false;
    // 動画が動かないときは、ロゴの静止画を2.5秒見せて閉じる
    const wait = Math.max(0, 2500 - (Date.now() - splashStartedAt));
    setTimeout(closeSplash, wait);
  };

  if (!video) {
    videoFailed();
    return;
  }

  // 動画を最後まで見たら次へ
  video.addEventListener("ended", closeSplash);
  video.addEventListener("error", videoFailed);

  const playing = video.play();
  if (playing && playing.catch) playing.catch(videoFailed);

  // 省電力モードなどで再生が始まらないとき
  setTimeout(() => {
    if (video.paused || video.currentTime === 0) videoFailed();
  }, 2000);
}

// 読み込みが終わったときに呼ぶ（動画があるときは動画の終わりかタップで閉じる）
function hideSplash() {
  if (!splashVideoWorks) {
    const wait = Math.max(0, 2500 - (Date.now() - splashStartedAt));
    setTimeout(closeSplash, wait);
  }
}

// 文字入力中は body に印を付ける（キーボードと重なる固定メニューを隠す）
function setupTypingMode() {
  const isTextField = el =>
    el && (el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && !["checkbox", "radio", "file", "button", "submit"].includes(el.type)));

  document.addEventListener("focusin", e => {
    if (isTextField(e.target)) document.body.classList.add("is-typing");
  });

  document.addEventListener("focusout", e => {
    if (!isTextField(e.target)) return;
    setTimeout(() => {
      if (!isTextField(document.activeElement)) {
        document.body.classList.remove("is-typing");
      }
    }, 100);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupSplash();
  addCalendarStyles();
  setupTypingMode();

  // パスワード再設定機能を初期化
  setupPasswordRecovery();

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

    if (button.dataset.adminSection) {
      setAdminSection(button.dataset.adminSection);
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

    if (action === "join-mode") {
      openJoinPanel(id, button.dataset.mode);
      return;
    }

    if (action === "join-submit") {
      submitJoin(id, button.dataset.mode);
      return;
    }

    if (action === "cancel-name") {
      cancelByName(id, button.dataset.name);
      return;
    }

    if (action === "join-close") {
      closeJoinPanels();
      return;
    }

    if (action === "share-event") {
      shareEvent(id);
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

      // 切り替えたページの先頭が見えるようにする
      const page = $(button.dataset.tab + "-page");
      if (page) {
        const top = page.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    });
  });

  // 匿名ログインまたは既存セッションの取得

  try {
    await ensureUserSession();
  } catch (error) {
    console.error("ログインセッションを準備できませんでした:", error);
  }

  await checkAdmin();

  // 会員かどうか確かめる（会員でなければ会員コードの画面を出す）
  await refreshMembership();

  await loadHeroImage();
  await loadEvents();
  await loadAnnouncements();

  switchTab("events");
  setEventView("list");

  hideSplash();
  openSharedEvent();
});

/* 時間の数字を打ち終わったら、次の欄へ自動で進む
   （時：2けた、または 3〜9 の1けた／分：2けた、または 6〜9 の1けた） */
document.addEventListener("input", event => {
  const box = event.target;
  if (!(box instanceof HTMLInputElement) || !box.classList.contains("time-box")) return;
  if (event.inputType && !event.inputType.startsWith("insert")) return;

  const digits = String(box.value || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, "");
  const max = Number(box.dataset.max || 59);
  const full = digits.length >= 2 || (digits.length === 1 && Number(digits) * 10 > max);
  if (!full) return;

  const fields = [...document.querySelectorAll("input, textarea, select")]
    .filter(el => !el.disabled && el.type !== "hidden" && el.offsetParent !== null);
  const next = fields[fields.indexOf(box) + 1];
  if (next) {
    next.focus();
    if (typeof next.select === "function" && next.classList.contains("time-box")) next.select();
  }
});

/* -----------------------------
   バックアップ（管理者だけ）
   すべての表を1つのファイル（JSON）にまとめてダウンロードする
----------------------------- */
const BACKUP_TABLES = [
  "members",
  "member_codes",
  "member_devices",
  "events",
  "event_responses",
  "announcements",
  "projects",
  "project_leads",
  "project_stages",
  "project_reports",
  "site_settings"
];

async function fetchAllRows(table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function showLastBackupDate() {
  const message = document.getElementById("backup-message");
  if (!message || message.textContent) return;
  try {
    const last = localStorage.getItem("bousai-last-backup");
    if (last) message.textContent = "この端末で前回保存した日：" + last;
  } catch (_) { /* 保存できない端末では何もしない */ }
}

async function downloadBackup() {
  const button = document.getElementById("backup-download-button");
  const message = document.getElementById("backup-message");
  if (!isAdmin) {
    message.textContent = "管理者ログインしてから押してください。";
    return;
  }

  button.disabled = true;
  message.textContent = "データを集めています…";

  const backup = {
    app: "防災Sowing 会員専用アプリ",
    created_at: new Date().toISOString(),
    tables: {},
    counts: {},
    errors: {}
  };

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(table);
      backup.tables[table] = rows;
      backup.counts[table] = rows.length;
    } catch (error) {
      backup.errors[table] = error.message || String(error);
    }
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `bousai-sowing-backup_${stamp}.json`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  const labels = {
    members: "会員", member_codes: "会員コード", member_devices: "端末",
    events: "イベント", event_responses: "参加", announcements: "お知らせ",
    projects: "事業", project_leads: "事業の担当者", project_stages: "進捗",
    project_reports: "活動の報告", site_settings: "設定"
  };
  const summary = Object.entries(backup.counts)
    .map(([table, count]) => `${labels[table] || table} ${count}件`).join("、");
  const failed = Object.keys(backup.errors).map(table => labels[table] || table);

  message.textContent =
    `「${fileName}」を保存しました（${summary}）。` +
    (failed.length ? ` ※ 読み込めなかったもの：${failed.join("、")}` : "");

  try {
    localStorage.setItem("bousai-last-backup", `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`);
  } catch (_) { /* 保存できない端末では何もしない */ }

  button.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("backup-download-button");
  if (button) button.addEventListener("click", downloadBackup);
  showLastBackupDate();
});
