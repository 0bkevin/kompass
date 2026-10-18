# Revisión visual independiente · primera ronda

Disposición: **fix**.

Entradas: PRODUCT.md, contrato de superficie, capturas de Inicio de escritorio/móvil, Oportunidades y Empresa. QUALITY BAR card y comp no suministrados/no aplicables a esta extensión del sistema heredado. Funcionalidad fuera del alcance de esta revisión visual.

## Hallazgos materiales

1. En Oportunidades hay dos campos de búsqueda y sus consultas se concatenan literalmente; repetir un tema puede ocultar resultados válidos. Conservar un único buscador visible y una única fuente de consulta.
2. El separador decorativo `/` del breadcrumb tiene contraste 2,54:1. Darle contraste suficiente y `aria-hidden="true"`.

## Respuesta de implementación

- Se retiró la búsqueda superior de Oportunidades y su filtro usa exclusivamente la consulta del campo local.
- Se aplicó `#5b6c60` al separador sobre fondo blanco y se marcó como decorativo.

Se conservan el siguiente paso destacado, la navegación del flujo editorial, las filas funcionales y las etiquetas de evidencia/limitaciones. La confirmación se limita a estos hallazgos y a las capturas revisadas.
