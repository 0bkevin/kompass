const FORMATS = {
  post: "publicación de texto",
  carousel: "carrusel",
  reel: "reel",
  video: "video",
  newsletter: "newsletter",
  article: "artículo",
  unknown: "sin especificar",
};

function text(value, max = 180) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  const parsed = timestamp(value);
  return parsed === null ? "" : new Date(parsed).toISOString();
}

function audiovisual(reference) {
  const analysis = reference.videoAnalysis;
  return analysis &&
    analysis.status === "completed" &&
    ["video_audio", "sampled_video"].includes(analysis.contentScope)
    ? analysis
    : null;
}

function coverage(analysis) {
  const parts = [];
  if (
    Number.isFinite(analysis.coverage?.samplingFps) &&
    analysis.coverage.samplingFps > 0
  )
    parts.push(
      `Muestreo registrado: ${analysis.coverage.samplingFps} fotogramas/s`,
    );
  if (text(analysis.coverage?.notes, 180))
    parts.push(text(analysis.coverage.notes, 180));
  if (!parts.length) parts.push("La cobertura temporal no está especificada");
  parts.push(
    "Los tiempos son aproximados y puede haber momentos no observados",
  );
  return `${parts.join(". ")}.`;
}

function hookFactor(reference) {
  const analysis = audiovisual(reference);
  const visual = text(analysis?.hook?.visual, 170);
  const verbal =
    analysis?.contentScope === "video_audio"
      ? text(analysis?.hook?.verbal, 170)
      : "";
  if (analysis && (visual || verbal)) {
    const details = [
      visual ? `Análisis visual: ${visual}` : "",
      verbal ? `Análisis verbal con audio disponible: ${verbal}` : "",
    ].filter(Boolean);
    const window = Array.isArray(analysis.observations)
      ? analysis.observations.find(
          (item) =>
            Number.isFinite(item?.startSeconds) &&
            Number.isFinite(item?.endSeconds) &&
            item.startSeconds >= 0 &&
            item.endSeconds >= item.startSeconds,
        )
      : null;
    if (window)
      details.push(
        `Observación temporal registrada: ${window.startSeconds}–${window.endSeconds} s`,
      );
    return {
      factor: "hook",
      label: "Gancho",
      observation: `${details.join(". ")}.`,
      limitation: `${coverage(analysis)}${analysis.contentScope === "sampled_video" ? " No hay audio confirmado." : ""} La descripción no demuestra qué retuvo a la audiencia.`,
    };
  }
  const title = text(reference.title, 200);
  const content = text(reference.text, 200);
  return {
    factor: "hook",
    label: "Gancho",
    observation: title
      ? `Título disponible: «${title}».`
      : content
        ? `Texto disponible: «${content}».`
        : "No hay título, texto ni observación audiovisual suficiente para describir el gancho.",
    limitation:
      "El título o texto puede inspirar una hipótesis editorial; no hay una observación registrada de la apertura audiovisual ni evidencia de su efecto.",
  };
}

function formatFactor(reference) {
  const format = text(reference.format, 80);
  const analysis = audiovisual(reference);
  const structure = Array.isArray(analysis?.structure)
    ? analysis.structure
        .map((item) => text(item, 70))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    factor: "format",
    label: "Formato",
    observation: `${format && format !== "unknown" ? `Formato registrado en los metadatos: ${FORMATS[format] || format}.` : "El formato no está especificado."}${structure.length ? ` El análisis audiovisual describe: ${structure.join(" → ")}.` : ""}`,
    limitation: structure.length
      ? "La estructura procede del análisis con cobertura limitada; no demuestra que el formato cause el rendimiento."
      : "La etiqueta del formato no confirma la estructura creativa, el montaje ni una ventaja de rendimiento.",
  };
}

function topicFactor(reference, topic, relatedReferences) {
  const grouping = text(topic, 160) || text(reference.topic, 160);
  const related = Array.isArray(relatedReferences)
    ? relatedReferences.filter(
        (item) => item && (reference.isDemo || !item.isDemo),
      )
    : [];
  const identities = new Set(
    related
      .map((item) => text(item.id, 150) || text(item.url, 2_000))
      .filter(Boolean),
  );
  return {
    factor: "topic",
    label: "Tema",
    observation: grouping
      ? `Agrupación editorial propuesta: «${grouping}».${identities.size > 1 ? ` Se aportaron ${identities.size} referencias para revisarlas juntas.` : ""}`
      : "No se ha definido una agrupación editorial para esta referencia.",
    limitation:
      "Es una hipótesis para organizar contenido; no identifica intereses individuales, una categoría inferida de YouTube ni una tendencia comprobada.",
  };
}

function timingFactor(reference, now) {
  const publication = iso(reference.publishedAt);
  const detection = iso(reference.firstSeenAt);
  const future = publication && timestamp(reference.publishedAt) > now;
  return {
    factor: "timing",
    label: "Momento",
    observation: publication
      ? `Fecha de publicación reportada por la fuente: ${publication}.${detection ? ` Primera detección registrada: ${detection}.` : ""}`
      : detection
        ? `Primera detección registrada${
            String(reference.source || "")
              .toLowerCase()
              .includes("gdelt")
              ? " por GDELT"
              : ""
          }: ${detection}; no es una fecha de publicación.`
        : "No hay una fecha de publicación verificable ni una primera detección registrada.",
    limitation: future
      ? "La fecha reportada es futura y necesita verificación. No permite atribuir rendimiento al momento de publicación."
      : "Una fecha o detección aislada no demuestra que el horario haya causado resultados ni determina cuándo conviene publicar.",
  };
}

function publisherFactor(reference) {
  const author = text(reference.author, 160);
  const publisher = text(reference.publisher, 160);
  return {
    factor: "publisher",
    label: "Publicador",
    observation:
      author || publisher
        ? [
            author ? `Autor o canal atribuido por la fuente: ${author}.` : "",
            publisher ? `Medio atribuido: ${publisher}.` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "La referencia no incluye atribución del autor, canal o medio original.",
    limitation:
      "La atribución no informa sobre seguidores, perfiles de audiencia, influencia ni cuánto aportó quien publicó al resultado.",
  };
}

function metricEntries(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics))
    return [];
  return [
    ["views", "vistas"],
    ["likes", "likes"],
    ["comments", "comentarios"],
    ["score", "puntos"],
  ]
    .filter(
      ([key]) =>
        typeof metrics[key] === "number" &&
        Number.isFinite(metrics[key]) &&
        metrics[key] >= 0,
    )
    .map(([key, label]) => ({ key, label, value: metrics[key] }));
}

function performanceFactor(reference, now) {
  const trend =
    reference.trend && typeof reference.trend === "object"
      ? reference.trend
      : {};
  const direct = metricEntries(reference.metrics);
  const entries = direct.length ? direct : metricEntries(trend.metrics);
  let origin = text(
    direct.length ? reference.metricsOrigin : trend.metricsOrigin,
    100,
  );
  if (!origin && !direct.length && entries.length)
    origin = text(trend.priorityMetric?.origin, 100);
  const observedAt = iso(
    direct.length ? reference.metricsObservedAt : trend.observedAt,
  );
  const originDetail =
    origin === "YouTube Data API"
      ? "YouTube Data API (métricas oficiales del video)"
      : origin
        ? `${origin} (valores reportados; verificación independiente no disponible)`
        : "origen no especificado";
  const observation = entries.length
    ? [
        `Valores observados: ${entries.map((item) => `${item.value} ${item.label}`).join(", ")}. Origen: ${originDetail}.${observedAt ? ` Observación: ${observedAt}.` : ""}`,
      ]
    : [
        "No hay métricas nativas disponibles para describir el rendimiento de esta pieza.",
      ];
  const previous = timestamp(trend.previousObservedAt);
  const current = timestamp(trend.observedAt);
  const samePlatform =
    !trend.platform ||
    !reference.platform ||
    trend.platform === reference.platform;
  const unit = {
    "views/hour": "vistas/h",
    "reported views/hour": "vistas reportadas/h",
    "points/hour": "puntos/h",
  }[trend.velocityUnit];
  const comparable =
    typeof trend.velocity === "number" &&
    Number.isFinite(trend.velocity) &&
    previous !== null &&
    current !== null &&
    previous < current &&
    current <= now &&
    samePlatform &&
    !!unit;
  if (comparable)
    observation.push(
      `El historial de esta pieza registra un cambio de ${trend.velocity} ${unit} entre ${iso(trend.previousObservedAt)} y ${iso(trend.observedAt)}.`,
    );
  return {
    factor: "performance",
    label: "Rendimiento",
    observation: observation.join(" "),
    limitation: `Las vistas, likes o puntos no demuestran éxito, afinidad ni causalidad.${comparable ? " El cambio corresponde a esta pieza y su plataforma; no es crecimiento de todo el tema." : " Sin dos observaciones comparables no se estima crecimiento."} Las métricas de distintas redes no se suman ni se comparan como equivalentes.`,
  };
}

export function explainEditorialFactors(
  reference,
  { topic, relatedReferences = [], now = Date.now() } = {},
) {
  const input =
    reference && typeof reference === "object" && !Array.isArray(reference)
      ? reference
      : {};
  const current = typeof now === "function" ? now() : now;
  const factors = [
    hookFactor(input),
    formatFactor(input),
    topicFactor(input, topic, relatedReferences),
    timingFactor(input, current),
    publisherFactor(input),
    performanceFactor(input, current),
  ];
  return input.isDemo
    ? factors.map((item) => ({
        ...item,
        observation: `Ejemplo ilustrativo: ${item.observation}`,
        limitation: `No es evidencia real. ${item.limitation}`,
      }))
    : factors;
}
