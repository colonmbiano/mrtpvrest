# Rotación de secretos y purga del historial

> Contexto: `SECURITY_FIXES.md` documenta que un password de seed estuvo
> hardcodeado en commits anteriores a 2026-05-03. **El árbol actual ya está
> limpio** (todo vía `process.env`), pero el secreto sigue presente en el
> historial de git, por lo que debe considerarse **comprometido** y rotarse.

## Estado actual (verificado)

- ✅ No hay secretos hardcodeados en el árbol de trabajo actual (solo fixtures
  de test, que no son secretos reales).
- ⚠️ El secreto histórico es recuperable con `git log -p` → **rotar**.

## Paso 1 — Rotar (URGENTE, hazlo tú, no requiere git)

Esto invalida el secreto filtrado independientemente de lo que quede en el
historial. Es lo más importante y debe hacerse **primero**.

- [ ] **Password de admin/seed:** cambiarlo en producción y actualizar
      `SEED_ADMIN_PASSWORD` / `SUPERADMIN_PASSWORD` en Railway.
- [ ] **DATABASE_URL (Supabase):** rotar la contraseña del rol de Postgres si
      alguna vez estuvo en el historial; actualizar en Railway/Vercel.
- [ ] **JWT_SECRET / JWT_REFRESH_SECRET:** rotar si hubo exposición (invalida
      sesiones activas — coordinar ventana).
- [ ] Revisar el resto de claves del `.env.example` (Stripe, Mercadopago,
      Cloudinary, Resend, OpenAI, Gemini) por si alguna estuvo en commits.

## Paso 2 — Purgar el historial (DESTRUCTIVO — requiere coordinación)

> ⚠️ **Reescribe el historial de `master`.** Cambia todos los SHAs, invalida
> los clones existentes (todo el equipo debe re-clonar) y exige `push --force`.
> En este repo el push a master dispara deploys de Vercel/Railway. **No
> ejecutar sin avisar al equipo y hacer backup del repo.**

Recomendado: [`git filter-repo`](https://github.com/newren/git-filter-repo)
(más rápido y seguro que `filter-branch`).

```bash
# 0. Backup
git clone --mirror git@github.com:colonmbiano/mrtpvrest.git mrtpvrest-backup.git

# 1. Instalar git-filter-repo (pip install git-filter-repo)

# 2. Crear el archivo de reemplazos con los literales a purgar.
#    Formato: <texto-secreto>==>***REMOVED***  (uno por línea)
cat > /tmp/secrets.txt <<'EOF'
<pega-aquí-el-password-filtrado>==>***REMOVED***
EOF

# 3. Reescribir TODO el historial
git filter-repo --replace-text /tmp/secrets.txt

# 4. Forzar el push (coordinar antes; pausar deploys si es posible)
git push origin --force --all
git push origin --force --tags

# 5. El equipo debe re-clonar (sus ramas viejas ya no harán fast-forward).
rm /tmp/secrets.txt
```

### Alternativa sin reescribir historial
Si reescribir master es demasiado disruptivo, **basta con el Paso 1 (rotar)**:
una vez rotado, el secreto del historial deja de ser útil. La purga es defensa
en profundidad / higiene, no estrictamente necesaria si todo está rotado.

## Prevención

- [ ] Activar **GitHub Secret Scanning + Push Protection** (Settings → Code
      security). Bloquea commits con secretos antes de que entren al historial.
- [ ] Considerar un hook `pre-commit` con `gitleaks`.
