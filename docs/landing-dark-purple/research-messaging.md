# Investigación de mensaje y CTA para la landing de kompass

Fecha de consulta: 18 de octubre de 2026. Investigación delegada en paralelo; skill utilizada: `research` (`/home/ubuntu/.agents/skills/research/SKILL.md`). Fuentes primarias consultadas directamente. Alcance: contenido y recorridos de la landing pública; la nueva identidad oscura y morada puede reemplazar completamente la gráfica anterior de esa landing, por autorización explícita del usuario. Este informe no propone rediseñar el producto autenticado.

## Decisión recomendada

Abrir con la decisión editorial que el equipo necesita resolver, mostrar un ejemplo concreto y ofrecer dos siguientes pasos inequívocos: crear su cuenta o explorar la demo con datos identificados. Presentar como valor la continuidad entre necesidad, evidencia, idea y trabajo del equipo. Las tecnologías y conectores explican cómo se obtiene ese valor y sus límites; no son el argumento inicial.

No hay entrevistas de clientes ni experimento de conversión de esta plataforma en el material revisado. Las formulaciones siguientes son hipótesis informadas por el encargo y el producto, no citas de usuarios ni mensajes cuya eficacia comercial esté demostrada.

## Evidencia externa y aplicación concreta

| Evidencia consultada | Qué sostiene | Aplicación a kompass | Límite |
| --- | --- | --- | --- |
| [NN/g, Homepage Design: 5 Fundamental Principles](https://www.nngroup.com/articles/homepage-design-principles/), 15-03-2024 | Las páginas de inicio deben comunicar propósito, enseñar ejemplos representativos, jerarquizar acciones y dar acceso inmediato al contenido. Advierte de titulares que dependen del desplazamiento para poder leerse. | Decir para quién es la plataforma y qué trabajo facilita en la primera pantalla. Mostrar una cadena editorial de ejemplo. Mantener titular y CTA visibles desde la carga. | Guía de usabilidad basada en investigación, no un ensayo de conversión de este producto. |
| [GOV.UK Design System, Button](https://design-system.service.gov.uk/components/button/), documentación vigente con cambios de 2026 | Las etiquetas describen la acción. Varios botones con igual énfasis dificultan identificar el siguiente paso. Una navegación puede usar un enlace con apariencia de botón. | Una acción morada dominante: «Crear mi cuenta». Demo con menor peso; acceso de clientes como enlace. La etiqueta debe coincidir con el paso inmediato. | Contexto de servicios públicos; trasladamos claridad y jerarquía, sin atribuir un efecto cuantitativo. |
| [NN/g, Better Link Labels](https://www.nngroup.com/articles/better-link-labels/), 24-03-2019 | Los enlaces deben ser concretos, comprensibles por sí mismos y cumplir la expectativa que crean al pulsarlos. Sus ejemplos incluyen usuarios frustrados por un formulario inesperado. | «Explorar la demo» debe abrir el recorrido de ejemplo. «Ver cómo funciona» puede ir a una sección explicativa. Evitar «Solicitar demo» si el destino es una cuenta de ejemplo. | Hallazgos de navegación, sin evidencia de cuál de nuestras dos acciones convertirá mejor. |
| [GOV.UK, Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces), consultado en 2026 | Recomienda lenguaje del usuario, frases directas, una idea por frase e información importante al principio. Añadir texto no sustituye una interfaz comprensible. | Usar «qué publicar», «guion», «revisión», «calendario» y «fuentes». Quitar jerga como corpus, conectores, semántica y orquestación del relato principal. | La transferencia a español exige criterio editorial y validación; no aplicar mecánicamente métricas inglesas. |
| [GOV.UK, Identify user needs](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/identify-user-needs/), consultado en 2026 | Define necesidades desde las tareas y su finalidad; requiere evidencia sobre problemas reales y avisa de las suposiciones incorrectas. | Necesidad de trabajo: «Como responsable de contenido, necesito elegir y justificar qué producir para que el equipo trabaje sobre una prioridad compartida». | Esa necesidad está inferida del encargo y del flujo implementado; falta contrastarla con equipos reales. |
| [Unbounce, informe de conversión](https://unbounce.com/conversion-benchmark-report/) y [metodología](https://unbounce.com/conversion-benchmark-report/methodology/), datos 23-07-2023 a 23-07-2024 | El proveedor analiza sus propias páginas y observa relaciones entre legibilidad y conversiones. La metodología excluye ciertas páginas de bajo volumen y usa métricas de lectura centradas en inglés. | Favorecer frases simples y una lectura móvil cómoda; depurar la página sin imponer una longitud «óptima» universal. | Datos observacionales de otra población. No prueban causalidad, rendimiento en español ni mejora de kompass. No llevar porcentajes del estudio a la landing. |

No se encontraron ni se necesitan cifras de conversión atribuibles a esta plataforma. Las fuentes antiguas de NN/g se conservan por su observación de tareas y expectativas; no se presentan como experimentos recientes. La documentación de GOV.UK se comprobó en su versión actual. El informe comercial de Unbounce indica expresamente la ventana real de sus datos, aunque siga disponible en 2026.

## Verdad del producto y recorridos revisados

Se leyeron [README](../../README.md), [App y Auth](../../src/App.tsx), ruta raíz del workspace de la base (`src/routes/_workspace/index.tsx`, sustituida por la landing en esta rama), [rutas y documento raíz](../../src/routes/__root.tsx), [asistente de empresa](../../src/features/CompanySetup.tsx), [navegación heredada](../../src/lib/legacy-navigation.mjs) y las entradas de autenticación de [server/core.mjs](../../server/core.mjs).

En el estado de partida, `/` redirige a `/home`. Sin sesión, `App` muestra `Auth` sobre las rutas de trabajo. **No existen rutas públicas `/signup`, `/register`, `/login` ni `/demo`.** Registro e inicio son modos internos del formulario. Un enlace que use cualquiera de esas rutas sin implementarla sería incorrecto.

| Intención | Recorrido real actual | Implicación para la nueva landing |
| --- | --- | --- |
| Crear cuenta | Auth muestra por defecto registro; envía `POST /api/auth/register`. Una cuenta nueva entra en `CompanySetup`. | «Crear mi cuenta» debe abrir ese formulario en modo registro, mediante un estado/ruta de entrada real que implemente la landing. Ir a `/home` sin un selector abre el registro actual, pero no resuelve un enlace distinto para inicio de sesión. |
| Iniciar sesión | El usuario cambia el modo de Auth; el formulario envía `POST /api/auth/login`. Google aparece sólo cuando está configurado; los errores e invitaciones forman parte del flujo existente. | «Iniciar sesión» necesita seleccionar explícitamente ese modo conservando `invite` y `authError`. No dirigir ambos CTA a una pantalla idéntica sin ajustar su estado. |
| Explorar demo | El botón «Explorar con datos de ejemplo» hace `POST /api/auth/demo`, crea una sesión y un espacio de ejemplo. No es una llamada comercial ni una URL de vídeo. | Puede abrir Auth con la opción demo identificada, o ejecutar el mismo flujo tras un clic explícito. Si sólo abre el formulario, una etiqueta como «Ver opciones de acceso» sería más exacta que prometer entrada inmediata a la demo. |
| Continuar trabajando | Usuarios con sesión reciben su empresa y rutas conservadas; `/home` muestra el siguiente paso editorial. | El acceso no debe reiniciar el onboarding ni reemplazar rutas, callbacks o sesión existentes. |

Estas rutas se verificaron en código; la revisión interactiva posterior debe confirmar los enlaces concretos de la implementación nueva.

La base sostiene estos beneficios: configurar una empresa con su contenido; revisar una hipótesis de audiencia; contrastar oportunidades con fuentes públicas y procedencia; editar guiones y piezas; comentar y aprobar versiones; organizar calendario y exportaciones; consultar contadores oficiales de YouTube y registrar otros resultados manualmente. El equipo conserva contexto, fuentes y estado editorial en el mismo espacio.

Precisiones que evitan promesas falsas:

- El perfil de audiencia inicial es una hipótesis revisada por el editor. No afirmar que conocemos a todos sus seguidores o que descubrimos con certeza qué quieren comprar.
- La prioridad editorial y el crecimiento observado son conceptos distintos. Una primera muestra no prueba crecimiento ni éxito futuro.
- El calendario organiza; no publica automáticamente. «Planifica tu contenido» es correcto; «publica en todas tus redes» no lo es.
- YouTube ofrece descubrimiento público y contadores acumulados actualizados cada hora mientras el servidor está activo. No son atribución de ventas ni crecimiento demostrado.
- Instagram, LinkedIn y TikTok no tienen conectores oficiales activos. Es posible trabajar piezas para esos canales y registrar resultados manuales; no prometer importación completa ni sincronización.
- Studio crea imágenes y MP4 animados con ilustración y subtítulos; el MP4 no incluye audio ni metraje de movimiento generado. Son capacidades dependientes de la configuración del servicio.

## Secuencia y copy propuestos

### 1. Problema y resultado en la primera pantalla

Antetítulo: **Para equipos de contenido**.

Titular recomendado: **De «¿qué publicamos?» a una idea con fundamento.**

Texto: **Conecta lo que tu audiencia necesita con señales públicas. Prioriza oportunidades y lleva cada idea al guion, la revisión y el calendario, con tu equipo en el mismo contexto.**

CTA principal: **Crear mi cuenta**. CTA secundario: **Explorar la demo**. Nota próxima a la demo: **Recorre la plataforma con datos de ejemplo.** Acceso de clientes: **Iniciar sesión**.

El titular dramatiza una pregunta editorial, sin atribuirla a un cliente concreto. La propuesta «con fundamento» promete trazabilidad y criterio, que sí se pueden mostrar; no asegura rendimiento comercial. Es una hipótesis de posicionamiento que puede ajustarse al ritmo de la dirección visual.

### 2. Una prueba comprensible del trabajo

Mostrar una composición editorial rotulada **Ejemplo de recorrido**: necesidad de la audiencia → referencia pública con procedencia → enfoque original → pieza en revisión. Usar contenido hipotético explícito y evitar contadores ficticios que parezcan mediciones reales. Una vista de producto debe distinguirse de un caso de éxito o una integración activa.

Pie sugerido: **La referencia explica de dónde nace la idea. Tu equipo decide qué merece convertirse en contenido.**

### 3. Qué cambia para el equipo

Tres bloques consecutivos pueden explicar las decisiones, en vez de listar módulos:

1. **Elige con contexto.** Define a quién ayudas y qué necesita resolver. Contrasta oportunidades con fuentes públicas y revisa sus límites.
2. **Llega a una pieza que el equipo pueda revisar.** Convierte el enfoque en un guion original, edita y recoge comentarios antes de aprobar la versión vigente.
3. **Da continuidad a cada idea.** Organiza fechas, exporta el plan y revisa los resultados disponibles para preparar la siguiente decisión.

### 4. Para quién merece la pena

- **Empresas:** relacionar necesidades de sus clientes con el conocimiento de la marca y una prioridad editorial compartida.
- **Medios:** conservar referencias y enfoque al pasar del hallazgo a una pieza revisada.
- **Creadores:** pasar de una idea dispersa a un guion y un plan que puedan mantener.

Son aplicaciones del mismo flujo, no segmentos con resultados demostrados. 30X puede aparecer como nombre de la plataforma o caso de uso; no como el único destinatario ni como testimonio inventado.

### 5. Resolver dudas que cambian una decisión

Preguntas útiles: «¿Con qué puedo empezar?», «¿Necesito conectar mis redes?», «¿El calendario publica por mí?» y «¿La demo usa datos reales?». Responder con el flujo de web/enlaces/texto propio, la independencia del trabajo editorial respecto a las conexiones, el calendario sin autopublicación y los ejemplos identificados.

### 6. Cierre y siguiente paso

**Dale a tu próxima idea un punto de partida.**

**Crea tu cuenta y empieza por tu web, una publicación o el contexto de tu empresa.**

Repetir **Crear mi cuenta** con la misma acción. No añadir un formulario comercial, un plan de precios ficticio o una tercera acción dominante.

## Aplicación de la slide y criterios de revisión

«Habla de ellos» se aplica al comienzo con su decisión editorial y al vocabulario de trabajo. «Vende el hueco» se aplica a elegir con fundamento, coordinar la revisión y conservar continuidad; la enumeración de herramientas queda subordinada. «Practica» se aplica recortando redundancias y leyendo la página de dos formas: sólo titulares y CTA, y después el texto completo.

La revisión de contenido debe comprobar que una persona pueda responder: para quién es, qué problema ayuda a resolver, qué recibirá tras pulsar cada CTA y qué sigue dependiendo de su criterio. Titular y botones no deben esperar una animación para ser utilizables. En móvil, el primer párrafo no debe esconder el acceso bajo una gran composición decorativa.

Hipótesis pendientes de validar con usuarios: la pregunta «¿qué publicamos?» como problema principal; el atractivo de «con fundamento»; el orden registro/demo; y qué ejemplo editorial resulta reconocible para empresas, medios y creadores. Un futuro contraste puede observar comprensión, elección del siguiente paso y comienzo real del onboarding. Este encargo no aporta volumen de tráfico, analítica ni experimento para calcular conversión, ahorro o retorno.
