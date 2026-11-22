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
    } catch (error) {
      console.error("通知の設定ができませんでした:", error);
    }
  });
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
  const doneCount = stages.filter(stage => stage.done).length;
  const percent = stages.length ? Math.round(doneCount / stages.length * 100) : 0;
  const editable = canEditProject(id);
  const latest = reports[0];
  const leadNames = (project.lead_names || []).filter(Boolean);

  const statusClass = PROJECT_STATUS_CLASS[project.status] || "pj-status-prep";

  const stepChips = stages.map(stage => `
    <li class="pj-step ${stage.done ? "done" : ""}">
      <span class="pj-step-mark">${stage.done ? "✓" : ""}</span>${escapeHTML(stage.title)}
    </li>`).join("");

  const stageChecklist = stages.map(stage => `
    <li class="pj-check-row">
      <label>
        <input type="checkbox" data-pj-stage="${escapeHTML(stage.id)}"
          ${stage.done ? "checked" : ""} ${editable ? "" : "disabled"}>
        <span>${escapeHTML(stage.title)}</span>
      </label>
      ${editable
        ? `<button type="button" class="pj-mini-button" data-pj-action="delete-stage" data-id="${escapeHTML(stage.id)}" aria-label="この段階を消す">×</button>`
        : ""}
    </li>`).join("");

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
      <h4>報告を書く</h4>
      <textarea id="pj-report-${escapeHTML(id)}" rows="3" lang="ja" placeholder="例：11/20 に打ち合わせをして、会場が決まりました。"></textarea>
      <input id="pj-report-image-${escapeHTML(id)}" type="file" accept="image/*">
      <label class="pj-inline-check">
        <input id="pj-report-notify-${escapeHTML(id)}" type="checkbox" checked> 正会員に通知する
      </label>
      <button type="button" class="primary-button" data-pj-action="add-report" data-id="${escapeHTML(id)}">報告を載せる</button>
    </div>` : "";

  const editForm = editable ? `
    <div class="pj-form">
      <h4>様子を更新する</h4>
      ${isAdmin ? `
      <label>事業の名前</label>
      <input id="pj-name-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.name || "")}">` : ""}
      <label>状況</label>
      <select id="pj-status-${escapeHTML(id)}">
        ${PROJECT_STATUSES.map(status =>
          `<option value="${status}" ${status === project.status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
      <label>次の予定の日付</label>
      <input id="pj-next-date-${escapeHTML(id)}" type="date" value="${escapeHTML(project.next_date || "")}">
      <label>次の予定</label>
      <input id="pj-next-plan-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.next_plan || "")}" placeholder="例：打ち合わせ">
      <label>手伝ってほしいこと <small class="label-note">なければ空のまま</small></label>
      <input id="pj-help-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(project.help_wanted || "")}" placeholder="例：当日の受付をしてくれる人を2名">
      <label>どんな事業か（ひとこと）</label>
      <textarea id="pj-summary-${escapeHTML(id)}" rows="2" lang="ja">${escapeHTML(project.summary || "")}</textarea>
      <label>段階を足す</label>
      <div class="pj-row">
        <input id="pj-new-stage-${escapeHTML(id)}" type="text" lang="ja" placeholder="例：会場の予約">
        <button type="button" class="secondary-button" data-pj-action="add-stage" data-id="${escapeHTML(id)}">追加</button>
      </div>
      <label class="pj-inline-check">
        <input id="pj-update-notify-${escapeHTML(id)}" type="checkbox" checked> 正会員に通知する
      </label>
      <button type="button" class="primary-button" data-pj-action="save-project" data-id="${escapeHTML(id)}">更新する</button>
    </div>` : "";

  const leadsForm = isAdmin ? `
    <div class="pj-form">
      <h4>担当者（管理者だけが変更できます）</h4>
      <label>表示する担当者の名前 <small class="label-note">「、」で区切って何人でも</small></label>
      <input id="pj-lead-names-${escapeHTML(id)}" type="text" lang="ja" value="${escapeHTML(leadNames.join("、"))}" placeholder="例：山田、佐藤、鈴木">
      <label>アプリでこの事業を更新できる人 <small class="label-note">正会員から選ぶ</small></label>
      <div class="pj-lead-options">
        ${fullMembersForAdmin().length
          ? fullMembersForAdmin().map(member => `
            <label class="pj-inline-check">
              <input type="checkbox" data-pj-lead="${escapeHTML(id)}" value="${escapeHTML(member.id)}"
                ${projectLeads.some(lead => String(lead.project_id) === id && lead.member_id === member.id) ? "checked" : ""}>
              ${escapeHTML(member.display_name)}
            </label>`).join("")
          : '<p class="form-note">正会員がまだいません。「会員」の画面で正会員にすると、ここに出ます。</p>'}
      </div>
      <button type="button" class="primary-button" data-pj-action="save-leads" data-id="${escapeHTML(id)}">担当者を保存</button>
      <button type="button" class="secondary-button danger-button" data-pj-action="delete-project" data-id="${escapeHTML(id)}">この事業を削除</button>
    </div>` : "";

  return `
    <article class="project-card" id="project-${escapeHTML(id)}">
      <div class="pj-head">
        <h3 class="pj-name">${escapeHTML(project.name)}</h3>
        <span class="pj-status ${statusClass}">${escapeHTML(project.status)}</span>
      </div>

      ${project.summary ? `<p class="pj-summary">${escapeHTML(project.summary)}</p>` : ""}

      <p class="pj-leads">
        <span class="pj-label">担当</span>
        ${leadNames.length
          ? leadNames.map(name => `<span class="pj-lead-chip">${escapeHTML(name)}</span>`).join("")
          : '<span class="muted">未定</span>'}
      </p>

      <div class="pj-progress" aria-label="進み具合 ${percent}%">
        <div class="pj-bar"><span style="width:${percent}%"></span></div>
        <span class="pj-percent">${percent}%</span>
      </div>
      ${stages.length ? `<ol class="pj-steps">${stepChips}</ol>` : ""}

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
        <summary>くわしく見る</summary>
        <h4>段階</h4>
        <ul class="pj-checklist">${stageChecklist || '<li class="muted">段階はまだありません。</li>'}</ul>
        <h4>活動の報告</h4>
        <ul class="pj-reports">${reportList}</ul>
        ${reportForm}
        ${editForm}
        ${leadsForm}
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
  if (error) setProjectMessage("段階を更新できませんでした：" + error.message, true);
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

  if (error) return setProjectMessage("段階を追加できませんでした：" + error.message, true);
  await loadProjects();
}

async function deleteStage(stageId) {
  if (!confirm("この段階を消しますか？")) return;
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

  const names = ($(`pj-lead-names-${projectId}`)?.value || "")
    .split(/[、,，\n]/)
    .map(name => name.trim())
    .filter(Boolean);

  const selected = [...document.querySelectorAll(`input[data-pj-lead="${CSS.escape(String(projectId))}"]:checked`)]
    .map(input => input.value);

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

  await db.from("project_stages").insert(
    ["企画", "準備", "実施", "ふり返り"].map((title, index) => ({
      project_id: data.id,
      title,
      sort_order: index + 1
    }))
  );

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

function fullMembersForAdmin() {
  return allMembersForAdmin.filter(member => member.member_type === "正会員" && member.active !== false);
}

function formatMemberCode(code) {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
}

async function loadMembersAdmin() {
  const root = $("members-admin-list");
  if (!root || !isAdmin) return;

  const [members, codes] = await Promise.all([
    db.from("members").select("*").order("created_at", { ascending: true }),
    db.from("member_codes").select("member_id,code")
  ]);

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
        </div>
        <select data-member-type="${escapeHTML(member.id)}" aria-label="${escapeHTML(member.display_name)}さんの種類">
          <option value="協働会員" ${member.member_type !== "正会員" ? "selected" : ""}>協働会員</option>
          <option value="正会員" ${member.member_type === "正会員" ? "selected" : ""}>正会員</option>
        </select>
        <div class="member-admin-actions">
          <button type="button" class="pj-mini-button" data-member-action="copy-invite" data-id="${escapeHTML(member.id)}">案内文</button>
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
    "⑤ 「通知を受け取りますか？」と出たら「許可」を押してください",
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

  const projectsRoot = $("projects-list");

  projectsRoot?.addEventListener("click", event => {
    const button = event.target.closest("button[data-pj-action]");
    if (!button) return;

    const id = button.dataset.id;

    switch (button.dataset.pjAction) {
      case "save-project": saveProject(id); break;
      case "add-stage": addStage(id); break;
      case "delete-stage": deleteStage(id); break;
      case "add-report": addReport(id, button); break;
      case "delete-report": deleteReport(id); break;
      case "save-leads": saveLeads(id); break;
      case "delete-project": deleteProject(id); break;
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
