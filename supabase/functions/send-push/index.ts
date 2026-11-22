// 防災Sowing 会員アプリ：プッシュ通知を送る Supabase Edge Function
//
// アプリから呼び出され、管理者（または正会員向けの通知なら正会員）か
// どうかを確かめてから OneSignal に通知を頼みます。
// OneSignal の鍵はこの関数の「Secrets」にだけ置き、アプリには書きません。
//
// 必要な Secrets（Supabase の Edge Functions → Secrets で設定）
//   ONESIGNAL_APP_ID        … OneSignal の App ID
//   ONESIGNAL_REST_API_KEY  … OneSignal で新しく作った REST API キー（os_v2_app_ で始まる）
// SUPABASE_URL は Supabase が自動で用意します。

import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://bousaisowing-yu.github.io/bousai-sowing-app/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!appId || !apiKey) {
    return reply({ error: "通知の鍵がまだ設定されていません（Secrets を確認してください）" }, 500);
  }

  // 1. 呼び出した人を確かめる
  //    アプリから届いた本人のログイン情報（と公開用キー）をそのまま使って、
  //    データベースの関数 is_admin() / is_full_member() に聞く
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return reply({ error: "ログインが必要です" }, 401);

  const apiKeyHeader =
    req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    "";

  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, apiKeyHeader, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  // 2. 送る内容を読み取る
  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch {
    return reply({ error: "送る内容が読み取れません" }, 400);
  }

  // audience: "all"（全員）／"full"（正会員だけ）／"leads"（その事業の担当者だけ）
  const audience = input.audience === "full" || input.audience === "leads" ? input.audience : "all";

  const { data: isAdmin, error: adminError } = await asCaller.rpc("is_admin");
  if (adminError) {
    console.error("is_admin error", adminError);
    return reply({ error: `管理者の確認に失敗しました（${adminError.message}）` }, 500);
  }

  if (!isAdmin) {
    // 正会員は「正会員だけ」への通知（事業の報告など）なら送れる
    const { data: isFull } = await asCaller.rpc("is_full_member");
    if (audience === "all" || !isFull) {
      return reply({ error: "この通知を送る権限がありません" }, 403);
    }
  }

  const heading = cleanText(input.heading, 60) || "防災Sowingからのお知らせ";
  const message = cleanText(input.message, 200);
  if (!message) return reply({ error: "通知の本文がありません" }, 400);

  // 開くページはこのアプリの中だけに限る
  let url = APP_URL;
  const requested = cleanText(input.url, 300);
  if (requested.startsWith(APP_URL)) url = requested;

  // 「担当者だけ」のときは、その事業の担当者（会員の番号）を調べる。自分には送らない
  let leadIds: string[] = [];
  if (audience === "leads") {
    const projectId = cleanText(input.project_id, 80);
    if (!projectId) return reply({ error: "事業が指定されていません" }, 400);

    const { data: leads, error: leadsError } = await asCaller
      .from("project_leads")
      .select("member_id")
      .eq("project_id", projectId);
    if (leadsError) return reply({ error: `担当者を調べられませんでした（${leadsError.message}）` }, 500);

    const { data: me } = await asCaller.rpc("get_my_member");
    const myId = (Array.isArray(me) ? me[0] : me)?.id;

    leadIds = (leads ?? [])
      .map((row: { member_id: string }) => String(row.member_id))
      .filter((id) => id && id !== myId);

    if (!leadIds.length) return reply({ ok: true, id: null, sent: false, reason: "no_leads" });
  }

  // 3. OneSignal に送信を頼む
  const res = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Key ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: "push",
      ...(audience === "leads"
        // 担当者の端末だけ（アプリがログイン時に会員の番号で結びつけている）
        ? { include_aliases: { external_id: leadIds } }
        : audience === "full"
        // 正会員としてログインした端末だけ（アプリがログイン時に印を付ける）
        ? { filters: [{ field: "tag", key: "member_type", relation: "=", value: "full" }] }
        : { included_segments: ["Total Subscriptions"] }),
      headings: { en: heading, ja: heading },
      contents: { en: message, ja: message },
      url,
    }),
  });

  const result = await res.json().catch(() => ({}));
  const errors: string[] = Array.isArray(result?.errors) ? result.errors.map(String) : [];

  // 通知を許可している人がまだ1人もいないとき
  if (res.ok && !result.id && errors.some((e) => /not subscribed/i.test(e))) {
    return reply({ ok: true, id: null, sent: false, reason: "no_subscribers" });
  }

  if (!res.ok || (errors.length && !result.id)) {
    console.error("OneSignal error", res.status, result);
    const detail = errors.length ? errors.join(" / ") : `status ${res.status}`;
    return reply({ error: `OneSignal が通知を受け付けませんでした（${detail}）` }, 502);
  }

  // id が空のときは「届け先が0人」
  return reply({ ok: true, id: result.id ?? null, sent: !!result.id });
});
