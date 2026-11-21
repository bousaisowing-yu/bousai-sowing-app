// 防災Sowing 会員アプリ：プッシュ通知を送る Supabase Edge Function
//
// アプリ（管理者がログインした状態）から呼び出され、
// 管理者かどうかを確かめてから OneSignal に通知を頼みます。
// OneSignal の鍵はこの関数の「Secrets」にだけ置き、アプリには書きません。
//
// 必要な Secrets（Supabase の Edge Functions → Secrets で設定）
//   ONESIGNAL_APP_ID        … OneSignal の App ID
//   ONESIGNAL_REST_API_KEY  … OneSignal で新しく作った REST API キー（os_v2_app_ で始まる）
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で用意します。

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

  // 1. 呼び出した人が管理者か確かめる
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "ログインが必要です" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply({ error: "ログインが必要です" }, 401);

  const { data: adminRow, error: adminError } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminError) return reply({ error: "管理者の確認に失敗しました" }, 500);
  if (!adminRow) return reply({ error: "管理者だけが通知を送れます" }, 403);

  // 2. 送る内容を整える
  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch {
    return reply({ error: "送る内容が読み取れません" }, 400);
  }

  const heading = cleanText(input.heading, 60) || "防災Sowingからのお知らせ";
  const message = cleanText(input.message, 200);
  if (!message) return reply({ error: "通知の本文がありません" }, 400);

  // 開くページはこのアプリの中だけに限る
  let url = APP_URL;
  const requested = cleanText(input.url, 300);
  if (requested.startsWith(APP_URL)) url = requested;

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
      included_segments: ["Total Subscriptions"],
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
