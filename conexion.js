/**
 * MONITOR CAE – conexión GitHub Pages ⇄ Apps Script
 * Imita google.script.run para que la pantalla original funcione igual,
 * pero cada llamada viaja al motor de Apps Script junto con la clave de acceso.
 * Va en el <head> de index.html, ANTES de cualquier otro <script>.
 */
(function () {
  const API = 'https://script.google.com/macros/s/AKfycbzaaSc8juzpfn88qGOF7qpENtaTe0Gc6wLXf3sbpHjhEi5q5tpaSYwbMYwkQHLfHULGVg/exec';
  const KEY = 'mcae_clave';

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

  // ---- pantalla de acceso ----
  function mostrarAcceso(msg) {
    if (document.getElementById('mcae-acceso')) return;
    const d = document.createElement('div');
    d.id = 'mcae-acceso';
    d.innerHTML =
      '<div style="position:fixed;inset:0;background:#0B5345;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif">' +
      '<form style="background:#fff;padding:28px 32px;border-radius:12px;width:min(340px,90vw);box-shadow:0 10px 30px rgba(0,0,0,.25)">' +
      '<h2 style="margin:0 0 4px;color:#0B5345">Monitor CAE</h2>' +
      '<p style="margin:0 0 18px;color:#555;font-size:14px">Receta Completa · OOAD Yucatán</p>' +
      '<label style="font-size:13px;color:#333">Clave de acceso</label>' +
      '<input id="mcae-clave" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:10px;margin:6px 0 12px;border:1px solid #bbb;border-radius:8px;font-size:15px">' +
      '<div id="mcae-msg" style="color:#b00020;font-size:13px;min-height:18px;margin-bottom:8px">' + (msg || '') + '</div>' +
      '<button style="width:100%;padding:10px;border:0;border-radius:8px;background:#0B5345;color:#fff;font-size:15px;cursor:pointer">Entrar</button>' +
      '</form></div>';
    document.body.appendChild(d);
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
    try { window.MonitorCAE.perfil = await llamar('apiLogin', []); document.dispatchEvent(new CustomEvent('mcae-perfil', { detail: window.MonitorCAE.perfil })); }
    catch (e) { /* mostrarAcceso ya se encargó */ }
  });
})();
