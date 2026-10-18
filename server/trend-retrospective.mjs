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
    const dates = [
      ...new Set(
        history
          .filter((item) => item && typeof item === "object")
          .map((item) => Date.parse(item.observedAt))
          .filter((time) => Number.isFinite(time) && time <= nowMs),
      ),
    ].sort((a, b) => a - b);
    const observations = dates
      .map((time) => ({
        time,
        report: buildTrendEvidence(brand, {
          sources,
          snapshots: history.filter(
            (item) => Date.parse(item?.observedAt) <= time,
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
      if (report.status !== "comparable") continue;
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
    ],
    limitations: [
      "Revisión descriptiva de frecuencia en el corpus público observado; no mide atención social, rendimiento, causalidad ni capacidad predictiva.",
      "Subida inicial: al menos 3 referencias del tema en base y señal, con aumento tanto del número como de su proporción en el corpus. Se excluyen bases cero y muestras pequeñas.",
      "Se usa la primera observación posterior entre 7 y 9 días, sin solapamiento. Sostenida: número y proporción iguales o mayores; reversión: ambos menores; resultados mixtos o corpus posterior menor de 3: inciertos.",
      "Como máximo una señal por tema cada 7 días; las evaluaciones pueden compartir una ventana y no son ensayos estadísticamente independientes.",
      "Sólo historial persistido compatible y disponible hasta cada señal. Cambios de fuentes, consultas, permisos, clasificación o cobertura limitan la comparación; no se reconstruye evidencia ausente.",
    ],
  };
}
