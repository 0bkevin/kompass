# Corrección de los hallazgos adversariales

El usuario solicita resolver completamente todos los defectos. Cada uno de los 25 grupos tiene un agente responsable distinto. El grupo de duplicación cubre references-1 y opportunities-2. Los informes originales en docs/adversarial permanecen como evidencia histórica y no se sobrescriben.

## Contrato de implementación

- Repositorio: `/home/ubuntu/.t3/projects/30x-trackt-2`. Leer PRODUCT.md, DESIGN.md y el informe adversarial asignado. Investigar GLOSSARY/ADRs si existen en el área.
- Aplicar diagnosing-bugs: el defecto ya tiene síntoma y reproducción interactiva confirmados. Las fases de hipótesis e instrumentación pueden abreviarse cuando la causa esté demostrada por el informe. Crear primero una comprobación específica capaz de fallar con el código actual, ejecutarla y registrar el resultado; aplicar la corrección y ejecutar la misma comprobación más los tests cercanos. No basta que el código no lance excepciones.
- Resolver el defecto en la capa responsable y el recorrido completo afectado. Preservar autenticación, permisos, aprobación versionada, evidencia/historial, límites de gasto y distinción observación/hipótesis. No fabricar tendencias ni éxito de proveedores reales.
- No publicar, enviar mensajes a terceros, usar claves reales ni gastar en proveedores. Si se necesita transporte externo, usar una simulación explícita aislada. Que una operación pueda probarse con mocks no acredita entrega o precisión de un modelo real.
- Se comparte checkout. Editar ÚNICAMENTE los archivos/hunks asignados. No restaurar archivos enteros, no ejecutar format/build global, no renombrar componentes/routers sin coordinar. Leer la versión más reciente antes de aplicar patches. Otros agentes trabajan en regiones distintas de los mismos archivos: no revertir sus cambios.
- Añadir tests propios con nombre `tests/remediation-ID.test.mjs` cuando exista una seam correcta. No cambiar los tests existentes para ocultar una regresión; informar incompatibilidades al coordinador. Tests aislados, SQLite temporal, sin dependencia de red real ni orden global. Para ajustes pequeños de UI, una comprobación interactiva específica puede ser mejor que un test que sólo repita una constante.
- No modificar package.json/dependencias, .env, secretos, datos principales ni ../30x-track. No git commit/push/PR. No nuevos subagentes. No ejecutar detectores de diseño: la comprobación conjunta pertenece al coordinador.

## Interfaz y navegador

Antes de editar UI, leer `/home/ubuntu/.agents/skills/impeccable/reference/craft-floor.md` y `reference/harden.md`; aplicar modo Operate, PRODUCT/DESIGN y `.impeccable/app-surface.md` existentes. El contexto de Impeccable ya fue cargado en esta conversación; no volver a ejecutar su launcher ni entrevistar al usuario. Mantener identidad, legibilidad, foco, estados y UX simple.

Para comprobación interactiva usar exclusivamente T3 `preview_*`: status primero; abrir pestaña propia con `reuseExistingTab:false,profileId:'incognito',open:false`, y usar su tabId en todas las llamadas. El host asignado por agente aísla cookies; no cambiarlo por localhost. Cerrar sólo las propias pestañas al acabar (límite global de8).

El build anterior no contiene el arreglo. Si se necesita UI antes del build integrado, usar desarrollo propio:

```bash
env -u OPENAI_API_KEY -u GEMINI_API_KEY -u YOUTUBE_API_KEY -u APIFY_API_TOKEN \
 DATA_DIR=/tmp/30x-remediation-ID DISCOVERY_ENABLED=false \
 PORT=PUERTO_API RADAR_API_PORT=PUERTO_API WEB_PORT=PUERTO_WEB npm run dev
```

No tocar procesos de otros agentes. Las bases, hosts y puertos asignados son exclusivos; detener sus propios procesos después de la prueba. No ejecutar npm run build mientras otros agentes editan: el coordinador compilará y hará el recorrido integrado final. Si se necesita ayuda de navegador/fixture, avisar y continuar con trabajo independiente.

## Entrega por defecto

Escribir `docs/remediation/reports/ID.md` y `ID.json` con:

```json
{
  "issueId": "ID",
  "agent": "nombre del agente",
  "status": "fixed | blocked",
  "rootCause": "...",
  "changes": ["..."],
  "files": ["..."],
  "verification": [{"command":"...", "before":"fallo observado", "after":"resultado esperado", "kind":"test | browser | http"}],
  "artifacts": ["..."],
  "limitations": ["..."]
}
```

El informe debe demostrar el síntoma original resuelto y no una condición más débil. Guardar capturas nuevas cuando se pruebe la UI, sin cookies/tokens/claves/contraseñas. Etiquetar datos ficticios y simulaciones. Informar qué no se probó. El coordinador sólo marcará cerrado un defecto después de integrar y comprobar el resultado.
