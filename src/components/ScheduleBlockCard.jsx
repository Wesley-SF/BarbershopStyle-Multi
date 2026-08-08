import { formatDateBR } from "../utils/date";

function ScheduleBlockCard({ scheduleBlock, isRemoving, onRemove }) {
  return (
    <article className="schedule-block-card">
      <div>
        <p className="schedule-block-date">{formatDateBR(scheduleBlock.block_date)}</p>
        <p className="schedule-block-period">
          {scheduleBlock.all_day
            ? "Dia inteiro"
            : `${scheduleBlock.start_time.slice(0, 5)} às ${scheduleBlock.end_time.slice(0, 5)}`}
        </p>
        {scheduleBlock.reason && (
          <p className="schedule-block-reason">Motivo: {scheduleBlock.reason}</p>
        )}
      </div>
      <button
        className="schedule-block-remove"
        type="button"
        disabled={isRemoving}
        onClick={() => onRemove(scheduleBlock.id)}
      >
        {isRemoving ? "Removendo..." : "Remover bloqueio"}
      </button>
    </article>
  );
}

export default ScheduleBlockCard;
