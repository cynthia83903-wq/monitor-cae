/**
 * MONITOR CAE – conexión monitorcae.com ⇄ Apps Script
 * Imita google.script.run para que la pantalla original funcione igual,
 * pero cada llamada viaja al motor de Apps Script junto con la clave de acceso.
 * Va en el <head> de index.html, ANTES de cualquier otro <script>.
 */
(function () {
  const API = 'https://script.google.com/macros/s/AKfycbzaaSc8juzpfn88qGOF7qpENtaTe0Gc6wLXf3sbpHjhEi5q5tpaSYwbMYwkQHLfHULGVg/exec';
  const KEY = 'mcae_clave';

  // ---- cortina de carga ----
  // Tapa el esqueleto de la app desde el primer instante (antes de que exista <body>),
  // con el mismo diseño de la pantalla de acceso. Se quita sola cuando la app ya tiene datos.
  (function ponerCortina() {
    const css =
      'html.mcae-cargando{background:#0B5345}' +
      'html.mcae-cargando body{visibility:hidden}' +
      'html.mcae-cargando #mcae-acceso{visibility:visible}' +
      'html.mcae-cargando::before{content:"";position:fixed;inset:0;background:#0B5345;z-index:99990}' +
      'html.mcae-cargando::after{content:"Monitor CAE\\A Cargando…";white-space:pre;position:fixed;top:50%;left:50%;' +
      'transform:translate(-50%,-50%);background:#fff;color:#0B5345;padding:28px 32px;border-radius:12px;' +
      'width:min(340px,90vw);box-sizing:border-box;box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center;' +
      'font:600 20px/1.6 system-ui,sans-serif;z-index:99991}' +
      'html.mcae-sin-cortina body{animation:mcaeAparece .25s ease-out}' +
      '@keyframes mcaeAparece{from{opacity:0}to{opacity:1}}';
    const st = document.createElement('style');
    st.id = 'mcae-cortina-css';
    st.textContent = css;
    document.head ? document.head.appendChild(st) : document.documentElement.appendChild(st);
    document.documentElement.classList.add('mcae-cargando');
    // Seguro: si algo falla, a los 25 s se quita para no dejar la pantalla tapada.
    setTimeout(quitarCortina, 25000);
  })();
  function quitarCortina() {
    const h = document.documentElement;
    if (!h.classList.contains('mcae-cargando')) return;
    h.classList.remove('mcae-cargando');
    h.classList.add('mcae-sin-cortina');
  }
  // Quita la cortina en cuanto la app (#vApp) se hace visible.
  function vigilarApp() {
    const app = document.getElementById('vApp');
    if (!app) { quitarCortina(); return; }
    if (!app.classList.contains('hide')) { quitarCortina(); return; }
    const mo = new MutationObserver(() => {
      if (!app.classList.contains('hide')) { mo.disconnect(); quitarCortina(); }
    });
    mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  }

  function leerClave() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return window.__mcaeClave || ''; } }
  function guardarClave(c) { try { sessionStorage.setItem(KEY, c); } catch (e) { window.__mcaeClave = c; } }
  function borrarClave() { try { sessionStorage.removeItem(KEY); } catch (e) { window.__mcaeClave = ''; } }

  async function llamar(fn, args, clave) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita el bloqueo CORS
      body: JSON.stringify({ fn: fn, args: args, clave: clave || leerClave() })
    });
    const j = await r.json();
    if (!j.ok) {
      if (/Clave de acceso/.test(j.error)) { borrarClave(); mostrarAcceso(j.error); }
      throw new Error(j.error);
    }
    return j.data;
  }

  // ---- emulación de google.script.run ----
  function crearRunner(ok, fail) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return f => crearRunner(f, fail);
        if (prop === 'withFailureHandler') return f => crearRunner(ok, f);
        if (prop === 'withUserObject') return () => crearRunner(ok, fail);
        return (...args) => {
          llamar(prop, args).then(d => {
            if (prop === 'apiPin' && d === true) guardarClave(String(args[0]));
            ok && ok(d);
          }).catch(e => { fail ? fail(e) : console.error(e); });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = { run: crearRunner(null, null) };
  window.MonitorCAE = { llamar: llamar, salir: () => { borrarClave(); location.reload(); }, perfil: null };

  // ---- pantalla de acceso (portada) ----
  const FONDO = 'fondo-cae.webp';
  const CSS_ACCESO =
    '#mcae-acceso .pt{position:fixed;inset:0;z-index:99999;background:#0B5345;font-family:"Segoe UI",system-ui,sans-serif;overflow:auto}' +
    '#mcae-acceso .pt-img{position:fixed;inset:0;background:url(' + FONDO + ') center/cover no-repeat;opacity:0;transform:scale(1);transition:opacity 1.2s ease;will-change:transform}' + '#mcae-acceso .pt.ok .pt-img{opacity:1;animation:mcaeZoom 20s ease-out forwards}@keyframes mcaeZoom{from{transform:scale(1)}to{transform:scale(1.12)}}@media (prefers-reduced-motion:reduce){#mcae-acceso .pt.ok .pt-img{animation:none}}' +
    '#mcae-acceso .pt-velo{position:absolute;inset:0;background:linear-gradient(100deg,rgba(11,58,48,.94) 0%,rgba(11,83,69,.86) 38%,rgba(11,83,69,.55) 70%,rgba(11,83,69,.35) 100%)}' +
    '#mcae-acceso .pt-in{position:relative;min-height:100%;display:flex;align-items:center;justify-content:space-between;gap:48px;padding:48px 7vw;box-sizing:border-box;flex-wrap:wrap}' +
    '#mcae-acceso .pt-tx{color:#fff;max-width:520px;flex:1 1 320px}' +
    '#mcae-acceso .pt-tx small{display:block;letter-spacing:.14em;text-transform:uppercase;font-size:12px;opacity:.85}' +
    '#mcae-acceso .pt-tx h1{font-size:clamp(34px,5vw,56px);line-height:1.05;margin:10px 0 14px;font-weight:700}' +
    '#mcae-acceso .pt-tx .ln{width:64px;height:4px;background:#B38E5D;border-radius:2px;margin-bottom:16px}' +
    '#mcae-acceso .pt-tx p{font-size:16px;line-height:1.55;margin:0;opacity:.92}' +
    '#mcae-acceso form{background:#fff;padding:30px 32px;border-radius:14px;width:min(360px,100%);box-sizing:border-box;box-shadow:0 18px 50px rgba(0,0,0,.35);flex:0 0 auto}' +
    '#mcae-acceso form h2{margin:0 0 4px;color:#0B5345;font-size:22px}' +
    '#mcae-acceso form .s{margin:0 0 18px;color:#5a6b65;font-size:13px}' +
    '#mcae-acceso label{font-size:13px;color:#333}' +
    '#mcae-acceso input{width:100%;box-sizing:border-box;padding:11px;margin:6px 0 10px;border:1px solid #bbb;border-radius:8px;font-size:15px}' +
    '#mcae-acceso input:focus{outline:2px solid #B38E5D;border-color:#B38E5D}' +
    '#mcae-acceso .m{color:#b00020;font-size:13px;min-height:18px;margin-bottom:8px}' +
    '#mcae-acceso button{width:100%;padding:11px;border:0;border-radius:8px;background:#0B5345;color:#fff;font-size:15px;cursor:pointer}' +
    '#mcae-acceso button:hover{background:#13322B}' +
    '@media (max-width:760px){#mcae-acceso .pt-velo{background:rgba(11,83,69,.86)}#mcae-acceso .pt-in{justify-content:center;padding:32px 20px}' +
    '#mcae-acceso .pt-tx{text-align:center;flex-basis:100%}#mcae-acceso .pt-tx .ln{margin:0 auto 14px}#mcae-acceso .pt-tx p{display:none}}';
  function mostrarAcceso(msg) {
    if (document.getElementById('mcae-acceso')) return;
    const d = document.createElement('div');
    d.id = 'mcae-acceso';
    d.innerHTML =
      '<style>' + CSS_ACCESO + '</style>' +
      '<div class="pt"><div class="pt-img"></div><div class="pt-velo"></div><div class="pt-in">' +
      '<div class="pt-tx"><small>IMSS · OOAD Yucatán</small><h1>Monitor CAE</h1><div class="ln"></div>' +
      '<p>Seguimiento a los reportes de Receta Completa: atención directa y oportuna al paciente, con el equipo multidisciplinario de cada unidad médica.</p></div>' +
      '<form><h2>Acceso</h2><p class="s">Coordinación de Abastecimiento y Equipamiento</p>' +
      '<label for="mcae-clave">Clave de acceso</label>' +
      '<input id="mcae-clave" type="password" autocomplete="current-password" required>' +
      '<div id="mcae-msg" class="m">' + (msg || '') + '</div>' +
      '<button>Entrar</button>' +
      '</form></div></div>';
    document.body.appendChild(d);
    quitarCortina(); // la pantalla de acceso ya cubre todo
    // La foto aparece suave cuando termina de cargar; si falla, se queda el verde.
    const pre = new Image();
    pre.onload = () => d.querySelector('.pt').classList.add('ok');
    pre.src = FONDO;
    d.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const c = d.querySelector('#mcae-clave').value.trim();
      d.querySelector('#mcae-msg').textContent = 'Verificando…';
      try {
        const p = await llamar('apiLogin', [], c);
        guardarClave(c);
        location.reload();
      } catch (e) { d.querySelector('#mcae-msg').textContent = e.message; }
    });
    setTimeout(() => d.querySelector('#mcae-clave').focus(), 50);
  }

  // Al cargar: si no hay clave, pide acceso antes de mostrar nada.
  document.addEventListener('DOMContentLoaded', async () => {
    if (!leerClave()) { mostrarAcceso(); return; }
    vigilarApp();
    try { window.MonitorCAE.perfil = await llamar('apiLogin', []); document.dispatchEvent(new CustomEvent('mcae-perfil', { detail: window.MonitorCAE.perfil })); }
    catch (e) { quitarCortina(); /* si fue la clave, mostrarAcceso ya se encargó */ }
  });
})();
