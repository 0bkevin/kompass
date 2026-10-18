# opportunities-1 · Corregido

La API etiquetaba igualdad y descenso como `observed`, y el badge lo mostraba como «Crecimiento observado» verde. Ahora devuelve `stable` («Frecuencia sin cambios», neutral) y `declining` («Descenso observado», ámbar). Solo un aumento comparable puede devolver `observed` o `early_signal`. El detalle conserva conteos, fechas, fuentes y límites; no presenta alcance, éxito ni tendencias globales.

Cambios acotados a `growthFor`, el enum TypeScript y el helper/badge compartido con Inicio. No se tocó la validación de señales ni se hizo format/build global.

| Comprobación | Antes | Después |
| --- | --- | --- |
| `node --test --test-reporter=tap tests/remediation-opportunities-1.test.mjs` | 9 PASS, 4 FAIL: 0→0, 1→1, 3→1 y 3→0 recibían observed | 13 PASS |
| `node --test --test-reporter=tap tests/audience-insights.test.mjs` | No ejecutado | 13 PASS |
| UI propia y API, host 127.0.1.21:5511 | Reproducción histórica en informe adversarial; el rojo actual está en los tests | 0→0/1→1 neutrales; 3→1 ámbar con «1 frente a 3» y descenso explícito; 1→4 verde; 0→2 señal inicial; cold start y YouTube insuficientes |

La prueba usa SQLite aislada y ventanas de 7 días terminadas el 10 y 18 de octubre de 2026, con la misma fuente/consulta. También cubre una sola observación, fuentes/consultas distintas, ventanas desiguales/caducadas, demo y YouTube nativo aun con historial RSS positivo. En UI se seleccionó marca, se buscó el caso y se abrió «Entender y crear». El caso 0→0 mantiene una referencia vigente y una explicación sin crecimiento. Inicio usa las mismas etiquetas. En viewport emulado 390×844 el documento y el badge no desbordan.

Evidencia: [rojo](../evidence/opportunities-1-before.tap), [verde](../evidence/opportunities-1-after.tap), [suite cercana](../evidence/opportunities-1-nearby.tap), [API y aserciones UI](../evidence/opportunities-1-browser.json), [descenso](../evidence/opportunities-1-decline.png), [0→0](../evidence/opportunities-1-stable-zero.png), [móvil](../evidence/opportunities-1-stable-mobile.png), [cold start](../evidence/opportunities-1-cold.png).

Comando de desarrollo: `env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN DATA_DIR=/tmp/30x-remediation-opportunities-1 DISCOVERY_ENABLED=false PORT=4511 RADAR_API_PORT=4511 WEB_PORT=5511 npm run dev`. Fixture reproducible en `/tmp/30x-remediation-opportunities-1/audit/seed.mjs`, ejecutada con el mismo DATA_DIR y claves retiradas; manifiesto contiguo.

Límites: datos totalmente sintéticos; sin integración de proveedores ni comprobación longitudinal real. La combinación `node --test tests/audience-insights.test.mjs tests/opportunity-analysis.test.mjs` se detuvo tras 103,9 s, después de 20 PASS, pendiente en «only one analysis per brand runs at a time while another workspace can proceed»: 1 CANCELLED; no se acredita verde. Coordinador informado. No build ni suite global.

Pestaña propia `tab_48` cerrada y proceso de desarrollo detenido; `ss -lptn '( sport = :4511 or sport = :5511 )'` confirmó puertos libres. Node --watch emitió una aserción nativa FSEventWrap durante el cierre, después de verificar la UI.

