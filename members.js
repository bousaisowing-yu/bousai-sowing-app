/* =============================================================
   防災Sowing 会員アプリ：会員ログインと正会員ページ
   - 全会員：管理者が配る「会員コード」で1回ログイン（端末ごと）
   - ログインした端末を OneSignal で会員と結びつける
   - 正会員ページ「事業の進み具合」（正会員として登録された人だけ）
   - 管理画面「会員」（協働会員／正会員の登録・コード・会員一覧）
   app.js の db / $ / currentUser / isAdmin / escapeHTML などを使います。
============================================================= */

let currentMember = null;
let membershipReady = false; // Supabase 側の準備（SQL）が済んでいるか

let allProjects = [];
let projectStages = [];
let projectReports = [];
let projectLeads = [];
let allMembersForAdmin = [];
let memberCodesForAdmin = {};
const openProjectIds = new Set();

const PROJECT_STATUSES = ["準備中", "進行中", "ひと休み中", "完了"];
const PROJECT_STATUS_CLASS = {
  "準備中": "pj-status-prep",
  "進行中": "pj-status-active",
  "ひと休み中": "pj-status-pause",
  "完了": "pj-status-done"
};

/* 事業ごとのマーク（名前の言葉で選ぶ） */
const PJ_ICONS = {
  briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6a2 2 0 0 1 2 2v1.5h2.5A2.5 2.5 0 0 1 22 9v3.2h-8.2v-1h-3.6v1H2V9a2.5 2.5 0 0 1 2.5-2.5H7V5a2 2 0 0 1 2-2zm0 2v1.5h6V5zM2 13.8h8.2v1.4h3.6v-1.4H22V18.5A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5z"/></svg>',
  helmet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3.5h2a1 1 0 0 1 1 1v.7A7.5 7.5 0 0 1 19.5 12v1.5H21a1 1 0 0 1 1 1V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1.5a1 1 0 0 1 1-1h1.5V12A7.5 7.5 0 0 1 10 5.2v-.7a1 1 0 0 1 1-1zM6.5 19.5h11l-1 1.5h-9z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5zm-1.3 6h2.6v3h3v2.6h-3v3h-2.6v-3h-3V11h3z"/></svg>',
  hands: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1 9.5 5 6l3.2 1.2L11 6l1.5.6L8.4 10a1.4 1.4 0 0 0 1.9 2l3.4-2.7 6.3 5.4-1 1.1a1.2 1.2 0 0 1-1.7.1l-.4-.3.2.3a1.2 1.2 0 0 1-1.7 1.6l-.6-.5.3.4a1.2 1.2 0 0 1-1.8 1.4l-.7-.6a1.2 1.2 0 0 1-1.8 1.3L4.5 14.6zM13 5.5l2.4-.9 3.6 1.4 4 3.5-2.6 4.4-6.6-5.6-2.7 2.1a.5.5 0 0 1-.6-.7z"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6.5" r="3.3" fill="currentColor"/><circle cx="5" cy="8.5" r="2.5" fill="currentColor"/><circle cx="19" cy="8.5" r="2.5" fill="currentColor"/><path fill="currentColor" d="M6 20v-2.5c0-3.3 2.7-6 6-6s6 2.7 6 6V20zM0.5 19v-1.6c0-2.3 1.8-4.2 4.2-4.2.6 0 1.1.1 1.6.3A7.4 7.4 0 0 0 4.6 18v1zM23.5 19v-1.6c0-2.3-1.8-4.2-4.2-4.2-.6 0-1.1.1-1.6.3a7.4 7.4 0 0 1 1.7 4.5v1z"/></svg>',
  sprout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 21v-7.2C6.4 13.8 3 10.9 3 6V5h1c4 0 6.7 2.1 7.6 5.3C12.6 6.6 15.5 4 20 4h1v1c0 5-3.4 8-8 8.2V21z"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4" fill="currentColor"/><path fill="currentColor" d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2zm3 5v2h10V8zm0 4v2h7v-2z" transform="translate(-2 0)"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M7 2.5v3.5M17 2.5v3.5"/><rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="currentColor" d="M3 8h18v2H3z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" d="M4 20l1-4.5L16.2 4.3a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19zM14 6.5l3.5 3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 6h17M9 6V3.8h6V6M5.8 6l1 14.2h10.4l1-14.2M10 10.5v6M14 10.5v6"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v4h8V5zm5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path stroke="white" stroke-width="2.4" stroke-linecap="round" d="M12 7.5v9M7.5 12h9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 7v5l3.5 2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>'
};

function projectIconFor(name) {
  const text = String(name || "");
  if (/備え|備蓄|提供/.test(text)) return PJ_ICONS.briefcase;
  if (/解体|トレ|訓練/.test(text)) return PJ_ICONS.helmet;
  if (/教育|学習|講習/.test(text)) return PJ_ICONS.shield;
  if (/ボランティア|サポート|支援/.test(text)) return PJ_ICONS.hands;
  if (/自治会|地域|町内/.test(text)) return PJ_ICONS.people;
  return PJ_ICONS.sprout;
}

/* 進捗の1行：「12月13日（日） 14:00 ＠寝屋川市役所 打ち合わせ」の形で保存する */
function buildProgressTitle({ date, time, place, text }) {
  const head = [
    date ? formatShortDateJa(date) : "",
    time || "",
    place ? `＠${place}` : ""
  ].filter(Boolean).join(" ");
  return text ? `${head ? head + " " : ""}${text}` : "";
}

function parseProgressTitle(title) {
  let rest = String(title || "").trim();
  let date = "";
  let time = "";
  let place = "";

  const dateMatch = rest.match(/^(\d{1,2})月(\d{1,2})日(?:（.）)?\s*/);
  if (dateMatch) {
    const now = new Date();
    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);
    // 年は書いていないので、今日から見て近いほうの年にする
    let year = now.getFullYear();
    if (month - (now.getMonth() + 1) > 6) year -= 1;
    if ((now.getMonth() + 1) - month > 6) year += 1;
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    rest = rest.slice(dateMatch[0].length);
  }

  // 時間は手打ち（「14:00」「14:00〜16:00」「14時〜」など）
  const timeMatch = rest.match(/^((?:午前|午後)?\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分|半)?)(?:\s*[〜~～\-ー]\s*(?:(?:午前|午後)?\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分|半)?))?)?)\s*/);
  if (timeMatch) {
    time = timeMatch[1];
    rest = rest.slice(timeMatch[0].length);
  }

  const placeMatch = rest.match(/^＠(\S+)\s*/);
  if (placeMatch) {
    place = placeMatch[1];
    rest = rest.slice(placeMatch[0].length);
  }

  return { date, time, place, text: rest };
}

/* 時間は数字だけ入れる：［14］時［00］分 〜 ［16］時［30］分 */
function splitProgressTime(time) {
  const one = String.raw`(午前|午後)?(\d{1,2})(?:[:：](\d{1,2})|時(?:(\d{1,2})分|(半))?)`;
  const m = String(time || "").match(new RegExp(`^${one}(?:\\s*[〜~～\\-ー]\\s*(?:${one})?)?`));
  if (!m) return { sh: "", sm: "", eh: "", em: "" };
  const hour = (ampm, h) => (h === undefined ? "" : String(Number(h) + (ampm === "午後" && Number(h) < 12 ? 12 : 0)));
  const minute = (a, b, half, h) => (h === undefined ? "" : String(a ?? b ?? (half ? "30" : "00")).padStart(2, "0"));
  return {
    sh: hour(m[1], m[2]), sm: minute(m[3], m[4], m[5], m[2]),
    eh: hour(m[6], m[7]), em: minute(m[8], m[9], m[10], m[7])
  };
}

function progressTimeFieldsHtml(idOf, time) {
  const parts = splitProgressTime(time);
  const box = (key, label, max) =>
    `<input id="${idOf(key)}" class="time-box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="${escapeHTML(parts[key])}" aria-label="${label}" data-max="${max}">`;
  return `
    <div class="pj-time" role="group" aria-label="時間（なくてもよい）">
      <span class="pj-time-part">${box("sh", "始まりの時", 23)}時${box("sm", "始まりの分", 59)}分<span class="pj-time-sep">〜</span></span>
      <span class="pj-time-part">${box("eh", "終わりの時", 23)}時${box("em", "終わりの分", 59)}分</span>
    </div>
  `;
}

/* 入れた数字を「14時00分〜16時30分」にする。おかしいときは null */
function readProgressTime(valueOf) {
  const num = key => String(valueOf(key) || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, "");
  const sh = num("sh"), sm = num("sm"), eh = num("eh"), em = num("em");
  const one = (h, m) => {
    if (!h) return m ? null : "";
    if (Number(h) > 23 || (m && Number(m) > 59)) return null;
    return `${Number(h)}時${String(Number(m || 0)).padStart(2, "0")}分`;
  };
  const start = one(sh, sm);
  const end = one(eh, em);
  if (start === null || end === null) return null;
  if (!start) return end ? null : "";
  return end ? `${start}〜${end}` : start;
}

let editingStageId = null;
let editingAboutId = null;
let editingPart = null; // 表紙で鉛筆を押して書いているところ（"事業id:progress" など）

function isEditingPart(id, part) {
  return editingPart === `${id}:${part}`;
} // 事業名の下の「説明」を鉛筆で書き直している事業

/* 事業ごとの背景の色（保存されていなければ、並び順で自動に色を付ける） */
const PJ_COLORS = [
  { key: "green",  label: "みどり",   bg: "#e4f3e0", border: "#b9dbb3", accent: "#155b38", soft: "#dcefd8" },
  { key: "blue",   label: "あお",     bg: "#e0eefa", border: "#b3d3ea", accent: "#1d5f8f", soft: "#d6e9f6" },
  { key: "orange", label: "オレンジ", bg: "#fde8d4", border: "#f0c9a2", accent: "#a5531a", soft: "#fadfc6" },
  { key: "pink",   label: "ピンク",   bg: "#fbe1ea", border: "#efbccd", accent: "#a33a62", soft: "#f8d6e2" },
  { key: "purple", label: "むらさき", bg: "#ece5f8", border: "#cdbfe8", accent: "#5d4495", soft: "#e2d9f4" },
  { key: "yellow", label: "きいろ",   bg: "#fbf2c6", border: "#ebd98f", accent: "#7d6410", soft: "#f6ecbb" }
];

function projectColorFor(project) {
  const saved = PJ_COLORS.find(color => color.key === project?.color);
  if (saved) return saved;
  const index = Math.max(0, allProjects.findIndex(item => String(item.id) === String(project?.id)));
  return PJ_COLORS[index % PJ_COLORS.length];
}

function pjField(icon, inputHtml) {
  return `<div class="pj-field"><span class="pj-field-icon">${icon}</span>${inputHtml}</div>`;
}

function pjBoxHead(icon, title, note) {
  return `<div class="pj-box-head"><span class="pj-box-icon">${icon}</span><div><h4>${title}</h4>${note ? `<p>${note}</p>` : ""}</div></div>`;
}

function isFullMemberNow() {
  return isAdmin || currentMember?.member_type === "正会員";
}

/* -----------------------------
   会員かどうか
----------------------------- */

async function fetchMyMember() {
  currentMember = null;

  if (!currentUser) {
    membershipReady = true;
    return;
  }

  const { data, error } = await db.rpc("get_my_member");

  if (error) {
    // members 表がまだ無い（SQL 未実行）ときは、今まで通り誰でも使える状態にしておく
    console.warn("会員情報を確認できませんでした（準備前の可能性）:", error.message);
    membershipReady = false;
    return;
  }

  membershipReady = true;
  currentMember = data || null;
}

async function refreshMembership() {
  if (previewState) endPreview({ reload: false });
  await fetchMyMember();

  if (!membershipReady || currentMember || isAdmin) {
    hideGate();
  } else {
    showGate();
  }

  applyMemberUI();

  if (currentMember || isAdmin) {
    linkOneSignal();
  }
}

function applyMemberUI() {
  const full = membershipReady && isFullMemberNow();

  // 正会員タブは会員みんなに見せる。協働会員にはカギをかけて、中身は読み込まない
  const showTab = membershipReady && (full || !!currentMember);
  const locked = showTab && !full;
  if ($("projects-tab")) $("projects-tab").hidden = !showTab;
  if ($("projects-tab-lock")) $("projects-tab-lock").hidden = !locked;
  if ($("projects-locked")) $("projects-locked").hidden = !locked;
  if ($("projects-band")) $("projects-band").hidden = locked;
  if ($("projects-panel")) $("projects-panel").hidden = locked;
  if ($("projects-area")) $("projects-area").hidden = !full;
  if (!full && $("projects-list")) $("projects-list").innerHTML = "";

  if (!showTab && $("projects-page") && !$("projects-page").hidden) {
    switchTab("events");
  }

  const greeting = $("member-greeting");

  if (greeting) {
    if (currentMember) {
      greeting.textContent = `${currentMember.display_name} さん（${currentMember.member_type === "正会員" ? "正会員" : "協働会員"}）`;
      greeting.hidden = false;
    } else {
      greeting.hidden = true;
    }
  }

  // 会員でなくなったら（ログアウトなど）通知ボタンも隠す
  if (!currentMember && $("push-enable-box")) $("push-enable-box").hidden = true;

  if ($("add-project-button")) $("add-project-button").hidden = !isAdmin;

  if (full) loadProjects();
  if (isAdmin && membershipReady) loadMembersAdmin();
}

/* -----------------------------
   入口（会員コード）
----------------------------- */

function showGate() {
  const gate = $("member-gate");
  if (!gate) return;
  gate.hidden = false;
  document.body.classList.add("gate-open");
}

function hideGate() {
  const gate = $("member-gate");
  if (!gate) return;
  gate.hidden = true;
  document.body.classList.remove("gate-open");
}

async function joinAsMember() {
  const code = $("gate-code").value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

  if (!code) {
    showMessage("gate-message", "会員コードを入力してください。", true);
    return;
  }

  const button = $("gate-join-button");
  button.disabled = true;

  try {
    await ensureUserSession();

    const { data, error } = await db.rpc("login_with_code", { p_code: code });

    if (error) throw error;

    if (!data?.ok) {
      showMessage("gate-message", data?.message || "会員コードが違います。", true);
      return;
    }

    currentMember = data.member;
    $("gate-code").value = "";
    showMessage("gate-message", "");

    hideGate();
    applyMemberUI();
    linkOneSignal();

    await loadEvents();
    await loadAnnouncements();

  } catch (error) {
    console.error(error);
    showMessage("gate-message", "はじめられませんでした：" + error.message, true);

  } finally {
    button.disabled = false;
  }
}

/* -----------------------------
   通知：この端末を会員と結びつける
----------------------------- */

function linkOneSignal() {
  if (!currentUser || !window.OneSignalDeferred) return;

  const memberType = isFullMemberNow() ? "full" : "regular";
  // 同じ会員の複数の端末が1人としてまとまるよう、会員の番号で結びつける
  const externalId = currentMember?.id || currentUser.id;

  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.login(externalId);
      await OneSignal.User.addTags({ member: "1", member_type: memberType });

      // 通知のお願いは OneSignal の英語の案内を使わず、
      // 画面の「通知を受け取る」ボタン（日本語）で出す

      // 管理画面で「入室済み・通知ON/OFF」が分かるように記録する
      const report = () => {
        reportMyDevice(!!OneSignal.User?.PushSubscription?.optedIn);
        updatePushButton(OneSignal);
      };
      report();
      OneSignal.User?.PushSubscription?.addEventListener?.("change", report);
      OneSignal.Notifications?.addEventListener?.("permissionChange", report);
      setupPushButton(OneSignal);
    } catch (error) {
      console.error("通知の設定ができませんでした:", error);
    }
  });
}

/* 「あとで」を押した人が、あとから自分で通知をONにできるボタン */
function updatePushButton(OneSignal) {
  const box = $("push-enable-box");
  if (!box) return;
  const on = !!OneSignal.Notifications?.permission &&
    !!OneSignal.User?.PushSubscription?.optedIn;
  box.hidden = on || !currentMember;
}

let pushButtonReady = false;
function setupPushButton(OneSignal) {
  const button = $("push-enable-btn");
  const help = $("push-enable-help");
  if (!button || pushButtonReady) return;
  pushButtonReady = true;

  button.addEventListener("click", async () => {
    if (help) help.hidden = true;

    // 携帯の確認で「許可しない」を選んだ場合は、アプリからはもう聞けない
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      if (help) {
        help.textContent = isIOSDevice()
          ? "通知が止められています。iPhoneの「設定」→「通知」→「防災Sowing」を開き、「通知を許可」をONにしてください。"
          : "通知が止められています。ブラウザやスマホの設定で、このアプリの通知を「許可」にしてください。";
        help.hidden = false;
      }
      return;
    }

    if (typeof Notification === "undefined" && isIOSDevice()) {
      if (help) {
        help.textContent = "iPhoneでは、ホーム画面に追加した「防災Sowing」のアイコンから開くと、通知をONにできます。";
        help.hidden = false;
      }
      return;
    }

    button.disabled = true;
    try {
      if (!OneSignal.Notifications.permission) {
        await OneSignal.Notifications.requestPermission();
      }
      if (OneSignal.Notifications.permission && !OneSignal.User.PushSubscription.optedIn) {
        await OneSignal.User.PushSubscription.optIn();
      }
    } catch (error) {
      console.error("通知をONにできませんでした:", error);
    } finally {
      button.disabled = false;
      updatePushButton(OneSignal);
      reportMyDevice(!!OneSignal.User?.PushSubscription?.optedIn);
    }
  });
}

function isIOSDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function reportMyDevice(pushEnabled) {
  if (!currentMember) return; // 管理者だけのログインでは記録しない
  const { error } = await db.rpc("report_my_device", { p_push_enabled: pushEnabled });
  if (error) console.warn("端末の状態を記録できませんでした:", error.message);
}

/* -----------------------------
   正会員ページ：事業の進み具合
----------------------------- */

function canEditProject(projectId) {
  if (isAdmin) return true;
  if (!currentMember) return false;
  return projectLeads.some(lead =>
    String(lead.project_id) === String(projectId) &&
    lead.member_id === currentMember.id
  );
}

async function loadProjects() {
  const root = $("projects-list");
  if (!root) return;

  if (!isFullMemberNow()) {
    root.innerHTML = "";
    return;
  }

  if (!allProjects.length) {
    root.innerHTML = '<p class="muted">読み込み中…</p>';
  }

  const [projects, stages, reports, leads] = await Promise.all([
    db.from("projects").select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    db.from("project_stages").select("*").order("sort_order", { ascending: true }),
    db.from("project_reports").select("*").order("created_at", { ascending: false }),
    db.from("project_leads").select("project_id,member_id")
  ]);

  const error = projects.error || stages.error || reports.error || leads.error;

  if (error) {
    console.error(error);
    root.innerHTML = '<p class="muted">事業の情報を読み込めませんでした。</p>';
    return;
  }

  allProjects = projects.data || [];
  projectStages = stages.data || [];
  projectReports = reports.data || [];
  projectLeads = leads.data || [];

  renderProjects();
  syncLeadNames();
}

// 管理者が開いたとき、「担当」の表示名を、選ばれている正会員の名前にそろえる
// （前の版で名前が空のまま保存された事業も、これで直る）
let leadNameSyncBusy = false;
async function syncLeadNames() {
  if (!isAdmin || leadNameSyncBusy || !allMembersForAdmin.length || !allProjects.length) return;
  leadNameSyncBusy = true;

  try {
    let changed = false;

    for (const project of allProjects) {
      const names = projectLeads
        .filter(lead => String(lead.project_id) === String(project.id))
        .map(lead => allMembersForAdmin.find(member => String(member.id) === String(lead.member_id))?.display_name)
        .filter(Boolean);

      const current = (project.lead_names || []).filter(Boolean);
      if (!names.length || names.join("、") === current.join("、")) continue;

      const { error } = await db.from("projects").update({ lead_names: names }).eq("id", project.id);
      if (error) {
        console.warn("担当の名前をそろえられませんでした:", error.message);
        continue;
      }
      project.lead_names = names;
      changed = true;
    }

    if (changed) renderProjects();
  } finally {
    leadNameSyncBusy = false;
  }
}

function formatShortDateJa(dateText) {
  if (!dateText) return "";
  const date = new Date(dateText.length <= 10 ? dateText + "T00:00:00" : dateText);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS_JA[date.getDay()]}）`;
}

function renderProjects() {
  const root = $("projects-list");
  if (!root) return;

  if (!allProjects.length) {
    root.innerHTML = '<p class="muted">まだ事業が登録されていません。</p>';
    return;
  }

  root.innerHTML = allProjects.map(renderProjectCard).join("") + renderProjectModal();
}

/* 鉛筆を押したときに、画面にポンと出す書きこみ窓 */
function renderProjectModal() {
  let project = null;
  let title = "";
  let inner = "";
  let stage = null;

  if (editingStageId) {
    stage = projectStages.find(item => String(item.id) === String(editingStageId));
    project = stage && allProjects.find(item => String(item.id) === String(stage.project_id));
  } else if (editingAboutId) {
    project = allProjects.find(item => String(item.id) === String(editingAboutId));
  } else if (editingPart) {
    project = allProjects.find(item => `${item.id}:` === editingPart.slice(0, editingPart.lastIndexOf(":") + 1));
  }
  if (!project || !canEditProject(String(project.id))) {
    document.body.classList.remove("pj-modal-open");
    return "";
  }

  const id = String(project.id);
  const sid = escapeHTML(id);
  const color = projectColorFor(project);

  if (stage) {
    const parts = parseProgressTitle(stage.title);
    const stId = escapeHTML(stage.id);
    title = "進捗を書き直す";
    inner = `
      <div class="pj-modal-form">
        ${pjField(PJ_ICONS.calendar, `<input id="pj-edit-date-${stId}" type="date" value="${escapeHTML(parts.date)}" aria-label="日付">`)}
        ${pjField(PJ_ICONS.clock, progressTimeFieldsHtml(key => `pj-edit-${key}-${stId}`, parts.time))}
        ${pjField(PJ_ICONS.pin, `<input id="pj-edit-place-${stId}" type="text" lang="ja" value="${escapeHTML(parts.place)}" placeholder="場所" aria-label="場所">`)}
        ${pjField(PJ_ICONS.pencil, `<input id="pj-edit-text-${stId}" type="text" lang="ja" value="${escapeHTML(parts.text)}" placeholder="やること" aria-label="やること">`)}
        <div class="pj-about-buttons">
          <button type="button" class="secondary-button" data-pj-action="close-modal" data-id="${sid}">やめる</button>
          <button type="button" class="primary-button" data-pj-action="save-edit-stage" data-id="${stId}">${PJ_ICONS.save}保存</button>
        </div>
        <button type="button" class="pj-modal-delete" data-pj-action="delete-stage" data-id="${stId}">${PJ_ICONS.trash}この進捗を消す</button>
      </div>`;
  } else if (editingAboutId) {
    title = "事業の説明と色";
    inner = `
          <div class="pj-modal-form pj-about-edit">
            ${isAdmin ? `
            <label for="pj-name-${escapeHTML(id)}">事業の名前</label>
            <input id="pj-name-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.name || "")}">` : ""}
            <label for="pj-summary-${escapeHTML(id)}">どんな事業か</label>
            <textarea id="pj-summary-${escapeHTML(id)}" rows="3" lang="ja" placeholder="例：家庭の備えをいっしょに考えるリストを作って配る">${escapeHTML(project.summary || "")}</textarea>
            <p class="pj-about-label">カードの色</p>
            <div class="pj-color-options" role="radiogroup" aria-label="カードの色">
              ${PJ_COLORS.map(option => `
              <label class="pj-color-pill" style="--swatch:${option.bg};--swatch-border:${option.border};--swatch-accent:${option.accent}">
                <input type="radio" name="pj-color-${escapeHTML(id)}" value="${option.key}" ${option.key === color.key ? "checked" : ""}>
                <span>${option.label}</span>
              </label>`).join("")}
            </div>
            <div class="pj-about-buttons">
              <button type="button" class="secondary-button" data-pj-action="cancel-about" data-id="${escapeHTML(id)}">やめる</button>
              <button type="button" class="primary-button" data-pj-action="save-about" data-id="${escapeHTML(id)}">${PJ_ICONS.save}保存</button>
            </div>
          </div>`;
  } else if (isEditingPart(id, "progress")) {
    title = "進捗を足す";
    inner = `
      <div class="pj-modal-form">
        <p class="pj-modal-note">日付・時間・場所は、予定があるときだけ入れてください</p>
        ${pjField(PJ_ICONS.calendar, `<input id="pj-new-date-${sid}" type="date" class="pj-date-input" aria-label="日付（なくてもよい）">`)}
        ${pjField(PJ_ICONS.clock, progressTimeFieldsHtml(key => `pj-new-${key}-${sid}`, ""))}
        ${pjField(PJ_ICONS.pin, `<input id="pj-new-place-${sid}" type="text" lang="ja" placeholder="場所（例：寝屋川市役所）" aria-label="場所（なくてもよい）">`)}
        ${pjField(PJ_ICONS.pencil, `<input id="pj-new-stage-${sid}" type="text" lang="ja" placeholder="やること（例：打ち合わせ／備えリストメーカー作成中）" aria-label="やること">`)}
        <label class="pj-inline-check">
          <input id="pj-update-notify-${sid}" type="checkbox" checked> 担当者に通知する
        </label>
        <div class="pj-about-buttons">
          <button type="button" class="secondary-button" data-pj-action="close-part" data-id="${sid}">閉じる</button>
          <button type="button" class="primary-button" data-pj-action="save-progress" data-id="${sid}">${PJ_ICONS.save}足す</button>
        </div>
      </div>`;
  } else if (isEditingPart(id, "help")) {
    title = "手伝ってほしいこと";
    inner = `
      <div class="pj-modal-form">
        <p class="pj-modal-note">なければ空のままで保存してください</p>
        ${pjField(PJ_ICONS.person, `<input id="pj-help-${sid}" type="text" lang="ja" value="${escapeHTML(project.help_wanted || "")}" placeholder="例：当日の受付をしてくれる人を2名" aria-label="手伝ってほしいこと">`)}
        <label class="pj-inline-check">
          <input id="pj-help-notify-${sid}" type="checkbox" checked> 担当者に通知する
        </label>
        <div class="pj-about-buttons">
          <button type="button" class="secondary-button" data-pj-action="close-part" data-id="${sid}">やめる</button>
          <button type="button" class="primary-button" data-pj-action="save-help" data-id="${sid}">${PJ_ICONS.save}保存</button>
        </div>
      </div>`;
  } else if (isEditingPart(id, "report")) {
    title = "報告を書く";
    inner = `
        <div class="pj-modal-form">
          <textarea id="pj-report-${sid}" rows="3" lang="ja" aria-label="報告" placeholder="例：11/20 に打ち合わせをして、会場が決まりました。"></textarea>
          <input id="pj-report-image-${sid}" type="file" accept="image/*" aria-label="写真（なくてもよい）">
          <label class="pj-inline-check">
            <input id="pj-report-notify-${sid}" type="checkbox" checked> 正会員に通知する
          </label>
          <div class="pj-about-buttons">
            <button type="button" class="secondary-button" data-pj-action="close-part" data-id="${sid}">やめる</button>
            <button type="button" class="primary-button" data-pj-action="add-report" data-id="${sid}">報告を載せる</button>
          </div>
        </div>`;
  } else {
    document.body.classList.remove("pj-modal-open");
    return "";
  }

  document.body.classList.add("pj-modal-open");
  return `
    <div class="pj-modal" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <button type="button" class="pj-modal-backdrop" data-pj-action="close-modal" aria-label="閉じる"></button>
      <div class="pj-modal-card pj-edit-zone" style="--pj-bg:${color.bg};--pj-border:${color.border};--pj-accent:${color.accent};--pj-soft:${color.soft}">
        <div class="pj-modal-head">
          <div>
            <p class="pj-modal-project">${escapeHTML(project.name)}</p>
            <h3>${escapeHTML(title)}</h3>
          </div>
          <button type="button" class="pj-modal-x" data-pj-action="close-modal" aria-label="閉じる">×</button>
        </div>
        ${inner}
      </div>
    </div>`;
}

function renderProjectCard(project) {
  const id = String(project.id);
  const sid = escapeHTML(id);
  const stages = projectStages.filter(stage => String(stage.project_id) === id);
  const reports = projectReports.filter(report => String(report.project_id) === id);
  const activeStages = stages.filter(stage => !stage.done);
  const doneStages = stages.filter(stage => stage.done);
  const editable = canEditProject(id);
  const leadNames = (project.lead_names || []).filter(Boolean);
  const pencil = (part, label) => editable
    ? `<button type="button" class="pj-pencil-button" data-pj-action="edit-part" data-part="${part}" data-id="${sid}" aria-label="${label}">${PJ_ICONS.pencil}</button>`
    : "";

  // ---- 進捗状況（表紙）----
  // 担当者でない人：文だけ（終わったものは新しい3つまで、うすく）
  const recentDone = doneStages.slice(-3).reverse();
  const plainList = (activeStages.length || recentDone.length)
    ? `<ul class="pj-now-list">
        ${activeStages.map(stage => `
          <li class="pj-now-item"><span class="pj-now-dot" aria-hidden="true"></span><span>${escapeHTML(stage.title)}</span></li>`).join("")}
        ${recentDone.map(stage => `
          <li class="pj-now-item done"><span class="pj-now-check" aria-hidden="true">✓</span><span>${escapeHTML(stage.title)}</span><span class="pj-now-done-tag">済</span></li>`).join("")}
      </ul>`
    : '<p class="pj-now-empty">まだ書かれていません</p>';

  // 担当者：チェック（済）を付けられる。鉛筆を押すと、書き直し・消す・足すができる
  const stageRow = stage => {
    const stId = escapeHTML(stage.id);
    return `
    <li class="pj-check-row ${stage.done ? "done" : ""}">
      <span class="pj-check-title">${escapeHTML(stage.title)}</span>
      <span class="pj-check-tools">
        <label class="pj-done-toggle">
          <input type="checkbox" data-pj-stage="${stId}" ${stage.done ? "checked" : ""}>
          <span>済</span>
        </label>
        <button type="button" class="pj-mini-button" data-pj-action="edit-stage" data-id="${stId}" aria-label="この進捗を書き直す">${PJ_ICONS.pencil}</button>
      </span>
    </li>`;
  };

  const progressHtml = `
      <div class="pj-now pj-edit-zone">
        <div class="pj-part-head">
          <p class="pj-now-label">進捗状況</p>
          ${pencil("progress", "進捗を足す")}
        </div>
        ${editable
          ? (stages.length ? `<ul class="pj-checklist">${stages.map(stageRow).join("")}</ul>` : '<p class="pj-now-empty">まだ書かれていません</p>')
          : plainList}
      </div>`;

  // ---- 手伝ってほしいこと（表紙）----
  const helpHtml = (project.help_wanted || editable) ? `
      <div class="pj-help">
        <p class="pj-help-text">🙋 手伝ってほしいこと：${project.help_wanted ? escapeHTML(project.help_wanted) : '<span class="pj-summary-empty">いまはありません</span>'}</p>
        ${pencil("help", "手伝ってほしいことを書き直す")}
      </div>` : "";

  // ---- 最新の報告（表紙）：新しい3つ。押すと中身が開く ----
  const reportItem = report => `
        <li>
          <details class="pj-report-item">
            <summary>
              <span class="pj-report-when">${escapeHTML(formatShortDateJa(report.created_at))}${report.author_name ? `　${escapeHTML(report.author_name)}` : ""}</span>
              <span class="pj-report-first">${escapeHTML(report.body.split("\n")[0])}</span>
              <span class="pj-report-chevron">${PJ_ICONS.chevron}</span>
            </summary>
            <div class="pj-report-full">
              <p>${escapeHTML(report.body)}</p>
              ${report.image_url
                ? `<a href="${escapeHTML(report.image_url)}" target="_blank" rel="noopener"><img class="pj-report-image" src="${escapeHTML(report.image_url)}" alt="報告の写真" loading="lazy"></a>`
                : ""}
              ${(isAdmin || (!previewState && currentUser && report.created_by === currentUser.id))
                ? `<button type="button" class="pj-mini-button" data-pj-action="delete-report" data-id="${escapeHTML(report.id)}">この報告を消す</button>`
                : ""}
            </div>
          </details>
        </li>`;

  const latestHtml = (reports.length || editable) ? `
      <div class="pj-latest pj-edit-zone">
        <div class="pj-part-head">
          <h4 class="pj-latest-title">${PJ_ICONS.note}最新の報告</h4>
          ${pencil("report", "報告を書く")}
        </div>
        ${reports.length
          ? `<ul class="pj-report-items">${reports.slice(0, 3).map(reportItem).join("")}</ul>
             ${reports.length > 3 ? '<p class="pj-report-more">前の報告は「くわしく見る」にあります</p>' : ""}`
          : '<p class="pj-now-empty">まだ報告はありません</p>'}
      </div>` : "";

  // ---- くわしく見る：前の報告と、管理者の設定 ----
  const olderReports = reports.slice(3);
  const olderBox = olderReports.length ? `
    <section class="pj-box">
      ${pjBoxHead(PJ_ICONS.note, "前の報告", "")}
      <ul class="pj-report-items">${olderReports.map(reportItem).join("")}</ul>
    </section>` : "";

  const leadsBox = isAdmin ? `
    <section class="pj-box pj-form-box">
      ${pjBoxHead(PJ_ICONS.person, "担当者", "管理者だけが変更できます")}
      <p class="form-note">正会員から選んでください。選んだ人がカードに「担当」として出て、この事業のようすを書き直せるようになります。</p>
      <div class="pj-lead-options">
        ${fullMembersForAdmin().length
          ? fullMembersForAdmin().map(member => `
            <label class="pj-lead-pill">
              <input type="checkbox" data-pj-lead="${escapeHTML(id)}" value="${escapeHTML(member.id)}"
                ${projectLeads.some(lead => String(lead.project_id) === id && lead.member_id === member.id) ? "checked" : ""}>
              <span>${escapeHTML(member.display_name)}</span>
            </label>`).join("")
          : '<p class="form-note">正会員がまだいません。「会員」の画面で正会員にすると、ここに出ます。</p>'}
      </div>
    </section>
    <div class="pj-bottom-buttons">
      <button type="button" class="secondary-button danger-button" data-pj-action="delete-project" data-id="${escapeHTML(id)}">${PJ_ICONS.trash}この事業を削除</button>
      <button type="button" class="primary-button" data-pj-action="save-leads" data-id="${escapeHTML(id)}">${PJ_ICONS.save}担当者を保存</button>
    </div>` : "";

  // 事業名と説明（説明は鉛筆マークで、その場で書き直す）
  const color = projectColorFor(project);
  const aboutHtml = `
          <div class="pj-head">
            <h3 class="pj-name">${escapeHTML(project.name)}</h3>
          </div>
          ${(project.summary || editable) ? `
          <div class="pj-summary-row">
            ${project.summary
              ? `<p class="pj-summary">${escapeHTML(project.summary)}</p>`
              : '<p class="pj-summary pj-summary-empty">事業の説明はまだありません</p>'}
            ${editable ? `<button type="button" class="pj-pencil-button" data-pj-action="edit-about" data-id="${escapeHTML(id)}" aria-label="事業の説明と色を書き直す">${PJ_ICONS.pencil}</button>` : ""}
          </div>` : ""}`;

  const detailInner = `${olderBox}${leadsBox}`;

  return `
    <article class="project-card pj-color-${color.key}" id="project-${sid}" style="--pj-bg:${color.bg};--pj-border:${color.border};--pj-accent:${color.accent};--pj-soft:${color.soft}">
      <div class="pj-top">
        <span class="pj-icon">${projectIconFor(project.name)}</span>
        <div class="pj-main">
          ${aboutHtml}

          <p class="pj-leads">
            <span class="pj-label">担当</span>
            ${leadNames.length
              ? leadNames.map(name => `<span class="pj-lead-chip">${escapeHTML(name)}</span>`).join("")
              : '<span class="pj-undecided">未定</span>'}
          </p>
        </div>
      </div>

      ${progressHtml}

      ${(project.next_date || project.next_plan)
        ? `<p class="pj-next"><span class="pj-label">予定</span>${escapeHTML(formatShortDateJa(project.next_date))} ${escapeHTML(project.next_plan || "")}</p>`
        : ""}

      ${helpHtml}

      ${latestHtml}

      ${detailInner.trim() ? `
      <details class="pj-details" data-project-id="${sid}" ${openProjectIds.has(id) ? "open" : ""}>
        <summary>
          <span class="pj-sum-chevron">${PJ_ICONS.chevron}</span>
          <span class="pj-sum-open">くわしく見る</span>
          <span class="pj-sum-close">閉じる</span>
        </summary>
        <div class="pj-detail-body">
          ${detailInner}
          <button type="button" class="pj-close-button" data-pj-action="close-details" data-id="${sid}">${PJ_ICONS.chevron}閉じる</button>
        </div>
      </details>` : '<div class="pj-card-end"></div>'}
    </article>`;
}

function setProjectMessage(text, error = false) {
  // 小さな案内は alert で十分（画面が長いため）
  if (error) alert(text);
}

async function saveProgress(id) {
  const value = key => $(`pj-${key}-${id}`)?.value ?? "";
  const project = allProjects.find(item => String(item.id) === String(id));
  const button = document.querySelector(`[data-pj-action="save-progress"][data-id="${CSS.escape(String(id))}"]`);

  const newTime = readProgressTime(key => value(`new-${key}`));
  if (newTime === null) {
    return setProjectMessage("時間の数字を見直してください（時は0〜23、分は0〜59。始まりの時から入れてください）。", true);
  }
  const newLine = buildProgressTitle({
    date: value("new-date"),
    time: newTime,
    place: value("new-place").trim(),
    text: value("new-stage").trim()
  });
  if (!newLine) return setProjectMessage("やることを入れてください。", true);

  if (button) button.disabled = true;
  try {
    // 前の版の「次の予定」が残っていたら、進捗に移す
    const lines = [];
    if (project?.next_plan || project?.next_date) {
      lines.push(`${formatShortDateJa(project.next_date)} ${project.next_plan || ""}`.trim());
    }
    lines.push(newLine);

    let maxOrder = Math.max(0, ...projectStages
      .filter(stage => String(stage.project_id) === String(id))
      .map(stage => stage.sort_order || 0));
    for (const title of lines.filter(Boolean)) {
      const { error } = await db.from("project_stages").insert({ project_id: id, title, sort_order: ++maxOrder });
      if (error) throw error;
    }

    const { error } = await db.from("projects").update({
      next_date: null,
      next_plan: null,
      updated_at: new Date().toISOString()
    }).eq("id", id);
    if (error) throw error;

    if ($(`pj-update-notify-${id}`)?.checked) await notifyLeads(project, id, newLine);

    editingPart = null;
    await loadProjects();
  } catch (error) {
    console.error(error);
    setProjectMessage("保存できませんでした：" + error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveHelp(id) {
  const project = allProjects.find(item => String(item.id) === String(id));
  const help = ($(`pj-help-${id}`)?.value ?? "").trim() || null;
  const notify = $(`pj-help-notify-${id}`)?.checked;

  const { error } = await db.from("projects").update({
    help_wanted: help,
    updated_at: new Date().toISOString()
  }).eq("id", id);
  if (error) return setProjectMessage("保存できませんでした：" + error.message, true);

  if (notify && help && help !== project?.help_wanted) await notifyLeads(project, id, `手伝い募集：${help}`);

  editingPart = null;
  await loadProjects();
}

async function notifyLeads(project, id, message) {
  const note = await notifyMembers({
    heading: `${project?.name || "事業"}が更新されました`,
    message: message || "様子が更新されました",
    url: `${getAppUrl()}#project-${id}`,
    audience: "leads",
    projectId: id
  });
  if (note.includes("送れませんでした")) alert("保存しました。" + note);
}

function editPart(id, part) {
  editingPart = `${id}:${part}`;
  editingStageId = null;
  editingAboutId = null;
  renderProjects();
  const focusId = { progress: `pj-new-stage-${id}`, help: `pj-help-${id}`, report: `pj-report-${id}` }[part];
  $(focusId)?.focus();
}

function closePart() {
  editingPart = null;
  editingStageId = null;
  editingAboutId = null;
  renderProjects();
}

async function saveAbout(id) {
  const value = key => $(`pj-${key}-${id}`)?.value ?? "";
  const changes = {
    summary: value("summary").trim() || null,
    updated_at: new Date().toISOString()
  };
  const newName = value("name").trim();
  if (isAdmin && newName) changes.name = newName;
  const picked = document.querySelector(`input[name="pj-color-${CSS.escape(String(id))}"]:checked`)?.value;
  if (picked) changes.color = picked;

  let { error } = await db.from("projects").update(changes).eq("id", id);
  if (error && changes.color && /color/i.test(error.message || "")) {
    // 色の欄がまだない（SQL 010 をまだ実行していない）ときは、説明だけ保存する
    delete changes.color;
    ({ error } = await db.from("projects").update(changes).eq("id", id));
    if (!error) alert("説明は保存しました。色を保存するには、Supabase で「010_事業の色.sql」を一度実行してください。");
  }
  if (error) return setProjectMessage("保存できませんでした：" + error.message, true);

  editingAboutId = null;
  await loadProjects();
}

function editAbout(id) {
  editingAboutId = String(id);
  editingPart = null;
  editingStageId = null;
  renderProjects();
  $(`pj-summary-${id}`)?.focus();
}

function cancelEditAbout() {
  editingAboutId = null;
  renderProjects();
}

async function toggleStage(stageId, done) {
  const { error } = await db.from("project_stages").update({ done }).eq("id", stageId);
  if (error) setProjectMessage("更新できませんでした：" + error.message, true);
  await loadProjects();
}

async function addStage(projectId) {
  const input = $(`pj-new-stage-${projectId}`);
  const title = input?.value.trim();
  if (!title) return;

  const maxOrder = Math.max(0, ...projectStages
    .filter(stage => String(stage.project_id) === String(projectId))
    .map(stage => stage.sort_order || 0));

  const { error } = await db.from("project_stages").insert({
    project_id: projectId,
    title,
    sort_order: maxOrder + 1
  });

  if (error) return setProjectMessage("追加できませんでした：" + error.message, true);
  await loadProjects();
}

function editStage(stageId) {
  const stage = projectStages.find(item => String(item.id) === String(stageId));
  if (!stage) return;
  editingStageId = stage.id;
  editingPart = null;
  editingAboutId = null;
  renderProjects();
  $(`pj-edit-text-${stageId}`)?.focus();
}

function cancelEditStage() {
  editingStageId = null;
  renderProjects();
}

async function saveEditStage(stageId) {
  const value = key => $(`pj-edit-${key}-${stageId}`)?.value ?? "";
  const text = value("text").trim();
  if (!text) return setProjectMessage("やることを入れてください。", true);

  const time = readProgressTime(value);
  if (time === null) return setProjectMessage("時間の数字を見直してください（時は0〜23、分は0〜59。始まりの時から入れてください）。", true);

  const title = buildProgressTitle({
    date: value("date"),
    time,
    place: value("place").trim(),
    text
  });

  const { error } = await db.from("project_stages").update({ title }).eq("id", stageId);
  if (error) return setProjectMessage("書き直せませんでした：" + error.message, true);

  editingStageId = null;
  await loadProjects();
}

async function deleteStage(stageId) {
  if (!confirm("この進捗を消しますか？")) return;
  const { error } = await db.from("project_stages").delete().eq("id", stageId);
  if (error) return setProjectMessage("消せませんでした：" + error.message, true);
  editingStageId = null;
  await loadProjects();
}

async function addReport(projectId, button) {
  const body = $(`pj-report-${projectId}`)?.value.trim();
  if (!body) return setProjectMessage("報告の内容を入力してください。", true);

  const project = allProjects.find(item => String(item.id) === String(projectId));
  const notify = $(`pj-report-notify-${projectId}`)?.checked;
  const imageFile = $(`pj-report-image-${projectId}`)?.files?.[0];

  button.disabled = true;

  try {
    let imageUrl = null;
    if (imageFile) imageUrl = await uploadImage(imageFile, "projects");

    const { error } = await db.from("project_reports").insert({
      project_id: projectId,
      body,
      image_url: imageUrl,
      author_name: currentMember?.display_name || (isAdmin ? "管理者" : null),
      created_by: currentUser?.id
    });

    if (error) throw error;

    await db.from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);

    let note = "";
    if (notify) {
      note = await notifyMembers({
        heading: "防災Sowing 事業の報告",
        message: `${project?.name || "事業"}に新しい報告が載りました`,
        url: `${getAppUrl()}#project-${projectId}`,
        audience: "full"
      });
    }

    editingPart = null;
    await loadProjects();

    if (note.includes("送れませんでした")) alert("報告を載せました。" + note);

  } catch (error) {
    console.error(error);
    setProjectMessage("報告を載せられませんでした：" + error.message, true);

  } finally {
    button.disabled = false;
  }
}

async function deleteReport(reportId) {
  if (!confirm("この報告を消しますか？")) return;
  const { error } = await db.from("project_reports").delete().eq("id", reportId);
  if (error) return setProjectMessage("消せませんでした：" + error.message, true);
  await loadProjects();
}

async function saveLeads(projectId) {
  if (!isAdmin) return;

  const selected = [...document.querySelectorAll(`input[data-pj-lead="${CSS.escape(String(projectId))}"]:checked`)]
    .map(input => input.value);

  // カードに出す担当者の名前は、選んだ正会員の名前にそろえる
  const names = selected
    .map(memberId => allMembersForAdmin.find(member => member.id === memberId)?.display_name)
    .filter(Boolean);

  const { error: nameError } = await db.from("projects")
    .update({ lead_names: names, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (nameError) return setProjectMessage("担当者を保存できませんでした：" + nameError.message, true);

  const { error: deleteError } = await db.from("project_leads")
    .delete()
    .eq("project_id", projectId);

  if (deleteError) return setProjectMessage("担当者を保存できませんでした：" + deleteError.message, true);

  if (selected.length) {
    const { error: insertError } = await db.from("project_leads")
      .insert(selected.map(memberId => ({ project_id: projectId, member_id: memberId })));

    if (insertError) return setProjectMessage("担当者を保存できませんでした：" + insertError.message, true);
  }

  alert("担当者を保存しました。");
  await loadProjects();
}

async function addProject() {
  if (!isAdmin) return;

  const name = prompt("新しい事業の名前を入力してください。");
  if (!name || !name.trim()) return;

  const maxOrder = Math.max(0, ...allProjects.map(item => item.sort_order || 0));

  const { data, error } = await db.from("projects")
    .insert({ name: name.trim(), sort_order: maxOrder + 1 })
    .select("id")
    .single();

  if (error) return setProjectMessage("事業を追加できませんでした：" + error.message, true);

  openProjectIds.add(String(data.id));
  await loadProjects();
}

async function deleteProject(projectId) {
  if (!isAdmin) return;
  if (!confirm("この事業を、報告もふくめて削除しますか？元に戻せません。")) return;

  const { error } = await db.from("projects").delete().eq("id", projectId);
  if (error) return setProjectMessage("削除できませんでした：" + error.message, true);

  openProjectIds.delete(String(projectId));
  await loadProjects();
}

/* -----------------------------
   管理画面：会員
----------------------------- */

function renderMemberStatus(devices) {
  if (!devices.length) {
    return '<span class="member-status"><span class="ms-badge ms-off">未入室</span></span>';
  }

  const pushOn = devices.some(device => device.push_enabled === true);
  const pushKnown = devices.some(device => device.push_enabled !== null && device.push_enabled !== undefined);
  const lastSeen = devices
    .map(device => device.last_seen_at || device.created_at)
    .filter(Boolean)
    .sort()
    .pop();

  return `<span class="member-status">
    <span class="ms-badge ms-on">入室済み${devices.length > 1 ? `（${devices.length}台）` : ""}</span>
    ${pushKnown
      ? `<span class="ms-badge ${pushOn ? "ms-on" : "ms-warn"}">${pushOn ? "通知ON" : "通知OFF"}</span>`
      : '<span class="ms-badge ms-off">通知：まだ分からない</span>'}
    ${lastSeen ? `<small>最後に開いた日：${escapeHTML(formatShortDateJa(lastSeen))}</small>` : ""}
  </span>`;
}

function fullMembersForAdmin() {
  return allMembersForAdmin.filter(member => member.member_type === "正会員" && member.active !== false);
}

function formatMemberCode(code) {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
}

async function loadMembersAdmin() {
  const root = $("members-admin-list");
  if (!root || !isAdmin) return;

  const [members, codes, devices] = await Promise.all([
    db.from("members").select("*").order("created_at", { ascending: true }),
    db.from("member_codes").select("member_id,code"),
    db.from("member_devices").select("*")
  ]);

  // 会員ごとの端末（入室した数・通知の許可・最後に開いた日）
  const devicesByMember = {};
  (devices.data || []).forEach(device => {
    (devicesByMember[device.member_id] ||= []).push(device);
  });

  if (members.error || codes.error) {
    root.innerHTML = '<p class="muted">会員一覧を読み込めませんでした。</p>';
    console.error(members.error || codes.error);
    return;
  }

  allMembersForAdmin = members.data || [];
  syncLeadNames();
  memberCodesForAdmin = Object.fromEntries((codes.data || []).map(row => [row.member_id, row.code]));

  if (!allMembersForAdmin.length) {
    root.innerHTML = '<p class="muted">まだ会員がいません。上の「会員を登録する」から登録してください。</p>';
  } else {
    root.innerHTML = `<ul class="member-admin-list">${allMembersForAdmin.map(member => `
      <li class="member-admin-row">
        <div class="member-admin-name">
          <strong>${escapeHTML(member.display_name)}</strong>
          <small>コード：<span class="member-code">${escapeHTML(formatMemberCode(memberCodesForAdmin[member.id]))}</span></small>
          ${renderMemberStatus(devicesByMember[member.id] || [])}
          ${(member.proxy_names || []).length
            ? `<small class="member-proxy">代わりに登録：${(member.proxy_names || []).map(escapeHTML).join("、")}</small>`
            : ""}
        </div>
        <select data-member-type="${escapeHTML(member.id)}" aria-label="${escapeHTML(member.display_name)}さんの種類">
          <option value="協働会員" ${member.member_type !== "正会員" ? "selected" : ""}>協働会員</option>
          <option value="正会員" ${member.member_type === "正会員" ? "selected" : ""}>正会員</option>
        </select>
        <div class="member-admin-actions">
          <button type="button" class="pj-mini-button" data-member-action="copy-invite" data-id="${escapeHTML(member.id)}">案内文</button>
          <button type="button" class="pj-mini-button" data-member-action="rename" data-id="${escapeHTML(member.id)}">名前を変える</button>
          <button type="button" class="pj-mini-button" data-member-action="proxy" data-id="${escapeHTML(member.id)}">代わりの人</button>
          <button type="button" class="pj-mini-button" data-member-action="reset-code" data-id="${escapeHTML(member.id)}">コード作り直し</button>
          <button type="button" class="pj-mini-button" data-member-action="delete" data-id="${escapeHTML(member.id)}">削除</button>
        </div>
      </li>`).join("")}</ul>`;
  }

  if (allProjects.length) renderProjects();
}

// LINE などにそのまま送れる案内文
function buildInviteMessage(name, code, memberType) {
  const typeLabel = memberType === "正会員" ? "正会員" : "協働会員";

  return [
    `${name} さん`,
    "",
    "防災Sowing 会員専用アプリのご案内です。",
    "",
    "これまで会員アプリは、URLを知っていればどなたでも見られる状態でした。",
    "参加者のお名前など、会員のみなさんの情報を守るため、",
    "これからは会員お一人ずつにお渡しする「会員コード」で入っていただく形に変わりました。",
    "お手数をおかけしますが、はじめに一度だけコードの入力をお願いします。",
    "",
    `${name} さんの${typeLabel}用の会員コードは`,
    `【 ${formatMemberCode(code)} 】`,
    "です。",
    "",
    "▼はじめ方",
    "① 下のURLを Safari または Chrome で開いてください",
    "https://bousaisowing-yu.github.io/bousai-sowing-app/",
    "（LINEの中で開いた場合は、画面の「…」などから「ブラウザで開く」を選んでください）",
    "",
    "② ホーム画面に追加します",
    "・iPhone：画面下の共有ボタン（四角から↑が出ているマーク）→「ホーム画面に追加」→「追加」",
    "・Android：右上の「︙」→「ホーム画面に追加」（または「アプリをインストール」）",
    "",
    "③ ホーム画面にできた「防災Sowing」のアイコンから開きます",
    "",
    "④ 「会員コード」に上のコードを入れて「はじめる」を押します",
    "",
    "⑤ 名前の下に出る緑の「通知を受け取る」ボタンを押し、続けて出る確認で「許可」を押してください",
    "イベントやお知らせの通知が届くようになります。",
    ...(memberType === "正会員"
      ? ["", "正会員の方は、下のメニューの「正会員」から、事業の進み具合も見られます。"]
      : []),
    "",
    "次からはコードを入れなくても開けます。",
    "分からないことがあれば、気軽に聞いてください。",
    "",
    "特定非営利活動法人 防災Sowing"
  ].join("\n");
}

async function copyInviteMessage(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("案内文をコピーしました。LINEなどに貼り付けて送ってください。");
  } catch (_) {
    prompt("この文をコピーしてください", text);
  }
}

function showNewMemberCode(name, code, memberType) {
  const box = $("new-member-result");
  if (!box) return;

  const text = buildInviteMessage(name, code, memberType);

  box.hidden = false;
  box.innerHTML = `
    <p><strong>${escapeHTML(name)}</strong> さんの${memberType ? escapeHTML(memberType) + "用の" : ""}会員コード</p>
    <p class="member-code-big">${escapeHTML(formatMemberCode(code))}</p>
    <button type="button" class="primary-button" id="copy-member-message">案内文をコピー</button>
    <details class="invite-preview">
      <summary>送る文を見る</summary>
      <pre>${escapeHTML(text)}</pre>
    </details>
    <p class="form-note">会員一覧の「案内文」からも、あとでコピーできます。</p>`;

  $("copy-member-message").addEventListener("click", () => copyInviteMessage(text));
}

async function addMember() {
  const name = $("new-member-name").value.trim();
  if (!name) {
    alert("お名前を入力してください。");
    return;
  }

  const memberType =
    document.querySelector('input[name="new-member-type"]:checked')?.value || "協働会員";

  const button = $("add-member-button");
  button.disabled = true;

  const { data, error } = await db.rpc("create_member", {
    p_name: name,
    p_member_type: memberType
  });

  button.disabled = false;

  if (error) {
    alert("登録できませんでした：" + error.message);
    return;
  }

  $("new-member-name").value = "";
  showNewMemberCode(name, data.code, memberType);

  await loadMembersAdmin();
}

async function resetMemberCode(memberId) {
  const member = allMembersForAdmin.find(item => item.id === memberId);
  if (!confirm(`${member?.display_name || "この会員"} さんのコードを作り直しますか？前のコードは使えなくなります（すでにログイン済みの端末はそのまま使えます）。`)) return;

  const { data, error } = await db.rpc("reset_member_code", { p_member_id: memberId });

  if (error) {
    alert("作り直せませんでした：" + error.message);
    return;
  }

  showNewMemberCode(member?.display_name || "", data, member?.member_type);
  await loadMembersAdmin();
}

async function changeMemberType(memberId, memberType) {
  const { error } = await db.from("members")
    .update({ member_type: memberType })
    .eq("id", memberId);

  if (error) {
    alert("変更できませんでした：" + error.message);
  }

  await loadMembersAdmin();
}

/* 「代わりに登録」できる名前（子どもなど）を会員ごとに決める */
function openProxyEditor(button) {
  const member = allMembersForAdmin.find(item => item.id === button.dataset.id);
  const row = button.closest(".member-admin-row");
  if (!member || !row) return;

  document.querySelectorAll(".member-proxy-editor").forEach(el => el.remove());
  const sid = escapeHTML(member.id);
  const editor = document.createElement("div");
  editor.className = "member-proxy-editor";
  editor.innerHTML = `
    <p><strong>${escapeHTML(member.display_name)} さん</strong>が「代わりに登録」できる人</p>
    <label for="proxy-names-${sid}">名前（1行に1人）</label>
    <textarea id="proxy-names-${sid}" rows="3" lang="ja" placeholder="例：中嶋 望">${escapeHTML((member.proxy_names || []).join("\n"))}</textarea>
    <div class="member-proxy-buttons">
      <button type="button" class="primary-button" data-member-action="proxy-save" data-id="${sid}">保存</button>
      <button type="button" class="secondary-button" data-member-action="proxy-close">やめる</button>
    </div>
  `;
  row.appendChild(editor);
}

async function saveProxyNames(memberId) {
  const names = [...new Set(($(`proxy-names-${memberId}`)?.value || "")
    .split(/\n/)
    .map(name => name.replace(/[\s　]+/g, " ").trim())
    .filter(Boolean))];

  const { error } = await db.from("members")
    .update({ proxy_names: names })
    .eq("id", memberId);

  if (error) {
    alert(String(error.message || "").includes("proxy")
      ? "保存する場所がまだありません。Supabase の SQL Editor で 009_proxy_names.sql を実行してください。"
      : "保存できませんでした：" + error.message);
    return;
  }

  await loadMembersAdmin();
}

async function renameMember(memberId) {
  const member = allMembersForAdmin.find(item => item.id === memberId);
  if (!member) return;

  const input = prompt(`${member.display_name} さんの新しい名前を入れてください`, member.display_name);
  if (input === null) return;
  const newName = input.replace(/[\s　]+/g, " ").trim();
  if (!newName || newName === member.display_name) return;
  if (newName.length > 40) {
    alert("名前が長すぎます（40文字まで）");
    return;
  }

  const { error } = await db.from("members")
    .update({ display_name: newName })
    .eq("id", memberId);

  if (error) {
    alert("変更できませんでした：" + error.message);
    return;
  }

  // これまでのイベントの「参加する」も新しい名前にそろえる（取り消しができるように）
  const { error: responseError } = await db.from("event_responses")
    .update({ member_name: newName })
    .eq("member_name", member.display_name);
  if (responseError) console.warn("参加の記録の名前は変えられませんでした:", responseError.message);

  await loadMembersAdmin();
}

async function deleteMember(memberId) {
  const member = allMembersForAdmin.find(item => item.id === memberId);
  if (!confirm(`${member?.display_name || "この会員"} さんを削除しますか？その人の端末ではアプリが使えなくなります。`)) return;

  const { error } = await db.from("members").delete().eq("id", memberId);

  if (error) {
    alert("削除できませんでした：" + error.message);
  }

  await loadMembersAdmin();
}

/* -----------------------------
   管理者用：会員からの見え方を確かめる
   本当の会員としてログインはせず、画面の出し方だけを切り替える。
   この間は保存・送信を止める。
----------------------------- */

let previewState = null;

const PREVIEW_WRITE_METHODS = ["insert", "update", "upsert", "delete"];
const PREVIEW_BLOCKED_RPCS = [
  "toggle_event_interest", "report_my_device", "create_member",
  "reset_member_code", "login_with_code"
];
const PREVIEW_BLOCK_MESSAGE = "見え方の確認中なので保存しません";

function previewBlockedResult() {
  const result = { data: null, error: { message: PREVIEW_BLOCK_MESSAGE } };
  // .eq() や .select() をつなげても、最後に「保存しませんでした」を返す
  const chain = new Proxy(function () {}, {
    get(target, prop) {
      if (prop === "then") return resolve => resolve(result);
      return () => chain;
    },
    apply() { return chain; }
  });
  return chain;
}

function startPreview(memberType) {
  if (!isAdmin && !previewState) return;

  if (!previewState) {
    const realFrom = db.from.bind(db);
    const realRpc = db.rpc.bind(db);
    const realInvoke = db.functions?.invoke?.bind(db.functions);

    previewState = { isAdmin, currentMember, realFrom, realRpc, realInvoke };

    db.from = table => {
      const builder = realFrom(table);
      return new Proxy(builder, {
        get(target, prop) {
          if (PREVIEW_WRITE_METHODS.includes(prop)) return () => previewBlockedResult();
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    };
    db.rpc = (name, args) => PREVIEW_BLOCKED_RPCS.includes(name)
      ? previewBlockedResult()
      : realRpc(name, args);
    if (db.functions && realInvoke) {
      db.functions.invoke = async () => ({ data: null, error: { message: PREVIEW_BLOCK_MESSAGE } });
    }
  }

  previewState.type = memberType;
  isAdmin = false;
  currentMember = {
    id: "preview",
    display_name: "（例）会員",
    member_type: memberType,
    active: true
  };

  $("preview-banner-text").textContent =
    `いま「${memberType}」からの見え方を表示しています（見るだけ・保存されません）`;
  $("preview-banner").hidden = false;
  $("admin-tab").hidden = true;
  if ($("push-enable-box")) $("push-enable-box").hidden = true;
  document.body.classList.add("previewing");

  hideGate();
  applyMemberUI();
  switchTab("events");
  reloadForPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function endPreview({ reload = true } = {}) {
  if (!previewState) return;

  db.from = previewState.realFrom;
  db.rpc = previewState.realRpc;
  if (db.functions && previewState.realInvoke) db.functions.invoke = previewState.realInvoke;

  isAdmin = previewState.isAdmin;
  currentMember = previewState.currentMember;
  previewState = null;

  $("preview-banner").hidden = true;
  $("admin-tab").hidden = false;
  document.body.classList.remove("previewing");

  if (!reload) return;
  applyMemberUI();
  reloadForPreview();
  switchTab("admin");
}

async function reloadForPreview() {
  try {
    if (typeof loadEvents === "function") await loadEvents();
    if (typeof loadAnnouncements === "function") await loadAnnouncements();
    if (isFullMemberNow()) {
      allProjects = [];
      await loadProjects();
    }
  } catch (error) {
    console.error("見え方の切り替えで読み込みに失敗しました:", error);
  }
}

/* -----------------------------
   ボタンの設定
----------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-preview-as]").forEach(button => {
    button.addEventListener("click", () => startPreview(button.dataset.previewAs));
  });
  $("preview-exit-button")?.addEventListener("click", () => endPreview());

  $("gate-join-button")?.addEventListener("click", joinAsMember);

  $("gate-code")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) joinAsMember();
  });

  $("add-member-button")?.addEventListener("click", addMember);

  $("gate-admin-button")?.addEventListener("click", () => {
    hideGate();
    switchTab("admin");
  });

  $("add-project-button")?.addEventListener("click", addProject);

  $("projects-back-button")?.addEventListener("click", () => {
    switchTab("events");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ページトップボタン（下までスクロールしたときだけ出す）
  const pageTop = $("page-top-button");
  if (pageTop) {
    const updatePageTop = () => { pageTop.hidden = window.scrollY < 500; };
    window.addEventListener("scroll", updatePageTop, { passive: true });
    pageTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    updatePageTop();
  }

  const projectsRoot = $("projects-list");

  projectsRoot?.addEventListener("click", event => {
    const button = event.target.closest("button[data-pj-action]");
    if (!button) return;

    const id = button.dataset.id;

    switch (button.dataset.pjAction) {
      case "save-progress": saveProgress(id); break;
      case "save-help": saveHelp(id); break;
      case "edit-part": editPart(id, button.dataset.part); break;
      case "close-part":
      case "close-modal":
      case "cancel-about":
      case "cancel-edit-stage": closePart(); break;
      case "save-about": saveAbout(id); break;
      case "edit-about": editAbout(id); break;
      case "add-stage": addStage(id); break;
      case "delete-stage": deleteStage(id); break;
      case "edit-stage": editStage(id); break;
      case "save-edit-stage": saveEditStage(id); break;
      case "add-report": addReport(id, button); break;
      case "delete-report": deleteReport(id); break;
      case "save-leads": saveLeads(id); break;
      case "delete-project": deleteProject(id); break;
      case "close-details": {
        const card = $(`project-${id}`);
        const details = card?.querySelector("details");
        if (details) details.open = false;
        card?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  });

  // 書きこみ窓は Esc でも閉じる
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.body.classList.contains("pj-modal-open")) closePart();
  });

  projectsRoot?.addEventListener("change", event => {
    const input = event.target.closest("input[data-pj-stage]");
    if (input) toggleStage(input.dataset.pjStage, input.checked);
  });

  // 開いている「くわしく見る」を覚えておく（更新後も開いたままにする）
  projectsRoot?.addEventListener("toggle", event => {
    const details = event.target;
    if (!details.matches?.("details[data-project-id]")) return;
    if (details.open) openProjectIds.add(details.dataset.projectId);
    else openProjectIds.delete(details.dataset.projectId);
  }, true);

  const membersRoot = $("members-admin-list");

  membersRoot?.addEventListener("change", event => {
    const select = event.target.closest("select[data-member-type]");
    if (select) changeMemberType(select.dataset.memberType, select.value);
  });

  membersRoot?.addEventListener("click", event => {
    const button = event.target.closest("button[data-member-action]");
    if (button?.dataset.memberAction === "delete") deleteMember(button.dataset.id);
    if (button?.dataset.memberAction === "rename") renameMember(button.dataset.id);
    if (button?.dataset.memberAction === "proxy") openProxyEditor(button);
    if (button?.dataset.memberAction === "proxy-save") saveProxyNames(button.dataset.id);
    if (button?.dataset.memberAction === "proxy-close") button.closest(".member-proxy-editor")?.remove();
    if (button?.dataset.memberAction === "reset-code") resetMemberCode(button.dataset.id);
    if (button?.dataset.memberAction === "copy-invite") {
      const member = allMembersForAdmin.find(item => item.id === button.dataset.id);
      const code = member && memberCodesForAdmin[member.id];
      if (member && code) {
        copyInviteMessage(buildInviteMessage(member.display_name, code, member.member_type));
      } else {
        alert("この会員のコードがありません。「コード作り直し」でコードを作ってください。");
      }
    }
  });

  // 通知から「#project-…」で開いたとき、その事業を表示する
  window.addEventListener("load", () => {
    const match = location.hash.match(/^#project-(.+)$/);
    if (!match) return;

    const projectId = decodeURIComponent(match[1]);
    openProjectIds.add(projectId);

    const tryOpen = (attempt = 0) => {
      const card = document.getElementById("project-" + projectId);
      if (card) {
        switchTab("projects");
        runAfterSplash(() => card.scrollIntoView({ behavior: "smooth", block: "start" }));
      } else if (attempt < 20) {
        setTimeout(() => tryOpen(attempt + 1), 500);
      }
    };

    tryOpen();
  });
});
