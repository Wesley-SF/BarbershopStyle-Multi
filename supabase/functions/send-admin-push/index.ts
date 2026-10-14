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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const logEvent = (
  event: Record<string, unknown>,
  level: "info" | "error" = "info",
) => console[level](JSON.stringify(event));

const getErrorCategory = (statusCode: number) => {
  if (statusCode === 400) return "invalid_subscription_or_payload";
  if (statusCode === 401 || statusCode === 403) return "vapid_authentication";
  if (statusCode === 404 || statusCode === 410) return "subscription_expired";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "push_service_unavailable";
  if (statusCode === 0) return "network_or_unknown";
  return "push_service_error";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let appointmentId: string | number | null = null;
  let storeId: string | null = null;

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
    appointmentId = appointment.id ?? null;
    storeId = typeof appointment.store_id === "string" ? appointment.store_id : null;

    if (storeId === null || !uuidPattern.test(storeId)) {
      logEvent({
        event: "push_summary",
        appointment_id: appointmentId,
        store_id: storeId,
        subscriptions_found: 0,
        sent_successfully: 0,
        failed: 0,
        expired_removed: 0,
        outcome: "store_id_invalid",
      });
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
      .eq("store_id", storeId);

    if (subscriptionsError) throw subscriptionsError;

    const notification = JSON.stringify({
      title: "Novo agendamento",
      body: "Novo agendamento recebido. Abra o painel para ver os detalhes.",
      url: "/admin",
      tag: `appointment-${appointmentId}`,
      appointment_id: appointmentId,
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
          return { sent: true, expired: false, removed: false };
        } catch (error) {
          const statusCode = Number(
            (error as { statusCode?: number }).statusCode ?? 0,
          );
          const expired = statusCode === 404 || statusCode === 410;
          const errorCategory = getErrorCategory(statusCode);
          let removed = false;

          if (expired) {
            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id)
              .eq("store_id", storeId);
            removed = !deleteError;

            if (deleteError) {
              logEvent({
                event: "push_failure",
                appointment_id: appointmentId,
                store_id: storeId,
                http_status: statusCode,
                error_category: "expired_subscription_cleanup_failed",
              }, "error");
            }
          }

          logEvent({
            event: "push_failure",
            appointment_id: appointmentId,
            store_id: storeId,
            http_status: statusCode || null,
            error_category: errorCategory,
          }, "error");
          return { sent: false, expired, removed };
        }
      }),
    );

    const reports = results.map((result) => {
      if (result.status === "fulfilled") return result.value;

      logEvent({
        event: "push_failure",
        appointment_id: appointmentId,
        store_id: storeId,
        http_status: null,
        error_category: "unexpected_send_rejection",
      }, "error");
      return { sent: false, expired: false, removed: false };
    });

    const summary = {
      event: "push_summary",
      appointment_id: appointmentId,
      store_id: storeId,
      subscriptions_found: reports.length,
      sent_successfully: reports.filter((item) => item.sent).length,
      failed: reports.filter((item) => !item.sent).length,
      expired_removed: reports.filter((item) => item.removed).length,
    };
    logEvent(summary);

    return jsonResponse({
      subscriptions: summary.subscriptions_found,
      sent: summary.sent_successfully,
      failed: summary.failed,
      removed: summary.expired_removed,
    });
  } catch {
    logEvent({
      event: "push_failure",
      appointment_id: appointmentId,
      store_id: storeId,
      http_status: null,
      error_category: "function_error",
    }, "error");
    return jsonResponse({ error: "Não foi possível enviar as notificações." }, 500);
  }
});
