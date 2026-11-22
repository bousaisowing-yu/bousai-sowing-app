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

  // 正会員タブは正会員（と管理者）にだけ見せる
  if ($("projects-tab")) $("projects-tab").hidden = !full;
  if ($("projects-area")) $("projects-area").hidden = !full;

  if (!full && $("projects-page") && !$("projects-page").hidden) {
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

      if (!OneSignal.Notifications.permission) {
        OneSignal.Slidedown.promptPush();
      }

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

  root.innerHTML = allProjects.map(renderProjectCard).join("");
}

function renderProjectCard(project) {
  const id = String(project.id);
  const stages = projectStages.filter(stage => String(stage.project_id) === id);
  const reports = projectReports.filter(report => String(report.project_id) === id);
  const activeStages = stages.filter(stage => !stage.done);
  const doneStages = stages.filter(stage => stage.done);
  const editable = canEditProject(id);
  const latest = reports[0];
  const leadNames = (project.lead_names || []).filter(Boolean);

  const statusClass = PROJECT_STATUS_CLASS[project.status] || "pj-status-prep";

  // カードに出す「いまの動き」（終わったものは下にうすく、新しい3つまで）
  const recentDone = doneStages.slice(-3).reverse();
  const nowList = (activeStages.length || recentDone.length)
    ? `<ul class="pj-now-list">
        ${activeStages.map(stage => `
          <li class="pj-now-item"><span class="pj-now-dot" aria-hidden="true"></span><span>${escapeHTML(stage.title)}</span></li>`).join("")}
        ${recentDone.map(stage => `
          <li class="pj-now-item done"><span class="pj-now-check" aria-hidden="true">✓</span><span>${escapeHTML(stage.title)}</span><span class="pj-now-done-tag">済</span></li>`).join("")}
      </ul>`
    : '<p class="pj-now-empty">まだ書かれていません</p>';

  const stageChecklist = stages.map(stage => `
    <li class="pj-check-row ${stage.done ? "done" : ""}">
      <span class="pj-check-title">${escapeHTML(stage.title)}</span>
      ${editable ? `
      <span class="pj-check-tools">
        <label class="pj-done-toggle">
          <input type="checkbox" data-pj-stage="${escapeHTML(stage.id)}" ${stage.done ? "checked" : ""}>
          <span>済</span>
        </label>
        <button type="button" class="pj-mini-button" data-pj-action="edit-stage" data-id="${escapeHTML(stage.id)}" aria-label="書き直す">${PJ_ICONS.pencil}</button>
        <button type="button" class="pj-mini-button" data-pj-action="delete-stage" data-id="${escapeHTML(stage.id)}" aria-label="消す">×</button>
      </span>` : (stage.done ? '<span class="pj-now-done-tag">済</span>' : "")}
    </li>`).join("")

  const reportList = reports.length
    ? reports.map(report => `
      <li class="pj-report">
        <div class="pj-report-head">
          <span>${escapeHTML(formatShortDateJa(report.created_at))}</span>
          ${report.author_name ? `<span>${escapeHTML(report.author_name)}</span>` : ""}
        </div>
        <div class="pj-report-body">${escapeHTML(report.body)}</div>
        ${report.image_url
          ? `<a href="${escapeHTML(report.image_url)}" target="_blank" rel="noopener"><img class="pj-report-image" src="${escapeHTML(report.image_url)}" alt="報告の写真" loading="lazy"></a>`
          : ""}
        ${(isAdmin || (currentUser && report.created_by === currentUser.id))
          ? `<button type="button" class="pj-mini-button" data-pj-action="delete-report" data-id="${escapeHTML(report.id)}">この報告を消す</button>`
          : ""}
      </li>`).join("")
    : '<li class="muted">まだ報告はありません。</li>';

  const reportForm = editable ? `
    <div class="pj-form">
      <label for="pj-report-${escapeHTML(id)}">報告を書く</label>
      <textarea id="pj-report-${escapeHTML(id)}" rows="3" lang="ja" placeholder="例：11/20 に打ち合わせをして、会場が決まりました。"></textarea>
      <input id="pj-report-image-${escapeHTML(id)}" type="file" accept="image/*">
      <label class="pj-inline-check">
        <input id="pj-report-notify-${escapeHTML(id)}" type="checkbox" checked> 正会員に通知する
      </label>
      <button type="button" class="primary-button" data-pj-action="add-report" data-id="${escapeHTML(id)}">報告を載せる</button>
    </div>` : "";

  // 進捗・予定（段階のチェックと、段階を足す）
  const stageBox = `
    <section class="pj-box">
      ${pjBoxHead(PJ_ICONS.chart, "いまの動き", editable ? "終わったら「済」にチェック。書き直しは鉛筆、消すときは×" : "")}
      <ul class="pj-checklist">${stageChecklist || '<li class="muted">まだ書かれていません。</li>'}</ul>
      ${editable ? `
      <div class="pj-add-stage-head">
        <label for="pj-new-stage-${escapeHTML(id)}">動きを書き足す</label>
        <button type="button" class="pj-add-button" data-pj-action="add-stage" data-id="${escapeHTML(id)}">${PJ_ICONS.plus}追加</button>
      </div>
      <input id="pj-new-stage-${escapeHTML(id)}" type="text" lang="ja" placeholder="例：備えリストメーカー作成中／12/5 ○○で打ち合わせ">` : ""}
    </section>`;

  const reportBox = `
    <section class="pj-box">
      ${pjBoxHead(PJ_ICONS.note, "活動の報告", "")}
      <ul class="pj-reports">${reportList}</ul>
      ${reportForm}
    </section>`;

  const editBox = editable ? `
    <section class="pj-box pj-form-box">
      ${pjBoxHead(PJ_ICONS.briefcase, "事業情報", "事業の様子を入力してください")}
      ${isAdmin ? `
      <label for="pj-name-${escapeHTML(id)}">事業の名前</label>
      <input id="pj-name-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.name || "")}">` : ""}
      <div class="pj-status-row">
        <label for="pj-status-${escapeHTML(id)}">状況</label>
        <select id="pj-status-${escapeHTML(id)}">
          ${PROJECT_STATUSES.map(status =>
            `<option value="${status}" ${status === project.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <label for="pj-next-date-${escapeHTML(id)}">次の予定の日付</label>
      ${pjField(PJ_ICONS.calendar, `<input id="pj-next-date-${escapeHTML(id)}" type="date" value="${escapeHTML(project.next_date || "")}">`)}
      <label for="pj-next-plan-${escapeHTML(id)}">次の予定</label>
      ${pjField(PJ_ICONS.pencil, `<input id="pj-next-plan-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.next_plan || "")}" placeholder="例：打ち合わせ">`)}
      <label for="pj-help-${escapeHTML(id)}">手伝ってほしいこと <small class="label-note">なければ空のまま</small></label>
      ${pjField(PJ_ICONS.person, `<input id="pj-help-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.help_wanted || "")}" placeholder="例：当日の受付をしてくれる人を2名">`)}
      <label for="pj-summary-${escapeHTML(id)}">どんな事業か（ひとこと）</label>
      <textarea id="pj-summary-${escapeHTML(id)}" rows="2" lang="ja" placeholder="事業の内容をかんたんに">${escapeHTML(project.summary || "")}</textarea>
      <label class="pj-inline-check">
        <input id="pj-update-notify-${escapeHTML(id)}" type="checkbox" checked> 正会員に通知する
      </label>
      <button type="button" class="primary-button pj-wide-button" data-pj-action="save-project" data-id="${escapeHTML(id)}">${PJ_ICONS.save}更新する</button>
    </section>` : "";

  const leadsBox = isAdmin ? `
    <section class="pj-box pj-form-box">
      ${pjBoxHead(PJ_ICONS.person, "担当者", "管理者だけが変更できます")}
      <p class="form-note">正会員から選んでください。選んだ人がカードに「担当」として出て、この事業の「いまの動き」や「事業情報」を書き直せるようになります。</p>
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

  return `
    <article class="project-card" id="project-${escapeHTML(id)}">
      <div class="pj-top">
        <span class="pj-icon">${projectIconFor(project.name)}</span>
        <div class="pj-main">
          <div class="pj-head">
            <h3 class="pj-name">${escapeHTML(project.name)}</h3>
            <span class="pj-status ${statusClass}">${escapeHTML(project.status)}</span>
          </div>

          <p class="pj-leads">
            <span class="pj-label">担当</span>
            ${leadNames.length
              ? leadNames.map(name => `<span class="pj-lead-chip">${escapeHTML(name)}</span>`).join("")
              : '<span class="pj-undecided">未定</span>'}
          </p>

          <div class="pj-now">
            <p class="pj-now-label">いまの動き</p>
            ${nowList}
          </div>
        </div>
      </div>

      ${project.summary ? `<p class="pj-summary">${escapeHTML(project.summary)}</p>` : ""}

      ${(project.next_date || project.next_plan)
        ? `<p class="pj-next"><span class="pj-label">次の予定</span>${escapeHTML(formatShortDateJa(project.next_date))} ${escapeHTML(project.next_plan || "")}</p>`
        : ""}

      ${project.help_wanted
        ? `<p class="pj-help">🙋 手伝ってほしいこと：${escapeHTML(project.help_wanted)}</p>`
        : ""}

      ${latest
        ? `<p class="pj-latest"><span class="pj-label">最新の報告</span>${escapeHTML(formatShortDateJa(latest.created_at))} ${escapeHTML(latest.body.length > 60 ? latest.body.slice(0, 60) + "…" : latest.body)}</p>`
        : ""}

      <details class="pj-details" data-project-id="${escapeHTML(id)}" ${openProjectIds.has(id) ? "open" : ""}>
        <summary>
          <span class="pj-sum-chevron">${PJ_ICONS.chevron}</span>
          <span class="pj-sum-open">くわしく見る</span>
          <span class="pj-sum-close">閉じる</span>
        </summary>
        <div class="pj-detail-body">
          ${stageBox}
          ${reportBox}
          ${editBox}
          ${leadsBox}
          <button type="button" class="pj-close-button" data-pj-action="close-details" data-id="${escapeHTML(id)}">${PJ_ICONS.chevron}閉じる</button>
        </div>
      </details>
    </article>`;
}

function setProjectMessage(text, error = false) {
  // 小さな案内は alert で十分（画面が長いため）
  if (error) alert(text);
}

async function saveProject(id) {
  const value = key => $(`pj-${key}-${id}`)?.value ?? "";

  const changes = {
    status: value("status"),
    next_date: value("next-date") || null,
    next_plan: value("next-plan").trim() || null,
    help_wanted: value("help").trim() || null,
    summary: value("summary").trim() || null,
    updated_at: new Date().toISOString()
  };

  const newName = value("name").trim();
  if (isAdmin && newName) changes.name = newName;

  const { error } = await db.from("projects").update(changes).eq("id", id);

  if (error) return setProjectMessage("更新できませんでした：" + error.message, true);

  if ($(`pj-update-notify-${id}`)?.checked) {
    const project = allProjects.find(item => String(item.id) === String(id));
    const note = await notifyMembers({
      heading: "防災Sowing 事業の更新",
      message: `${project?.name || "事業"}の様子が更新されました（${value("status")}）`,
      url: `${getAppUrl()}#project-${id}`,
      audience: "full"
    });
    if (note.includes("送れませんでした")) alert("更新しました。" + note);
  }

  openProjectIds.add(String(id));
  await loadProjects();
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

async function editStage(stageId) {
  const stage = projectStages.find(item => String(item.id) === String(stageId));
  if (!stage) return;
  const title = prompt("書き直してください。", stage.title || "");
  if (title === null || !title.trim() || title.trim() === stage.title) return;
  const { error } = await db.from("project_stages").update({ title: title.trim() }).eq("id", stageId);
  if (error) return setProjectMessage("書き直せませんでした：" + error.message, true);
  await loadProjects();
}

async function deleteStage(stageId) {
  if (!confirm("この動きを消しますか？")) return;
  const { error } = await db.from("project_stages").delete().eq("id", stageId);
  if (error) return setProjectMessage("消せませんでした：" + error.message, true);
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

    openProjectIds.add(String(projectId));
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
        </div>
        <select data-member-type="${escapeHTML(member.id)}" aria-label="${escapeHTML(member.display_name)}さんの種類">
          <option value="協働会員" ${member.member_type !== "正会員" ? "selected" : ""}>協働会員</option>
          <option value="正会員" ${member.member_type === "正会員" ? "selected" : ""}>正会員</option>
        </select>
        <div class="member-admin-actions">
          <button type="button" class="pj-mini-button" data-member-action="copy-invite" data-id="${escapeHTML(member.id)}">案内文</button>
          <button type="button" class="pj-mini-button" data-member-action="rename" data-id="${escapeHTML(member.id)}">名前を変える</button>
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
    "⑤ 「通知を受け取りますか？」と出たら「受け取る」を押し、続けて出る確認で「許可」を押してください",
    "イベントやお知らせの通知が届くようになります。",
    "（「あとで」を押した場合も、画面上の「通知を受け取る」ボタンからいつでもONにできます）",
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
   ボタンの設定
----------------------------- */

document.addEventListener("DOMContentLoaded", () => {
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
      case "save-project": saveProject(id); break;
      case "add-stage": addStage(id); break;
      case "delete-stage": deleteStage(id); break;
      case "edit-stage": editStage(id); break;
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
