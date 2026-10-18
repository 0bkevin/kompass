# Del audio al producto

La [revisión de permisos del 18 de octubre de 2026](compliance/README.md) restringe las rutas de recopilación y reutilización: Apify/Reddit/YouTube editorial/Gemini video no están activables; webs/feeds adicionales, IA y webhooks requieren revisión del operador. La matriz de abajo describe la intención y el recorrido, sin presentar esos conectores como autorizados.

La plataforma sirve a empresas, medios y creadores; 30X aporta el caso inicial de IA para líderes y equipos de Latinoamérica. El objetivo es decidir qué producir con evidencia pública, costo controlado y una relación explícita con necesidades de audiencia.

| Parte del audio | Necesidad                                                            | Implementación y límite                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 05:41–06:45     | Reducir páginas revisadas, horas y gasto                             | Importar web/texto/enlaces, fuentes configurables, descubrimiento manual/periódico, deduplicación y errores parciales. Apify opcional con reservas diarias/mensuales; fuentes abiertas no requieren scraping pago. Costos reales dependen de operación/proveedor.              |
| 06:45–07:05     | Contexto de la empresa y audiencia, más allá de tendencias genéricas | Alta guiada desde contenido existente, propuesta editable de marca, primer segmento y necesidades. La propuesta se confirma; no se trata como observación del consumidor.                                                                                                      |
| 07:05–08:22     | Correlacionar intereses por grupos, sin trabajo invasivo             | Señales por segmento y temas, pesos diferenciados para hipótesis/editorial, contenido público y respuestas comunitarias agregadas. Las preguntas públicas guardan sólo contadores y exponen grupos desde cinco respuestas. No se importan matrículas ni perfiles individuales. |
| 08:22–09:25     | Segmentar contextos como ventas/EdTech/HealthTech                    | Segmentos configurables por empresa; oportunidades explican coincidencias con necesidades y señales. Un interés es contextual, no una inferencia de seguimiento a creadores o consumo individual.                                                                              |
| 09:25–09:47     | Encontrar un enfoque propio, no copiar                               | Referencias conservan procedencia; adaptación por marca, necesidad, canal y formato; guiones originales revisables. Repetición limitada al corpus disponible; no se afirma saturación global.                                                                                  |
| 09:47–10:25     | Sustentar valor con datos del problema                               | Evidencia y cobertura visibles, presupuestos de conectores y resultados manuales. No se atribuyen pérdidas de USD500.000 ni ahorro/ROI sin medición real.                                                                                                                      |
| 10:25–10:47     | Observar cambios en la audiencia                                     | Nuevas señales y conteos comunitarios actualizan afinidad editorial. Resultados propios comparables pueden ajustar prioridad de forma limitada y explicada; ausencia de muestra suficiente queda explícita.                                                                    |
| 10:47–11:04     | Crear contenido pertinente                                           | Oportunidad→selección de audiencia/canal/formato→guion editable→revisión versionada→calendario→exportación→publicación registrada/resultados. Programar no publica automáticamente en redes.                                                                                   |

## Las tres preguntas del reto

- **Qué empieza a crecer:** observaciones temporales comparables por fuente y tema; primera consulta sin línea base se etiqueta insuficiente. Las métricas de distintas redes permanecen separadas. Contexto de RSS/HN/Trends/GDELT no se presenta como crecimiento de LinkedIn.
- **Por qué podría funcionar:** observaciones de gancho, formato, tema, publicación y evidencia de rendimiento, más hipótesis editorial. No se atribuye causalidad a métricas observacionales. Video/audio requiere proveedor y acceso configurados.
- **A quién sirve:** perfil declarado, necesidad específica y señales con origen y muestra. Un alumno no representa automáticamente a la audiencia y una URL social no habilita lectura de sus seguidores.

## Fuentes y restricciones

Sólo páginas públicas accesibles sin sesión de terceros. Los enlaces sociales sin un acceso habilitado se guardan como enlaces, no como contenido importado. YouTube y las APIs opcionales mantienen sus permisos y métricas nativas; no se infieren demografías ni afinidad de espectadores. No se almacenan filas de participantes del sensor ni perfiles individuales de audiencia. La cuenta del operador conserva los datos necesarios de autenticación separados del corpus.

## Verificación

Pruebas HTTP con SQLite temporal verifican el recorrido integrado, aprobaciones obsoletas, corrección de resultados sin duplicación, evidencia comunitaria y aislamiento entre cuentas/empresas. Las pruebas de proveedores usan respuestas simuladas. La comprobación manual de fuentes abiertas y la lectura real de una página pública se registran separadamente; no equivalen a validar todas las redes, permisos o costos de producción.
