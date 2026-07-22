import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

function parseAppointmentDate(date, time) {
  return new Date(`${date}T${time || "00:00:00"}`);
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(year, month - 1, day),
  );
}

const statusLabels = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

function translateStatus(status) {
  return statusLabels[status] ?? status ?? "—";
}

function getStatusClass(status) {
  return statusLabels[status] ? `status-badge--${status}` : "status-badge--default";
}

function Admin() {
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const fetchAppointments = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id, customer_name, customer_phone, service, appointment_date, appointment_time, status",
          )
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true });

        if (isCancelled) {
          return;
        }

        if (error) {
          console.error("Erro ao carregar agendamentos:", error);
          setAppointments([]);
          setErrorMessage("Não foi possível carregar os agendamentos.");
          return;
        }

        const now = new Date();
        const futureAppointments = [];
        const pastAppointments = [];

        for (const appointment of data ?? []) {
          const appointmentDate = parseAppointmentDate(
            appointment.appointment_date,
            appointment.appointment_time,
          );

          if (appointmentDate >= now) {
            futureAppointments.push(appointment);
          } else {
            pastAppointments.push(appointment);
          }
        }

        setAppointments([...futureAppointments, ...pastAppointments]);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error("Erro inesperado ao carregar agendamentos:", error);
        setAppointments([]);
        setErrorMessage("Não foi possível carregar os agendamentos.");
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAppointments();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="app-shell admin-shell">
      <header className="site-header admin-header">
        <Link className="brand notranslate" to="/" translate="no">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BarbershopStyle</span>
        </Link>
        <Link className="admin-link" to="/">Novo agendamento</Link>
      </header>

      <main id="main-content" className="admin-page">
        <div className="admin-intro">
          <p className="eyebrow">Administração</p>
          <h1>Agendamentos</h1>
          <p className="intro-text">Consulte os próximos atendimentos da barbearia.</p>
        </div>

        {isLoading && (
          <p className="admin-state" role="status">Carregando agendamentos...</p>
        )}

        {!isLoading && errorMessage && (
          <p className="admin-state admin-state--error" role="alert">
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && appointments.length === 0 && (
          <p className="admin-state">Nenhum agendamento encontrado.</p>
        )}

        {!isLoading && !errorMessage && appointments.length > 0 && (
          <div className="appointments-list" role="table" aria-label="Agendamentos">
            <div className="appointments-header" role="row">
              <span role="columnheader">Cliente</span>
              <span role="columnheader">Telefone</span>
              <span role="columnheader">Serviço</span>
              <span role="columnheader">Data</span>
              <span role="columnheader">Horário</span>
              <span role="columnheader">Status</span>
            </div>

            {appointments.map((appointment) => (
              <div className="appointment-row" role="row" key={appointment.id}>
                <span role="cell" data-label="Cliente">{appointment.customer_name}</span>
                <span role="cell" data-label="Telefone">{appointment.customer_phone}</span>
                <span role="cell" data-label="Serviço">{appointment.service}</span>
                <span role="cell" data-label="Data">
                  {formatDate(appointment.appointment_date)}
                </span>
                <span role="cell" data-label="Horário">
                  {appointment.appointment_time.slice(0, 5)}
                </span>
                <span role="cell" data-label="Status">
                  <span className={`status-badge ${getStatusClass(appointment.status)}`}>
                    {translateStatus(appointment.status)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default Admin;
