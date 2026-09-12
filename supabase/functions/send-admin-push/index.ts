import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const formatDateBR = (date: string) => {
  const [year, month, day] = String(date).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const webhookSecret = requiredEnv("APPOINTMENTS_WEBHOOK_SECRET");
    if (request.headers.get("x-webhook-secret") !== webhookSecret) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const payload = await request.json();
    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "appointments" ||
      !payload.record
    ) {
      return jsonResponse({ error: "Evento inválido." }, 400);
    }

    const appointment = payload.record;
    if (
      typeof appointment.store_id !== "string" ||
      !uuidPattern.test(appointment.store_id)
    ) {
      return jsonResponse({ success: true, sent: 0, reason: "STORE_ID_INVALID" });
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    webpush.setVapidDetails(
      requiredEnv("VAPID_SUBJECT"),
      requiredEnv("VAPID_PUBLIC_KEY"),
      requiredEnv("VAPID_PRIVATE_KEY"),
    );

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("role", "admin")
      .eq("store_id", appointment.store_id);

    if (subscriptionsError) throw subscriptionsError;

    const notification = JSON.stringify({
      title: "Novo agendamento",
      body: `${appointment.customer_name} — ${appointment.service}, ${formatDateBR(appointment.appointment_date)} às ${String(appointment.appointment_time).slice(0, 5)}`,
      url: "/admin",
      tag: `appointment-${appointment.id}`,
    });

    const results = await Promise.allSettled(
      (subscriptions ?? []).map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            notification,
            { TTL: 300 },
          );
          return { id: subscription.id, sent: true, expired: false };
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
          const expired = statusCode === 404 || statusCode === 410;
          if (expired) {
            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id)
              .eq("store_id", appointment.store_id);
            if (deleteError) console.error("Erro ao remover assinatura expirada:", deleteError);
          } else {
            console.error("Erro ao enviar Web Push:", {
              subscriptionId: subscription.id,
              statusCode,
            });
          }
          return { id: subscription.id, sent: false, expired, statusCode };
        }
      }),
    );

    const reports = results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { sent: false, expired: false },
    );

    return jsonResponse({
      subscriptions: reports.length,
      sent: reports.filter((item) => item.sent).length,
      failed: reports.filter((item) => !item.sent).length,
      removed: reports.filter((item) => item.expired).length,
    });
  } catch (error) {
    console.error("Erro na função send-admin-push:", error);
    return jsonResponse({ error: "Não foi possível enviar as notificações." }, 500);
  }
});
