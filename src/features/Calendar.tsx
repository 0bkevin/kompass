import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Plus,
} from "lucide-react";
import { Badge, Button, EmptyState, IconButton } from "../components/ui";
import { download, formatNames, pieceStatusLabel } from "../lib/format";
import { calendarPlanDate } from "../lib/calendar-plan.mjs";
import { formatProviderAttributions } from "../lib/provider-attribution.mjs";
import type { Piece } from "../lib/types";
import { useWorkspace } from "../lib/workspace";
import { ScheduleModal } from "./Studio";
import "./calendar.css";

type CalendarMode = "month" | "week";
type ScheduledEntry = { piece: Piece; date: Date; key: string };
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const channelNames: Record<Piece["channel"], string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const fullDate = new Intl.DateTimeFormat("es", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
function startOfWeek(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function statusTone(status: Piece["status"]) {
  return status === "published" || status === "approved"
    ? "green"
    : status === "review"
      ? "amber"
      : "neutral";
}
function canSchedule(piece: Piece) {
  return piece.status === "approved" || piece.status === "scheduled";
}
function csvCell(raw: unknown) {
  let value = String(raw ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value))
    value = `'${value}`;
  return `"${value.replaceAll('"', '""')}"`;
}

export default function Calendar() {
  const { state, notify, navigate, search } = useWorkspace();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date()),
  );
  const [schedulePiece, setSchedulePiece] = useState<Piece | null>(null);
  const [showApproved, setShowApproved] = useState(true);
  const today = startOfDay(new Date()),
    todayKey = dateKey(today),
    selectedKey = dateKey(selectedDate);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const readonly = state.brand.role === "reviewer";
  const query = search.trim().toLocaleLowerCase("es");
  const matchesSearch = (piece: Piece) =>
    `${piece.title} ${piece.hook} ${piece.script} ${channelNames[piece.channel]} ${pieceStatusLabel(piece)}`
      .toLocaleLowerCase("es")
      .includes(query);
  const scheduled = useMemo<ScheduledEntry[]>(
    () =>
      state.pieces
        .flatMap((piece) => {
          const date = calendarPlanDate(piece);
          return date ? [{ piece, date, key: dateKey(date) }] : [];
        })
        .sort(
          (a, b) =>
            a.date.getTime() - b.date.getTime() ||
            a.piece.title.localeCompare(b.piece.title),
        ),
    [state.pieces],
  );
  const filtered = scheduled.filter((entry) => matchesSearch(entry.piece));
  const periodStart =
    mode === "month"
      ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      : startOfWeek(anchor);
  const periodEnd =
    mode === "month"
      ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
      : addDays(periodStart, 7);
  const gridStart = mode === "month" ? startOfWeek(periodStart) : periodStart;
  const days = Array.from({ length: mode === "month" ? 42 : 7 }, (_, index) =>
    addDays(gridStart, index),
  );
  const periodPieces = filtered.filter(
    ({ date }) => date >= periodStart && date < periodEnd,
  );
  const selectedPieces = filtered.filter((entry) => entry.key === selectedKey);
  const upcoming = filtered
    .filter(
      ({ date, piece }) =>
        date.getTime() >= Date.now() && piece.status !== "published",
    )
    .slice(0, 5);
  const approved = state.pieces
    .filter((piece) => piece.status === "approved" && matchesSearch(piece))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selectedWeek = startOfWeek(selectedDate),
    selectedWeekEnd = addDays(selectedWeek, 7);
  const weekCount = scheduled.filter(
    ({ date }) => date >= selectedWeek && date < selectedWeekEnd,
  ).length;
  const target = Math.max(0, Number(state.brand.weeklyTarget) || 0);
  const weekProgress = target
    ? Math.min(100, Math.round((weekCount / target) * 100))
    : 0;
  const currentWeek = dateKey(startOfWeek(today)) === dateKey(selectedWeek);
  const periodLabel =
    mode === "month"
      ? new Intl.DateTimeFormat("es", {
          month: "long",
          year: "numeric",
        }).format(anchor)
      : `${shortDate.format(periodStart)} — ${shortDate.format(addDays(periodEnd, -1))}, ${addDays(periodEnd, -1).getFullYear()}`;

  function selectDate(date: Date) {
    setSelectedDate(date);
    if (
      mode === "month" &&
      (date.getMonth() !== anchor.getMonth() ||
        date.getFullYear() !== anchor.getFullYear())
    )
      setAnchor(date);
  }
  function movePeriod(direction: number) {
    const next =
      mode === "month"
        ? new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
        : addDays(anchor, direction * 7);
    setAnchor(next);
    setSelectedDate(next);
  }
  function goToday() {
    setAnchor(today);
    setSelectedDate(today);
  }
  function changeMode(next: CalendarMode) {
    setAnchor(selectedDate);
    setMode(next);
  }
  function openSchedule(piece: Piece, chosenDate?: Date) {
    if (readonly || !canSchedule(piece)) return;
    if (chosenDate) {
      let scheduledFor = new Date(
        chosenDate.getFullYear(),
        chosenDate.getMonth(),
        chosenDate.getDate(),
        9,
      );
      if (scheduledFor.getTime() <= Date.now())
        scheduledFor = new Date(Date.now() + 3600000);
      setSchedulePiece({ ...piece, scheduledFor: scheduledFor.toISOString() });
    } else if (
      parseDate(piece.scheduledFor) &&
      Date.parse(piece.scheduledFor!) <= Date.now()
    )
      setSchedulePiece({
        ...piece,
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
      });
    else setSchedulePiece(piece);
  }
  function exportCalendar() {
    if (!periodPieces.length) {
      notify("No hay piezas para exportar en este periodo.", "error");
      return;
    }
    const headers = [
      "Fecha",
      "Hora",
      "Zona horaria",
      "Título",
      "Canal",
      "Formato",
      "Estado",
      "Audiencia",
      "Responsable",
      "Guion",
      "Caption",
      "Llamado a la acción",
      "Fuente de los datos",
    ];
    const rows = periodPieces.map(({ piece, date }) => [
      dateKey(date),
      timeFormat.format(date),
      timezone,
      piece.title,
      channelNames[piece.channel],
      formatNames[piece.format] || piece.format,
      pieceStatusLabel(piece),
      state.brand.audience.find((segment) => segment.id === piece.segmentId)
        ?.name || "Audiencia general",
      state.members.find((member) => member.id === piece.assignee)?.name || "",
      piece.script,
      piece.caption,
      piece.cta,
      formatProviderAttributions(
        state.references.find(
          (reference) => reference.id === piece.referenceId,
        ),
        piece,
        piece.editorialBrief,
      ),
    ]);
    const slug =
      state.brand.name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "marca";
    download(
      `grilla-${slug}-${dateKey(periodStart)}.csv`,
      "\uFEFF" +
        [headers, ...rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
    notify(
      `${periodPieces.length} ${periodPieces.length === 1 ? "pieza exportada" : "piezas exportadas"} del periodo visible${query ? " con tu búsqueda actual" : ""}.`,
    );
  }

  return (
    <div className="page calendar-page">
      <div className="page-heading">
        <div>
          <h1>Tu contenido, en su momento.</h1>
          <p>
            Dale espacio a las buenas ideas. Organiza la grilla y mantén al
            equipo en la misma página.
          </p>
        </div>
        <Button onClick={exportCalendar} disabled={!periodPieces.length}>
          <Download size={16} />
          Exportar CSV
        </Button>
      </div>

      <div className="calendar-summary">
        <div className="calendar-summary-copy">
          <span className="calendar-summary-icon">
            <CalendarDays size={22} />
          </span>
          <div>
            <strong>
              {periodPieces.length}{" "}
              {periodPieces.length === 1
                ? "pieza en tu grilla"
                : "piezas en tu grilla"}
            </strong>
            <span>
              {mode === "month" ? "Durante este mes" : "Durante esta semana"}
              {query ? " · Filtradas por tu búsqueda" : ""}
            </span>
          </div>
        </div>
        <div className="calendar-week-goal">
          <div>
            <span>
              {currentWeek
                ? "Esta semana"
                : `Semana del ${shortDate.format(selectedWeek)}`}
            </span>
            <strong>
              {weekCount}
              <span> / {target || "—"} piezas</span>
            </strong>
          </div>
          <div
            className="calendar-progress"
            role="progressbar"
            aria-label="Objetivo editorial de la semana seleccionada"
            aria-valuenow={weekCount}
            aria-valuemin={0}
            aria-valuemax={Math.max(target, weekCount, 1)}
          >
            <span style={{ width: `${weekProgress}%` }} />
          </div>
          <small>
            {target
              ? weekCount >= target
                ? "Objetivo de planificación alcanzado"
                : "Objetivo semanal de tu marca"
              : "Define tu objetivo desde Marca"}
          </small>
        </div>
      </div>

      <div className="calendar-layout">
        <section className="card calendar-board" aria-label="Grilla editorial">
          <div className="calendar-toolbar">
            <div className="calendar-period-navigation">
              <h2 aria-live="polite">{periodLabel}</h2>
              <div className="row">
                <IconButton
                  label={mode === "month" ? "Mes anterior" : "Semana anterior"}
                  onClick={() => movePeriod(-1)}
                >
                  <ChevronLeft size={17} />
                </IconButton>
                <IconButton
                  label={
                    mode === "month" ? "Mes siguiente" : "Semana siguiente"
                  }
                  onClick={() => movePeriod(1)}
                >
                  <ChevronRight size={17} />
                </IconButton>
                <button className="calendar-today-button" onClick={goToday}>
                  Hoy
                </button>
              </div>
            </div>
            <div
              className="tabs calendar-view-tabs"
              aria-label="Vista de calendario"
            >
              <button
                className={mode === "month" ? "active" : ""}
                aria-pressed={mode === "month"}
                onClick={() => changeMode("month")}
              >
                Mes
              </button>
              <button
                className={mode === "week" ? "active" : ""}
                aria-pressed={mode === "week"}
                onClick={() => changeMode("week")}
              >
                Semana
              </button>
            </div>
          </div>
          <div className="calendar-scroll">
            <div className={`calendar-grid-surface ${mode}`}>
              <div className="calendar-weekdays">
                {weekdays.map((day, index) => (
                  <span
                    key={day}
                    className={index > 4 ? "calendar-weekend-label" : ""}
                  >
                    {day}
                  </span>
                ))}
              </div>
              <div className="calendar-days">
                {days.map((day, index) => {
                  const key = dateKey(day),
                    isToday = key === todayKey,
                    isSelected = key === selectedKey,
                    outside =
                      mode === "month" && day.getMonth() !== anchor.getMonth(),
                    weekend = index % 7 > 4;
                  const entries = filtered.filter((entry) => entry.key === key),
                    limit = mode === "month" ? 3 : 6;
                  return (
                    <article
                      key={key}
                      className={`calendar-day ${outside ? "outside" : ""} ${weekend ? "weekend" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                      aria-label={fullDate.format(day)}
                    >
                      <button
                        className="calendar-day-heading"
                        aria-label={`Seleccionar ${fullDate.format(day)}${isToday ? ", hoy" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => selectDate(day)}
                      >
                        <span className="calendar-day-number">
                          {day.getDate()}
                        </span>
                        {isToday ? (
                          <small>Hoy</small>
                        ) : mode === "week" ? (
                          <small>{shortDate.format(day)}</small>
                        ) : null}
                        {entries.length > 0 && (
                          <span
                            className="calendar-day-count"
                            aria-label={`${entries.length} piezas`}
                          >
                            {entries.length}
                          </span>
                        )}
                      </button>
                      <div className="calendar-day-entries">
                        {entries.slice(0, limit).map(({ piece, date }) => (
                          <button
                            key={piece.id}
                            className={`calendar-event channel-${piece.channel} ${piece.status === "published" ? "published" : ""}`}
                            title={`${piece.title} · ${channelNames[piece.channel]} · ${timeFormat.format(date)} · ${pieceStatusLabel(piece)}`}
                            onClick={() => navigate("studio", piece.id)}
                          >
                            <span className="calendar-event-meta">
                              <i />
                              <span>{channelNames[piece.channel]}</span>
                              <time dateTime={piece.scheduledFor}>
                                {timeFormat.format(date)}
                              </time>
                            </span>
                            <strong>{piece.title}</strong>
                            {mode === "week" && (
                              <span className="calendar-event-state">
                                {piece.status === "published" && (
                                  <CheckCircle2 size={11} />
                                )}{" "}
                                {pieceStatusLabel(piece)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {entries.length > limit && (
                        <button
                          className="calendar-more"
                          onClick={() => selectDate(day)}
                        >
                          + {entries.length - limit}{" "}
                          {entries.length - limit === 1
                            ? "pieza más"
                            : "piezas más"}
                        </button>
                      )}
                      {mode === "week" && !entries.length && (
                        <div className="calendar-free-day">
                          <span>Espacio disponible</span>
                          {!readonly && day >= today && (
                            <button
                              onClick={() => {
                                selectDate(day);
                                setShowApproved(true);
                              }}
                              aria-label={`Ver piezas para agendar el ${fullDate.format(day)}`}
                            >
                              <Plus size={15} />
                              <span>Planificar</span>
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="calendar-board-footer">
            <span>
              <i className="calendar-legend-dot" />
              Fecha seleccionada
            </span>
            <span>Zona horaria: {timezone}</span>
          </div>
          {!scheduled.length && (
            <div className="calendar-first-plan">
              <CalendarClock size={20} />
              <div>
                <strong>La grilla empieza con una pieza aprobada.</strong>
                <p>
                  Elige una fecha y agenda contenido desde la bandeja de
                  aprobadas.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="calendar-sidebar">
          <section
            className="card calendar-selected-panel"
            aria-label="Piezas de la fecha seleccionada"
          >
            <div className="calendar-panel-heading">
              <div>
                <h2>
                  {shortDate.format(selectedDate)}
                  <span>
                    {new Intl.DateTimeFormat("es", { weekday: "long" }).format(
                      selectedDate,
                    )}
                  </span>
                </h2>
              </div>
              <span className="calendar-date-total">
                {selectedPieces.length}
              </span>
            </div>
            {selectedPieces.length ? (
              <div className="calendar-agenda-list">
                {selectedPieces.map(({ piece, date }) => (
                  <div className="calendar-agenda-item" key={piece.id}>
                    <div className="calendar-agenda-meta">
                      <span>
                        <Clock3 size={13} />
                        {timeFormat.format(date)}
                      </span>
                      <Badge tone={statusTone(piece.status)}>
                        {pieceStatusLabel(piece)}
                      </Badge>
                    </div>
                    <button
                      className="calendar-piece-title"
                      onClick={() => navigate("studio", piece.id)}
                    >
                      {piece.title}
                      <ArrowUpRight size={14} />
                    </button>
                    <div className="calendar-agenda-bottom">
                      <span
                        className={`calendar-channel channel-${piece.channel}`}
                      >
                        <i />
                        {channelNames[piece.channel]}
                      </span>
                      {!readonly && canSchedule(piece) && (
                        <button
                          className="text-button"
                          onClick={() => openSchedule(piece)}
                        >
                          Reprogramar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="calendar-selected-empty">
                <CalendarDays size={25} />
                <strong>
                  {query
                    ? "Sin coincidencias para esta fecha"
                    : "Una fecha con posibilidades"}
                </strong>
                <p>
                  {query
                    ? "Prueba otra búsqueda o selecciona otro día."
                    : "Elige una pieza aprobada para darle un lugar en tu plan."}
                </p>
              </div>
            )}
            {readonly ? (
              <p className="calendar-readonly-note">
                Tu rol de revisor permite consultar la grilla. Un editor puede
                agendar las piezas.
              </p>
            ) : selectedDate < today ? (
              <p className="calendar-readonly-note">
                Para agendar contenido nuevo, elige hoy o una fecha futura.
              </p>
            ) : null}
          </section>

          <section
            className="card calendar-approved-panel"
            aria-label="Piezas aprobadas sin fecha"
          >
            <button
              className="calendar-approved-toggle"
              aria-expanded={showApproved}
              onClick={() => setShowApproved(!showApproved)}
            >
              <span>
                <CheckCircle2 size={17} />
                Listas para agendar<Badge tone="green">{approved.length}</Badge>
              </span>
              <ChevronRight
                size={16}
                className={showApproved ? "expanded" : ""}
              />
            </button>
            {showApproved && (
              <div className="calendar-approved-content">
                {approved.length ? (
                  <>
                    <p className="small muted">
                      Aprobadas, esperando su momento.
                    </p>
                    <div className="calendar-approved-list">
                      {approved.map((piece) => (
                        <div className="calendar-approved-item" key={piece.id}>
                          <button
                            className="calendar-piece-title"
                            onClick={() => navigate("studio", piece.id)}
                          >
                            {piece.title}
                          </button>
                          <div className="calendar-agenda-bottom">
                            <span className="small muted">
                              {channelNames[piece.channel]} ·{" "}
                              {formatNames[piece.format]}
                            </span>
                            {!readonly && (
                              <button
                                className="calendar-schedule-button"
                                disabled={selectedDate < today}
                                onClick={() =>
                                  openSchedule(piece, selectedDate)
                                }
                                aria-label={`Agendar ${piece.title} el ${shortDate.format(selectedDate)}`}
                              >
                                <Plus size={13} />
                                Agendar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="calendar-approved-empty">
                    <p>
                      {query
                        ? "No hay piezas aprobadas que coincidan con tu búsqueda."
                        : "Las piezas aprobadas sin fecha aparecerán aquí."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("studio")}
                    >
                      Ir al estudio
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="calendar-publication-note">
            <CalendarClock size={18} />
            <div>
              <strong>Planifica aquí. Publica a tu ritmo.</strong>
              <p>
                Abre la pieza para usar Enviar ahora con un conector, o exporta
                y publica desde tu canal. Confirma la publicación final y
                registra el enlace y las métricas en Resultados.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section className="card calendar-upcoming">
        <div className="section-heading">
          <div>
            <h2>Próximas en salir</h2>
          </div>
          <span className="small muted">Tu siguiente contenido, en orden</span>
        </div>
        {upcoming.length ? (
          <div className="calendar-upcoming-list">
            {upcoming.map(({ piece, date }) => (
              <div className="calendar-upcoming-item" key={piece.id}>
                <div
                  className={`calendar-upcoming-date ${dateKey(date) === todayKey ? "is-today" : ""}`}
                >
                  <strong>{date.getDate()}</strong>
                  <span>
                    {new Intl.DateTimeFormat("es", { month: "short" }).format(
                      date,
                    )}
                  </span>
                </div>
                <button
                  className="calendar-upcoming-piece"
                  onClick={() => navigate("studio", piece.id)}
                >
                  <strong>{piece.title}</strong>
                  <span>
                    {channelNames[piece.channel]} · {formatNames[piece.format]}{" "}
                    · {timeFormat.format(date)}
                  </span>
                </button>
                <Badge tone={statusTone(piece.status)}>
                  {pieceStatusLabel(piece)}
                </Badge>
                {!readonly && canSchedule(piece) && (
                  <IconButton
                    label={`Reprogramar ${piece.title}`}
                    onClick={() => openSchedule(piece)}
                  >
                    <CalendarClock size={17} />
                  </IconButton>
                )}
                <IconButton
                  label={`Abrir ${piece.title} en el estudio`}
                  onClick={() => navigate("studio", piece.id)}
                >
                  <ArrowUpRight size={17} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarClock size={24} />}
            title={
              query
                ? "No hay próximas piezas con esta búsqueda"
                : "Tu próximo contenido tiene espacio"
            }
            action={
              <Button onClick={() => navigate("studio")}>
                Ver el estudio
                <ArrowUpRight size={14} />
              </Button>
            }
          >
            {query
              ? "Prueba con otro título o canal para encontrar lo que buscas."
              : "Aprueba una pieza en el estudio y elige cuándo quieres publicarla."}
          </EmptyState>
        )}
      </section>
      {schedulePiece && (
        <ScheduleModal
          piece={schedulePiece}
          onClose={() => setSchedulePiece(null)}
        />
      )}
    </div>
  );
}
