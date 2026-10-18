import {
  buildTrendEvidence,
  TREND_EVIDENCE_WINDOW_MS as WEEK,
  TREND_EVIDENCE_FRESHNESS_MS as FRESHNESS,
} from "./trend-evidence.mjs";

/** Pure walk-forward evaluation of persisted public corpus observations.
 * The caller must supply currently permission-filtered sources. Each signal
 * is reconstructed as of its observation date, without later snapshots.
 * The first independent follow-up 7–9 days later is selected, never the best
 * outcome. Counts and corpus shares must agree; mixed evidence is uncertain.
 */
export function buildTrendRetrospective(
  brand,
  { snapshots = [], sources = [], now = Date.now() } = {},
) {
  const history = Array.isArray(snapshots) ? snapshots : [];
  const current = buildTrendEvidence(brand, {
    snapshots: history,
    sources,
    now,
  });
  const nowMs = Date.parse(current.generatedAt);
  const signalStart =
    Math.floor(nowMs / 86_400_000) * 86_400_000 - 89 * 86_400_000;
  const baselineStart = signalStart - WEEK - FRESHNESS;
  const limits = {
    signalDays: 90,
    baselineDays: 9,
    signalWindowStart: new Date(signalStart).toISOString(),
    historyWindowStart: new Date(baselineStart).toISOString(),
    dailySelection: "latest_valid_with_all_timestamp_ties",
    selectedSnapshots: 0,
    observationDays: 0,
  };
  const counts = {
    inputSnapshots: history.length,
    matchingSnapshots: current.coverage.matchingSnapshots,
    risingSignals: 0,
    evaluated: 0,
    sustained: 0,
    reversal: 0,
    uncertain: 0,
    awaitingFollowUp: 0,
  };
  const evaluations = [];
  const fresh =
    current.currentWindow.observedAt &&
    nowMs - Date.parse(current.currentWindow.observedAt) <= FRESHNESS;
  if (fresh && current.scope.queryVerifiable && !brand.isDemo) {
    // Bound expensive walk-forward work by UTC day, not refresh timestamp.
    // Validate each complete day before choosing its latest admissible record;
    // tied conflicting records remain together for the evidence validator.
    const days = new Map();
    for (const item of history) {
      const time = Date.parse(item?.observedAt);
      if (
        !Number.isFinite(time) ||
        time > nowMs ||
        time < baselineStart ||
        item.scope !== current.scope.fingerprint ||
        (item.brandId && item.brandId !== brand.id)
      )
        continue;
      const day = new Date(time).toISOString().slice(0, 10);
      const group = days.get(day) || [];
      group.push(item);
      days.set(day, group);
    }
    const selected = [];
    for (const group of days.values()) {
      const time = Math.max(
        ...group.map((item) => Date.parse(item.observedAt)),
      );
      const report = buildTrendEvidence(brand, {
        sources,
        snapshots: group,
        now: time,
      });
      if (report.countOrigin !== "topic_snapshot") continue;
      const latest = report.currentWindow.observedAt;
      selected.push(
        ...group.filter(
          (item) => Date.parse(item.observedAt) === Date.parse(latest),
        ),
      );
    }
    limits.selectedSnapshots = selected.length;
    const dates = [
      ...new Set(selected.map((item) => Date.parse(item.observedAt))),
    ].sort((a, b) => a - b);
    limits.observationDays = dates.length;
    const observations = dates
      .map((time) => ({
        time,
        report: buildTrendEvidence(brand, {
          sources,
          snapshots: selected.filter(
            (item) => Date.parse(item.observedAt) <= time,
          ),
          now: time,
        }),
      }))
      .filter(
        ({ time, report }) =>
          Date.parse(report.currentWindow.observedAt) === time &&
          report.countOrigin === "topic_snapshot" &&
          report.scope.queryVerifiable,
      );
    // One topic trial per independent signal window. Daily refreshes must not
    // multiply a single observed rise into apparently independent successes.
    const lastSignal = new Map();
    for (const { time, report } of observations) {
      if (time < signalStart || report.status !== "comparable") continue;
      const baselineSize = report.comparison.previous.sampleSize;
      const signalSize = report.currentWindow.sampleSize;
      const later = observations.find(
        (item) =>
          item.time - time >= WEEK && item.time - time <= WEEK + FRESHNESS,
      );
      for (const topic of report.topics) {
        if (
          topic.direction !== "increased" ||
          topic.previousCount < 3 ||
          topic.currentCount < 3 ||
          !baselineSize ||
          !signalSize ||
          topic.currentCount / signalSize <=
            topic.previousCount / baselineSize ||
          time - (lastSignal.get(topic.topicKey) ?? -Infinity) < WEEK
        )
          continue;
        lastSignal.set(topic.topicKey, time);
        counts.risingSignals++;
        if (!later) {
          counts.awaitingFollowUp++;
          continue;
        }
        const followUpCount =
          later.report.topics.find((item) => item.topicKey === topic.topicKey)
            ?.currentCount || 0;
        const followUpSize = later.report.currentWindow.sampleSize;
        const signalShare = topic.currentCount / signalSize;
        const followUpShare = followUpSize
          ? followUpCount / followUpSize
          : null;
        const outcome =
          followUpSize < 3
            ? "uncertain"
            : followUpCount >= topic.currentCount &&
                followUpShare >= signalShare
              ? "sustained"
              : followUpCount < topic.currentCount &&
                  followUpShare < signalShare
                ? "reversal"
                : "uncertain";
        counts.evaluated++;
        counts[outcome]++;
        evaluations.push({
          topicKey: topic.topicKey,
          topic: topic.topic,
          outcome,
          baseline: {
            ...report.comparison.previous,
            count: topic.previousCount,
            share: topic.previousCount / baselineSize,
          },
          signal: {
            ...report.currentWindow,
            count: topic.currentCount,
            share: signalShare,
          },
          followUp: {
            ...later.report.currentWindow,
            count: followUpCount,
            share: followUpShare,
          },
        });
      }
    }
  }
  const status = counts.evaluated ? "evaluated" : "insufficient";
  return {
    version: 1,
    kind: "observed_corpus_frequency_retrospective",
    generatedAt: current.generatedAt,
    status,
    scope: current.scope,
    counts,
    limits,
    evaluations,
    findings: [
      {
        title: counts.evaluated
          ? "Revisión de señales anteriores"
          : "Historial insuficiente",
        detail: counts.evaluated
          ? `${counts.evaluated} señales revisadas: ${counts.sustained} sostuvieron su frecuencia, ${counts.reversal} retrocedieron y ${counts.uncertain} quedaron inciertas en el corpus. ${counts.awaitingFollowUp} pendientes de una observación posterior comparable.`
          : "Se necesitan tres ventanas independientes de 7 días con las mismas fuentes y consultas: una base, una subida y una observación posterior; la última observación debe tener 2 días o menos.",
      },
      {
        title: "Historial acotado",
        detail:
          "Últimos 90 días UTC y 9 días de base; última observación válida por día con todos sus empates. No representa todo el historial.",
      },
    ],
    limitations: [
      "Revisión limitada a los últimos 90 días UTC y 9 días adicionales de base; última observación válida diaria con todos los empates. No representa todo el historial.",
      "Revisión descriptiva de frecuencia en el corpus público observado; no mide atención social, rendimiento, causalidad ni capacidad predictiva.",
      "Subida inicial: al menos 3 referencias del tema en base y señal, con aumento tanto del número como de su proporción en el corpus. Se excluyen bases cero y muestras pequeñas.",
      "Se usa la primera observación posterior entre 7 y 9 días, sin solapamiento. Sostenida: número y proporción iguales o mayores; reversión: ambos menores; resultados mixtos o corpus posterior menor de 3: inciertos.",
      "Como máximo una señal por tema cada 7 días; las evaluaciones pueden compartir una ventana y no son ensayos estadísticamente independientes.",
      "Sólo historial persistido compatible y disponible hasta cada señal. Cambios de fuentes, consultas, permisos, clasificación o cobertura limitan la comparación; no se reconstruye evidencia ausente.",
    ],
  };
}
