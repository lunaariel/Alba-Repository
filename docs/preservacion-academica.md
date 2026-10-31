# Reglas de preservación del historial académico

Vigentes desde la Fase 5, entrega 2. Se aplican en la base de datos (migración 0013): ni el panel ni un script pueden saltearlas.

**Principio:** lo que un alumno ya hizo (avance, intentos, puntajes, certificados, compras) nunca se borra ni se recalcula hacia atrás cuando la administradora edita un curso. Lo que tiene historial se **retira**, no se elimina. Un elemento retirado:
- deja de verse en el sitio y en el campus,
- deja de contar para el avance, la evaluación y el certificado,
- conserva todos sus registros,
- se puede restaurar.

| Cambio | Sin alumnos ni historial | Con historial (avance, intentos, compras o certificados) |
| --- | --- | --- |
| Editar título, textos, duración, video, materiales | Libre | Libre. No toca el avance ni los resultados |
| Cambiar el precio | Libre | Libre. Solo afecta a compras futuras; cada orden guarda su precio |
| Volver un curso publicado a borrador | Libre | **Bloqueado**: quien lo compró conserva el acceso. Se puede archivar |
| Archivar un curso | Libre | Libre. Quien lo compró conserva el acceso |
| Eliminar un curso | Solo si nunca tuvo accesos, órdenes ni certificados | **Bloqueado**. Se archiva |
| Agregar una lección | Libre | Permitido con aviso: los alumnos sin certificado la necesitan para terminar. Los certificados emitidos no cambian |
| Eliminar una lección o un módulo | Libre | **Bloqueado** si alguien la completó o la visitó. Se retira |
| Retirar la última lección vigente de un curso publicado | — | **Bloqueado**: un curso publicado necesita al menos una lección |
| Editar el texto de una pregunta o de una opción | Libre | Permitido. Los intentos anteriores conservan su puntaje |
| Cambiar la respuesta correcta | Libre | Permitido y registrado. Solo afecta a intentos futuros; los puntajes y certificados anteriores no se recalculan |
| Eliminar una pregunta | Libre | **Bloqueado** si fue respondida. Se retira (no cuenta en intentos futuros) |
| Eliminar una opción | Libre | **Bloqueado** si su pregunta fue respondida (las respuestas guardadas la referencian). Se puede editar |
| Retirar la última pregunta vigente de un curso publicado | — | **Bloqueado** |
| Cambiar puntaje mínimo o intentos permitidos | Libre | Permitido y registrado. Solo hacia adelante |

Además:
- Los certificados guardan, al emitirse, el nombre del alumno y el título del curso. Editar el curso no los modifica.
- Cada retiro, restauración, eliminación y cambio de respuesta correcta queda en el registro de actividad.
