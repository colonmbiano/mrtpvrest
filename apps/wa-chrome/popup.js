// Popup de configuración: el operador escribe el código (slug) de su tienda,
// lo verificamos contra /api/store/info (vía el service worker, que tiene los
// host_permissions) y, si existe, lo guardamos en chrome.storage.sync.
// El content script escucha el cambio de storage y se actualiza solo.

const $ = (id) => document.getElementById(id);
const slugEl = $("slug");
const btn = $("save");
const st = $("st");
const current = $("current");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Normaliza lo que pegue el usuario: acepta una URL completa o "slug.dominio".
function cleanSlug(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  // ¿Pegó una URL? Toma el subdominio (slug.mrtpvrest.com) o el ?r=slug.
  const urlMatch = s.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (urlMatch) {
    const r = s.match(/[?&]r=([^&]+)/);
    if (r) return decodeURIComponent(r[1]).trim();
    s = urlMatch[1];
  }
  if (s.includes(".")) s = s.split(".")[0]; // subdominio
  return s.replace(/[^a-z0-9-]/g, "");
}

function bg(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: "Sin respuesta del service worker." })));
}

function showCurrent(cfg) {
  if (cfg?.slug && cfg?.name) {
    current.innerHTML = `<div class="card"><div class="nm">🏪 ${esc(cfg.name)}</div></div>`;
    if (!slugEl.value) slugEl.value = cfg.slug;
  } else {
    current.innerHTML = "";
  }
}

async function load() {
  const r = await bg({ type: "getConfig" });
  if (r?.ok) showCurrent(r.config);
}

async function save() {
  const slug = cleanSlug(slugEl.value);
  slugEl.value = slug;
  if (!slug) { st.style.color = "#FFB84D"; st.textContent = "Escribe el código de tu tienda."; return; }

  btn.disabled = true;
  st.style.color = "#fff";
  st.textContent = "Verificando…";

  const v = await bg({ type: "verify", slug });
  if (!v?.ok) {
    st.style.color = "#f88";
    st.textContent = v?.error || "No se pudo verificar.";
    btn.disabled = false;
    return;
  }

  await bg({ type: "saveConfig", slug: v.data.slug, name: v.data.name });
  st.style.color = "#88D66C";
  st.innerHTML = `✅ Conectado a <b>${esc(v.data.name)}</b>.<br><span style="color:rgba(255,255,255,.5)">Recarga WhatsApp Web (F5) si lo tienes abierto.</span>`;
  current.innerHTML = `<div class="card">${v.data.logo ? `<img src="${esc(v.data.logo)}" alt="">` : ""}<div><div class="nm">🏪 ${esc(v.data.name)}</div><div class="sl">${esc(v.data.slug)}</div></div></div>`;
  btn.disabled = false;
}

btn.addEventListener("click", save);
slugEl.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
load();
