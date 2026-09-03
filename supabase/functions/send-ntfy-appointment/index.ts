const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Secret ausente: ${name}`);
  }

  return value;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

const formatDateBR = (date: string) => {
  const [year, month, day] = String(date).split("-");

  return year && month && day
    ? `${day}/${month}/${year}`
    : date;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Método não permitido." },
      405,
    );
  }

  try {
    const webhookSecret = requiredEnv(
      "APPOINTMENTS_NTFY_WEBHOOK_SECRET",
    );

    if (
      request.headers.get("x-webhook-secret") !== webhookSecret
    ) {
      return jsonResponse(
        { error: "Não autorizado." },
        401,
      );
    }

    const payload = await request.json();

    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "appointments" ||
      !payload.record
    ) {
      return jsonResponse(
        { error: "Evento inválido." },
        400,
      );
    }

    const ntfyServer =
      Deno.env.get("NTFY_SERVER") ?? "https://ntfy.sh";

    const ntfyTopic = requiredEnv("NTFY_TOPIC");

    const appointment = payload.record;

    const message = [
      `Cliente: ${appointment.customer_name}`,
      `Serviço: ${appointment.service}`,
      `Data: ${formatDateBR(appointment.appointment_date)}`,
      `Horário: ${String(appointment.appointment_time).slice(0, 5)}`,
    ].join("\n");

    const response = await fetch(
      `${ntfyServer}/${ntfyTopic}`,
      {
        method: "POST",
        headers: {
          "Title": "Novo agendamento - Kallé Cortes",
          "Priority": "high",
          "Tags": "calendar,barber",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: message,
      },
    );

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("Erro retornado pelo ntfy:", {
        status: response.status,
        body: responseBody,
      });

      return jsonResponse(
        { error: "Não foi possível enviar a notificação." },
        502,
      );
    }

    return jsonResponse({
      success: true,
      message: "Notificação enviada.",
    });
  } catch (error) {
    console.error(
      "Erro na função send-ntfy-appointment:",
      error,
    );

    return jsonResponse(
      { error: "Erro interno ao enviar notificação." },
      500,
    );
  }
});