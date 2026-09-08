import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const days = [
  { key: "1", label: "Segunda-feira" },
  { key: "2", label: "Terça-feira" },
  { key: "3", label: "Quarta-feira" },
  { key: "4", label: "Quinta-feira" },
  { key: "5", label: "Sexta-feira" },
  { key: "6", label: "Sábado" },
  { key: "0", label: "Domingo" },
];

function normalizeHours(businessHours = {}) {
  return Object.fromEntries(
    days.map(({ key }) => [
      key,
      {
        open: Boolean(businessHours[key]),
        start: businessHours[key]?.start ?? "08:00",
        end: businessHours[key]?.end ?? "18:00",
      },
    ]),
  );
}

function StoreOperationalSettings({ storeId }) {
  const [hours, setHours] = useState(() => normalizeHours());
  const [slotInterval, setSlotInterval] = useState("10");
  const [minimumNotice, setMinimumNotice] = useState("30");
  const [timezone, setTimezone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    let isCancelled = false;

    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("stores")
        .select("business_hours, slot_interval_minutes, minimum_booking_notice_minutes, timezone")
        .eq("id", storeId)
        .single();

      if (isCancelled) return;
      if (error) {
        console.error("Erro ao carregar configurações operacionais:", error);
        setFeedback({ type: "error", message: "Não foi possível carregar as configurações." });
      } else {
        setHours(normalizeHours(data.business_hours));
        setSlotInterval(String(data.slot_interval_minutes));
        setMinimumNotice(String(data.minimum_booking_notice_minutes));
        setTimezone(data.timezone);
      }
      setIsLoading(false);
    };

    void fetchSettings();
    return () => {
      isCancelled = true;
    };
  }, [storeId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const interval = Number(slotInterval);
    const notice = Number(minimumNotice);
    if (!Number.isInteger(interval) || interval < 1 || interval > 240) {
      setFeedback({ type: "error", message: "O intervalo deve ter entre 1 e 240 minutos." });
      return;
    }
    if (!Number.isInteger(notice) || notice < 0 || notice > 10080) {
      setFeedback({ type: "error", message: "A antecedência deve ter entre 0 e 10080 minutos." });
      return;
    }

    const businessHours = {};
    for (const { key, label } of days) {
      const day = hours[key];
      if (!day.open) continue;
      if (!day.start || !day.end || day.start >= day.end) {
        setFeedback({ type: "error", message: `Revise os horários de ${label}.` });
        return;
      }
      businessHours[key] = { start: day.start, end: day.end };
    }

    setIsSaving(true);
    setFeedback({ type: "", message: "" });
    const { data, error } = await supabase
      .from("stores")
      .update({
        business_hours: businessHours,
        slot_interval_minutes: interval,
        minimum_booking_notice_minutes: notice,
      })
      .eq("id", storeId)
      .select("business_hours, slot_interval_minutes, minimum_booking_notice_minutes")
      .single();

    if (error) {
      console.error("Erro ao salvar configurações operacionais:", error);
      setFeedback({ type: "error", message: "Não foi possível salvar as configurações." });
    } else {
      setHours(normalizeHours(data.business_hours));
      setSlotInterval(String(data.slot_interval_minutes));
      setMinimumNotice(String(data.minimum_booking_notice_minutes));
      setFeedback({ type: "success", message: "Configurações salvas com sucesso." });
    }
    setIsSaving(false);
  };

  if (isLoading) return <p className="admin-state" role="status">Carregando configurações...</p>;

  return (
    <section className="admin-management-section" aria-labelledby="store-settings-title">
      <div className="schedule-blocks-heading">
        <div>
          <p className="eyebrow">Operação</p>
          <h2 id="store-settings-title">Configurações da agenda</h2>
        </div>
        <p>Defina quando novos agendamentos podem ser realizados.</p>
      </div>

      <form className="store-settings-form" onSubmit={handleSubmit}>
        <fieldset className="business-hours-fieldset">
          <legend>Horários de funcionamento</legend>
          <div className="business-hours-editor">
            {days.map(({ key, label }) => {
              const day = hours[key];
              return (
                <div className="business-hours-row" key={key}>
                  <label className="schedule-block-checkbox">
                    <input
                      type="checkbox"
                      checked={day.open}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [key]: { ...current[key], open: event.target.checked },
                        }))
                      }
                    />
                    {label}
                  </label>
                  <div className="business-hours-times">
                    <input
                      aria-label={`Abertura de ${label}`}
                      type="time"
                      disabled={!day.open}
                      required={day.open}
                      value={day.start}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [key]: { ...current[key], start: event.target.value },
                        }))
                      }
                    />
                    <span>até</span>
                    <input
                      aria-label={`Fechamento de ${label}`}
                      type="time"
                      disabled={!day.open}
                      required={day.open}
                      value={day.end}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [key]: { ...current[key], end: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="store-rules-grid">
          <div className="form-field">
            <label htmlFor="slot-interval">Intervalo da agenda</label>
            <input
              id="slot-interval"
              type="number"
              min="1"
              max="240"
              step="1"
              required
              value={slotInterval}
              onChange={(event) => setSlotInterval(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="minimum-notice">Antecedência mínima em minutos</label>
            <input
              id="minimum-notice"
              type="number"
              min="0"
              max="10080"
              step="1"
              required
              value={minimumNotice}
              onChange={(event) => setMinimumNotice(event.target.value)}
            />
          </div>
        </div>

        <p className="business-hours-note">Fuso horário: <strong>{timezone}</strong></p>
        {feedback.message && (
          <p className={`admin-feedback admin-feedback--${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>
        )}
        <button className="schedule-block-submit" type="submit" disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </section>
  );
}

export default StoreOperationalSettings;
