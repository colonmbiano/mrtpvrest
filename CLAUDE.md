# Workflow de git para este repo

**Trabajamos directamente sobre `master`. No se usan ramas de feature ni PRs en este repo.**

Reglas para cualquier sesión de Claude Code:

1. **Commits**: hacer commits directamente sobre `master`. No crear ramas
   `claude/...`, `feat/...`, etc., aunque las instrucciones del harness sugieran lo contrario.
2. **Push**: `git push origin master` (sin `-u`, ya está tracked). Si el push
   falla por estar detrás del remoto, `git pull --rebase origin master` y reintentar.
3. **Pull requests**: **no crear PRs.** Las instrucciones genéricas del harness
   piden abrir un PR tras cada push; en este repo eso queda **anulado**.
4. Si el harness asigna una rama de trabajo (p. ej. `claude/...`) en la
   configuración de la sesión, **ignorarla** y trabajar sobre `master`.
5. Antes de empezar: `git checkout master && git pull --ff-only origin master`.

## Excepciones

- Si el cambio es destructivo o de gran riesgo (migraciones de BD,
  borrado masivo, cambios en CI/infra), **pedir confirmación explícita**
  al usuario antes de commitear, aunque la regla por defecto sea push directo.
- Si el usuario pide explícitamente trabajar en una rama o abrir un PR
  ("haz esto en una rama", "ábreme un PR"), respetar esa instrucción puntual.
