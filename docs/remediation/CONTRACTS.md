# Contratos corregidos durante la integración

Los informes y pruebas rojas de cada responsable se conservan en `reports/` y `evidence/`. Las expectativas anteriores siguientes describían el defecto o confundían dos publicaciones; el coordinador las cambió explícitamente en vez de conservar ese comportamiento.

- `tests/draft-contract.test.mjs`: las instrucciones de 10.000 caracteres y la adaptación de 5.000 se conservan íntegramente en el brief editorial, fuera del texto publicable. Las necesidades de 3.000 caracteres se conservan completas en el brief y resumidas en el guion. Se mantienen límites, validación de proveedores y guardado; el PATCH debe conservar el brief exacto.
- `tests/intelligence.test.mjs`: la dirección libre está en el brief y no se pega en el guion. Se conserva el requisito anterior de cinco escenas por defecto; las cantidades explícitas tienen sus propias regresiones.
- `tests/social-intelligence.test.mjs`: la adaptación audiovisual se conserva en el brief. Siguen excluidos del guion las instrucciones, el texto en pantalla y las anotaciones de observación.
- `tests/opportunity-analysis.test.mjs`: la segunda evidencia del test de fingerprint tiene una URL distinta. Antes copiaba la URL y la fecha del primer registro, representando una duplicación que ahora se agrupa como una sola publicación. Se mantienen todas las aserciones de orden, cambios de evidencia e invalidación.
- `tests/social-core.test.mjs`: el escenario de invalidación audiovisual usa una publicación distinta del escenario anterior de procedencia. Antes ambos creaban la misma URL y dependían de que la captura duplicara el registro. Se mantienen las aserciones de invalidación y protección de campos.
  Las tres citas manuales de esos casos usan `example.com`: el dominio reservado `.test` ahora se rechaza como origen público. No se relaja esa validación para acomodar las pruebas.

Estas modificaciones no sustituyen las regresiones que fallaban con el código previo. La validación conjunta y sus resultados definitivos se registrarán en `SUMMARY.md`.

La publicación explícita añade una confirmación de versión y destino: consultar primero `GET /api/brands/:brandId/pieces/:id/publish` y enviar sus `expectedApprovalVersion` y `expectedDestinationKey` al POST correspondiente. Una confirmación vieja debe fallar antes de contactar al proveedor. `publishPiece` mantiene su firma interna. Un webhook aceptado no prueba que una red social haya publicado el contenido.

La captura manual devuelve 201 al crear y 200 al recuperar una publicación ya registrada en esa empresa. Los enlaces, versiones y procedencia anteriores se conservan. Cambiar el tipo de fuente descarta campos incompatibles; no convierte consultas de un proveedor en configuración de otro.

Durante la integración se aplica también un mínimo de 16px a los campos de texto y selectores en pantallas de hasta 900px, coherente con el buscador móvil corregido. Se comprueba en navegador junto con el recorrido final; no cambia validación, valores ni peticiones.
