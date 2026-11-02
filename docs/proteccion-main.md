# Protección de `main`

Fase 6A (02/11/2026). **Autorizada por la titular el 02/11/2026** (sin aprobaciones obligatorias de revisores, por ahora).

**Estado: autorizada, NO aplicada desde esta sesión.** Las herramientas de GitHub disponibles en la sesión de trabajo permiten leer ramas, ejecutar CI, abrir e integrar Pull Requests, pero **no configurar protecciones de rama ni *rulesets***, y no se usaron otros medios para eludir esa restricción. La titular (dueña del repositorio) debe aplicarla con los pasos de abajo; tarda unos minutos. Después de aplicarla, `list_branches` debe mostrar `main` con `protected: true`.

## Estado verificado

- `main` **no tiene reglas de protección** (API de GitHub: `protected: false`, 02/11/2026). Ninguna otra rama las tiene.
- Flujo actual: trabajo en `desarrollo/*` (o `claude/*`), integración a `main` por Pull Request (el último fue #1, `d7b3cf1`).
- CI (`.github/workflows/verificar.yml`) corre en cada push a `main` y `desarrollo/**` y en cada Pull Request. Trabajos: `base-de-datos`, `aplicacion` y `capturas` (este último solo en *push*, porque publica capturas en ramas `capturas*`).

## Cambio exacto propuesto

Regla de protección de rama (Settings › Branches › Add rule, o *ruleset*) para `main`:

| Opción | Valor | Motivo |
| --- | --- | --- |
| Require a pull request before merging | Sí | Nada entra a `main` sin revisión visible |
| Required approvals | **0** (con una sola persona con permisos de escritura, 1 aprobación bloquearía todo); subir a 1 si se suma otra persona | No bloquear el flujo operativo actual |
| Dismiss stale approvals when new commits are pushed | Sí | — |
| Require status checks to pass | Sí: `base-de-datos` y `aplicacion` | Son los trabajos que corren en Pull Request |
| Require branches to be up to date before merging | Sí | Evita integrar sobre una base vieja |
| Require conversation resolution | Sí | — |
| Require linear history | Opcional (el último merge fue un *merge commit*; activarla obliga a *squash* o *rebase*) | Decisión de estilo |
| Allow force pushes | **No** | Protege el historial |
| Allow deletions | **No** | Evita borrar `main` por accidente |
| Do not allow bypassing the above settings | Sí, también para administradores (con la excepción documentada de emergencia: desactivar la regla, actuar, reactivarla y registrarlo) | — |

**Ramas `capturas*`:** no se protegen (CI las reescribe con `push -f` a propósito). La regla debe aplicarse solo a `main`.

## Compatibilidad con el flujo actual (verificada leyendo el workflow)

- El trabajo `capturas` no corre en Pull Request: por eso **no** se exige como verificación obligatoria (si se exigiera, ningún Pull Request podría integrarse). Corre después, en el *push* a `main`.
- Los nombres de las verificaciones obligatorias deben coincidir con los trabajos (`base-de-datos`, `aplicacion`).
- Con 0 aprobaciones obligatorias, la titular puede integrar su propio Pull Request después de revisarlo; con 1, necesitaría otra persona con permisos.

## Cómo aplicarla (autorizado; pendiente de que la titular lo haga)

### Desde la interfaz de GitHub (recomendado)

1. Repositorio `lunaariel/Alba-Repository` › **Settings** › **Branches** › **Add branch protection rule** (o **Add classic branch protection rule**).
2. *Branch name pattern*: `main`.
3. Marcar **Require a pull request before merging**; *Required approvals*: **0**; marcar *Dismiss stale pull request approvals when new commits are pushed*.
4. Marcar **Require status checks to pass before merging** y *Require branches to be up to date before merging*. En el buscador de verificaciones, agregar **`base-de-datos`** y **`aplicacion`** (aparecen porque ya corrieron en el Pull Request de la Fase 6A). No agregar `capturas` (no corre en Pull Request).
5. Marcar **Require conversation resolution before merging**.
6. Marcar **Do not allow bypassing the above settings**.
7. Dejar **sin marcar** *Allow force pushes* y *Allow deletions*.
8. **Create** / **Save changes**.
9. Verificación: en *Branches*, `main` aparece con el candado; un `git push` directo a `main` debe ser rechazado.

### Con la API (equivalente)

Desde la interfaz (Settings › Branches) o con la API:

```bash
gh api -X PUT repos/lunaariel/Alba-Repository/branches/main/protection --input proteccion-main.json
```

con `proteccion-main.json`:

```json
{
  "required_status_checks": { "strict": true, "contexts": ["base-de-datos", "aplicacion"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "required_conversation_resolution": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Verificación posterior: intentar un `push` directo a `main` desde una rama de prueba (debe rechazarse) y abrir un Pull Request de prueba (debe esperar las dos verificaciones).
