# Corrección de la auditoría adversarial

Estado: correcciones integradas y verificadas. Consulta los [resultados y responsables](SUMMARY.md), la [validación conjunta](validation.json) o el [reporte interactivo](review.html).

Se asigna un agente distinto a cada uno de los 25 defectos agrupados en [la auditoría](../adversarial/SUMMARY.md). El duplicado de referencias cubre dos hallazgos de la misma causa. Los agentes trabajan en tandas, con regiones de código coordinadas y datos de prueba propios.

`assignments.json` registra el responsable de cada defecto. Cada entrega incluye causa, cambio y verificación antes/después en `reports/`. El coordinador integra los cambios y repite pruebas y recorridos antes de cerrar el conjunto. Los informes adversariales originales se mantienen como evidencia de la versión anterior.

Base: 170 tests aprobados antes de empezar; ese resultado no cubría los defectos que encontró la revisión interactiva. El [contrato de corrección](BRIEF.md) exige comprobar el síntoma original, proteger permisos/datos y distinguir simulación de proveedores reales.
