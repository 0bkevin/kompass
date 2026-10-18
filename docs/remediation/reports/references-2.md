# references-2 · Citas de referencias públicas

Estado: corregido; pendiente de integración del coordinador.

La captura manual admitía cualquier URL HTTP/HTTPS sin credenciales. El caso original `http://127.0.0.1:9/qa-private-reference` devolvía 201, persistía una referencia y el detalle ofrecía «Ver original». No se abrió ese destino y no se observó SSRF.

La comprobación HTTP se ejecutó primero en rojo: falló al esperar 400 y obtener 201 con 1 fila. La misma prueba ahora devuelve 400 y deja 0 referencias/actividad. El servidor aplica la política local de citas a POST/PATCH antes de guardar. Un helper compartido conserva las reglas y mensajes de `publicLink`, reutiliza `isPublicAddress` de conectores y la inspección de contacto de `url-privacy`. Contempla normalización de IPv4/IPv6, variantes numéricas/codificadas, puntos DNS finales, redes privadas/reservadas, hosts intranet/locales, credenciales, protocolo, puertos, sesiones y datos personales. No usa DNS ni solicita páginas.

Las filas históricas se conservan: la respuesta pública omite un enlace inadmisible y añade `originalUrlOmitted`. El detalle explica la omisión. PATCH puede corregirlo o quitarlo, y permite actualizar el estado sin reescribir el historial. La captura conserva sus campos al mostrar el error y aclara que guardar una cita no confirma haber leído la página. La deduplicación transaccional permanece intacta.

Validación realizada:

- `node --test tests/remediation-references-2.test.mjs`: 7/7, con 66 URL inadmisibles en ambas rutas HTTP, 15 citas admisibles, adjuntos sin URL, texto libre, privacidad, permisos, marcas, registros históricos y duplicación. Instrumentación aislada confirma 0 DNS y 0 fetch externos.
- Suites cercanas de core, audience-insights, signals-2, results-1, duplicate-reference, discovery-1, capture-retry, social-core, social-intelligence, integrated-flow y video-analysis: 140/140.
- `npx tsc --noEmit`: exit 0.
- T3 preview en la pestaña propia con datos sintéticos, 1280×800 y 390×844: rojo visual con «Ver original» privado; después 400 con campos conservados, corrección a cita pública 201 y readback tras recargar. La fila histórica omite el enlace y muestra contexto; SQL conserva URL y timestamps originales. El documento móvil mide 390px para viewport 390px. Contraste medido: ayuda 5.90:1 y error 5.32:1.

El coordinador autorizó la extracción compartida y cambió tres URL de fixtures de social-core de `.test` a `example.com`, manteniendo rutas y aserciones. La ejecución intermedia con esos fixtures reservados se conserva en `related-social.tap`; la ejecución final pasa. No se modificaron upload/detectFile ni validadores de marca, fuente o pieza.

La validación acredita admisibilidad local del enlace. No acredita acceso, DNS público, redirecciones, ausencia de login remoto ni lectura del contenido. Un dominio de aspecto público puede resolver a una red privada; cualquier futura descarga debe usar `safeFetch`. No se siguió la cita privada ni la pública de NASA, ni se invocaron proveedores. Build global e integración completa quedan a cargo del coordinador; móvil se comprobó con viewport emulado.

Evidencias: [rojo](../evidence/references-2/red.tap), [verde](../evidence/references-2/green.tap), [140 pruebas cercanas](../evidence/references-2/nearby-final.tap), [observaciones de navegador](../evidence/references-2/browser-checks.json), [captura privada antes](../evidence/references-2/before-private-original.png), [rechazo móvil](../evidence/references-2/private-rejected-mobile.png), [histórica omitida](../evidence/references-2/legacy-original-omitted-mobile.png), [corrección pública](../evidence/references-2/public-corrected-mobile.png).

La pestaña propia está cerrada y el proceso dev terminó; puertos 4509/5509 libres. La base sintética en `/tmp/30x-remediation-references-2/runtime` queda disponible para reproducción. Al cerrar, Node --watch emitió una aserción de FSWatcher durante SIGINT y terminó; las pruebas usan servidores sin watch.
