import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../utils/time";

const emptyForm = { name: "", duration_minutes: "" };

function AdminServices({ storeId }) {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    let isCancelled = false;

    const fetchServices = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes, active, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });

      if (isCancelled) return;

      if (error) {
        console.error("Erro ao carregar serviços administrativos:", error);
        setFeedback({ type: "error", message: "Não foi possível carregar os serviços." });
      } else {
        setServices(data ?? []);
      }
      setIsLoading(false);
    };

    void fetchServices();
    return () => {
      isCancelled = true;
    };
  }, [storeId]);

  const validateForm = () => {
    const duration = Number(form.duration_minutes);
    if (!form.name.trim()) return "Informe o nome do serviço.";
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
      return "Informe uma duração entre 1 e 1440 minutos.";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFeedback({ type: "error", message: validationError });
      return;
    }

    const payload = {
      name: form.name.trim(),
      duration_minutes: Number(form.duration_minutes),
    };
    setSavingId(editingId ?? "new");
    setFeedback({ type: "", message: "" });

    const query = editingId
      ? supabase
          .from("services")
          .update(payload)
          .eq("id", editingId)
          .eq("store_id", storeId)
      : supabase.from("services").insert({ ...payload, store_id: storeId });
    const { data, error } = await query
      .select("id, name, duration_minutes, active, created_at")
      .single();

    if (error) {
      console.error("Erro ao salvar serviço:", error);
      const duplicate = error.code === "23505";
      setFeedback({
        type: "error",
        message: duplicate
          ? "Já existe um serviço com esse nome."
          : "Não foi possível salvar o serviço.",
      });
    } else {
      setServices((current) =>
        editingId
          ? current.map((service) => (service.id === data.id ? data : service))
          : [...current, data],
      );
      setForm(emptyForm);
      setEditingId(null);
      setFeedback({ type: "success", message: "Serviço salvo com sucesso." });
    }
    setSavingId(null);
  };

  const handleToggleActive = async (service) => {
    setSavingId(service.id);
    setFeedback({ type: "", message: "" });
    const { data, error } = await supabase
      .from("services")
      .update({ active: !service.active })
      .eq("id", service.id)
      .eq("store_id", storeId)
      .select("id, name, duration_minutes, active, created_at")
      .single();

    if (error) {
      console.error("Erro ao alterar status do serviço:", error);
      setFeedback({ type: "error", message: "Não foi possível alterar o serviço." });
    } else {
      setServices((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
      setFeedback({
        type: "success",
        message: data.active ? "Serviço ativado." : "Serviço desativado.",
      });
    }
    setSavingId(null);
  };

  const handleDelete = async (service) => {
    if (service.active) {
      setFeedback({
        type: "error",
        message: "Desative o serviço antes de excluí-lo.",
      });
      return;
    }
    if (!window.confirm(`Excluir o serviço “${service.name}”?`)) return;

    setSavingId(service.id);
    const { data, error } = await supabase
      .from("services")
      .delete()
      .eq("id", service.id)
      .eq("store_id", storeId)
      .select("id");

    if (error || !data?.some((item) => item.id === service.id)) {
      if (error) console.error("Erro ao excluir serviço:", error);
      setFeedback({ type: "error", message: "Não foi possível excluir o serviço." });
    } else {
      setServices((current) => current.filter((item) => item.id !== service.id));
      if (editingId === service.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setFeedback({ type: "success", message: "Serviço excluído." });
    }
    setSavingId(null);
  };

  const startEditing = (service) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      duration_minutes: String(service.duration_minutes),
    });
    setFeedback({ type: "", message: "" });
  };

  return (
    <section className="admin-management-section" aria-labelledby="admin-services-title">
      <div className="schedule-blocks-heading">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h2 id="admin-services-title">Serviços</h2>
        </div>
        <p>Defina os serviços oferecidos e a duração de cada atendimento.</p>
      </div>

      <form className="admin-management-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="service-name">Nome do serviço</label>
          <input
            id="service-name"
            maxLength="120"
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="form-field">
          <label htmlFor="service-duration">Duração em minutos</label>
          <input
            id="service-duration"
            type="number"
            min="1"
            max="1440"
            step="1"
            required
            value={form.duration_minutes}
            onChange={(event) =>
              setForm((current) => ({ ...current, duration_minutes: event.target.value }))
            }
          />
        </div>
        <div className="admin-management-form-actions">
          <button className="schedule-block-submit" disabled={savingId !== null} type="submit">
            {savingId === (editingId ?? "new")
              ? "Salvando..."
              : editingId
                ? "Salvar alterações"
                : "Adicionar serviço"}
          </button>
          {editingId && (
            <button
              className="admin-secondary-action"
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {feedback.message && (
        <p className={`admin-feedback admin-feedback--${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
          {feedback.message}
        </p>
      )}
      {isLoading && <p className="admin-state" role="status">Carregando serviços...</p>}
      {!isLoading && services.length === 0 && <p className="admin-state">Nenhum serviço cadastrado.</p>}
      {!isLoading && services.length > 0 && (
        <div className="admin-service-cards">
          {services.map((service) => (
            <article className="admin-service-card" key={service.id}>
              <div className="admin-service-card-heading">
                <div>
                  <h3>{service.name}</h3>
                  <p>{formatDuration(service.duration_minutes)}</p>
                </div>
                <span className={`status-badge status-badge--${service.active ? "confirmed" : "cancelled"}`}>
                  {service.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="admin-service-actions">
                <button type="button" disabled={savingId !== null} onClick={() => startEditing(service)}>
                  Editar
                </button>
                <button type="button" disabled={savingId !== null} onClick={() => handleToggleActive(service)}>
                  {service.active ? "Desativar" : "Ativar"}
                </button>
                <button type="button" disabled={savingId !== null || service.active} onClick={() => handleDelete(service)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AdminServices;
