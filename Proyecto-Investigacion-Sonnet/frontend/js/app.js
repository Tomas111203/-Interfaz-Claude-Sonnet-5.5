(function () {
  'use strict';

  var API = 'https://backend-sonnet-5-5.fly.dev/api/equipos';
  var app = document.getElementById('app');
  var renderToken = 0;

  var TIPOS = { desktop: 'Desktop', laptop: 'Laptop', monitor: 'Monitor', impresora: 'Impresora', servidor: 'Servidor', otro: 'Otro' };
  var ESTADOS = { activo: 'Activo', en_reparacion: 'En reparación', baja: 'Baja', almacen: 'Almacén' };

  /* ---------- utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function etiqueta(map, k) { return map[k] || k; }
  function val(v) { return (v === null || v === undefined || v === '') ? '<span class="empty">—</span>' : esc(v); }
  function fecha(s) {
    if (!s) return '<span class="empty">—</span>';
    var p = String(s).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : esc(s);
  }
  function fechaHora(s) {
    if (!s) return '—';
    var d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
    return isNaN(d) ? esc(s) : d.toLocaleString('es-MX');
  }
  function badge(estado) { return '<span class="badge ' + esc(estado) + '">' + esc(etiqueta(ESTADOS, estado)) + '</span>'; }
  function opciones(map, sel, vacio) {
    var h = vacio ? '<option value="">' + esc(vacio) + '</option>' : '';
    Object.keys(map).forEach(function (k) {
      h += '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    });
    return h;
  }
  function cargando(msg) { app.innerHTML = '<div class="state"><div class="spinner"></div>' + esc(msg || 'Cargando...') + '</div>'; }
  function toast(msg, tipo) {
    var t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  }

  /* ---------- API ---------- */
  var MSG_ES = {
    string_too_short: 'Este campo es obligatorio.',
    string_too_long: 'El texto es demasiado largo.',
    missing: 'Este campo es obligatorio.',
    greater_than_equal: 'El valor es menor al mínimo permitido.',
    less_than_equal: 'El valor excede el máximo permitido.',
    int_parsing: 'Debe ser un número entero.',
    date_from_datetime_parsing: 'Fecha no válida.',
    date_parsing: 'Fecha no válida.',
    enum: 'Valor no permitido.',
    uuid_parsing: 'Identificador no válido.'
  };

  function ApiError(status, mensaje, campos) {
    this.status = status; this.mensaje = mensaje; this.campos = campos || {};
  }

  function api(method, url, body) {
    var opts = { method: method, headers: { 'Accept': 'application/json' } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* no JSON */ }
        if (res.ok) return data;
        var mensaje = 'Ocurrió un error inesperado (código ' + res.status + ').', campos = {};
        if (res.status === 404) mensaje = 'El equipo no fue encontrado. Es posible que ya haya sido eliminado.';
        else if (res.status >= 500) mensaje = 'Error en el servidor. Intente de nuevo más tarde.';
        if (data && typeof data.detail === 'string') {
          if (res.status === 409) mensaje = data.detail;
          if (res.status === 409) {
            if (/inventario/i.test(data.detail)) campos.numero_inventario = data.detail;
            else if (/serie/i.test(data.detail)) campos.numero_serie = data.detail;
          }
        } else if (data && Array.isArray(data.detail)) {
          mensaje = 'Hay datos no válidos. Revise los campos marcados.';
          data.detail.forEach(function (d) {
            var campo = d.loc && d.loc[d.loc.length - 1];
            campos[campo] = MSG_ES[d.type] || 'Valor no válido.';
          });
        }
        throw new ApiError(res.status, mensaje, campos);
      });
    }, function () {
      throw new ApiError(0, 'No se pudo conectar con el servidor. Verifique su conexión.');
    });
  }

  function errorVista(e, reintentar) {
    app.innerHTML = '<div class="alert">' + esc(e.mensaje || 'Error inesperado') + '</div>' +
      '<div class="actions">' + (reintentar ? '<button class="btn primary" id="reintentar">Reintentar</button>' : '') +
      '<a class="btn" href="/equipos" data-link>Volver al listado</a></div>';
    if (reintentar) document.getElementById('reintentar').onclick = reintentar;
  }

  /* ---------- enrutador ---------- */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function navegar(url, reemplazar) {
    if (reemplazar) history.replaceState(null, '', url); else history.pushState(null, '', url);
    render();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    navegar(a.getAttribute('href'));
  });
  window.addEventListener('popstate', render);

  function marcarNav(clave) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === clave);
    });
  }

  function render() {
    renderToken++;
    cerrarModal();
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var m;
    window.scrollTo(0, 0);
    if (path === '/' || path === '/index.html' || path === '/estadisticas') {
      if (path !== '/') history.replaceState(null, '', '/');
      document.title = 'Estadísticas | Inventario de Equipos'; marcarNav('inicio'); vistaStats();
    } else if (path === '/equipos') {
      document.title = 'Equipos | Inventario de Equipos'; marcarNav('equipos'); vistaLista();
    } else if (path === '/equipos/nuevo') {
      document.title = 'Registrar equipo | Inventario de Equipos'; marcarNav('nuevo'); vistaForm(null);
    } else if ((m = path.match(/^\/equipos\/([^/]+)\/editar$/))) {
      document.title = 'Editar equipo | Inventario de Equipos'; marcarNav('equipos'); vistaForm(m[1]);
    } else if ((m = path.match(/^\/equipos\/([^/]+)$/))) {
      document.title = 'Detalle de equipo | Inventario de Equipos'; marcarNav('equipos'); vistaDetalle(m[1]);
    } else {
      document.title = 'No encontrada | Inventario de Equipos'; marcarNav('');
      app.innerHTML = '<div class="state"><h1>Página no encontrada</h1><p>La dirección solicitada no existe.</p><a class="btn primary" href="/equipos" data-link>Ir al listado de equipos</a></div>';
    }
  }

  /* ---------- modal de confirmación ---------- */
  function cerrarModal() { document.getElementById('modal-root').innerHTML = ''; }

  function confirmarEliminar(equipo, alTerminar) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true">' +
      '<h2>Eliminar equipo</h2>' +
      '<p>¿Está seguro de que desea eliminar el equipo <strong>' + esc(equipo.numero_inventario) + '</strong> (' + esc(equipo.marca) + ' ' + esc(equipo.modelo) + ')? Esta acción no se puede deshacer.</p>' +
      '<div class="form-actions"><button class="btn" id="m-cancel">Cancelar</button><button class="btn danger" id="m-ok">Sí, eliminar</button></div></div></div>';
    var ok = document.getElementById('m-ok');
    document.getElementById('m-cancel').onclick = cerrarModal;
    root.querySelector('.overlay').addEventListener('mousedown', function (e) { if (e.target === this) cerrarModal(); });
    ok.focus();
    ok.onclick = function () {
      ok.disabled = true; ok.textContent = 'Eliminando...';
      api('DELETE', API + '/' + encodeURIComponent(equipo.id)).then(function () {
        cerrarModal(); toast('Equipo eliminado correctamente.', 'ok'); alTerminar();
      }).catch(function (e) {
        cerrarModal(); toast(e.mensaje, 'error');
        if (e.status === 404) alTerminar();
      });
    };
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarModal(); });

  /* ---------- vista: estadísticas ---------- */
  function barras(obj, etiquetas) {
    var claves = Object.keys(obj || {});
    if (!claves.length) return '<p class="subtitle">Sin datos.</p>';
    claves.sort(function (a, b) { return obj[b] - obj[a]; });
    var max = Math.max.apply(null, claves.map(function (k) { return obj[k]; })) || 1;
    return claves.map(function (k) {
      var nombre = etiquetas ? etiqueta(etiquetas, k) : k;
      return '<div class="bar-row"><span class="name" title="' + esc(nombre) + '">' + esc(nombre) + '</span>' +
        '<div class="bar"><span style="width:' + (obj[k] / max * 100) + '%"></span></div><span class="val">' + obj[k] + '</span></div>';
    }).join('');
  }

  function vistaStats() {
    var token = renderToken;
    cargando('Cargando estadísticas...');
    api('GET', API + '/stats').then(function (s) {
      if (token !== renderToken) return;
      var kpis = '<div class="kpi"><div class="n">' + s.total_equipos + '</div><div class="l">Total de equipos</div></div>';
      Object.keys(ESTADOS).forEach(function (k) {
        var n = (s.por_estado && s.por_estado[k]) || 0;
        kpis += '<a class="kpi ' + k + '" href="/equipos?estado=' + k + '" data-link style="color:inherit;text-decoration:none"><div class="n">' + n + '</div><div class="l">' + ESTADOS[k] + '</div></a>';
      });
      app.innerHTML =
        '<div class="page-head"><div><h1>Estadísticas generales</h1><p class="subtitle">Resumen del inventario de equipos de cómputo.</p></div>' +
        '<div class="actions"><a class="btn primary" href="/equipos/nuevo" data-link>+ Registrar equipo</a></div></div>' +
        '<div class="kpis">' + kpis + '</div>' +
        '<div class="grid-3">' +
        '<div class="card"><h2>Por estado</h2>' + barras(s.por_estado, ESTADOS) + '</div>' +
        '<div class="card"><h2>Por tipo</h2>' + barras(s.por_tipo, TIPOS) + '</div>' +
        '<div class="card"><h2>Por laboratorio</h2>' + barras(s.por_laboratorio) + '</div></div>';
    }).catch(function (e) { if (token === renderToken) errorVista(e, vistaStats); });
  }

  /* ---------- vista: listado ---------- */
  var PAGE_SIZE = 20;

  function vistaLista() {
    var token = renderToken;
    var q = new URLSearchParams(location.search);
    var f = {
      busqueda: q.get('busqueda') || '', estado: q.get('estado') || '', tipo_equipo: q.get('tipo_equipo') || '',
      laboratorio: q.get('laboratorio') || '', page: Math.max(1, parseInt(q.get('page'), 10) || 1)
    };

    app.innerHTML =
      '<div class="page-head"><div><h1>Equipos</h1><p class="subtitle" id="resumen">&nbsp;</p></div>' +
      '<div class="actions"><a class="btn primary" href="/equipos/nuevo" data-link>+ Registrar equipo</a></div></div>' +
      '<form class="card filters" id="filtros" autocomplete="off">' +
      '<div><label for="f-busqueda">Búsqueda</label><input id="f-busqueda" type="search" placeholder="Inventario, marca, modelo, serie..." value="' + esc(f.busqueda) + '"></div>' +
      '<div><label for="f-estado">Estado</label><select id="f-estado">' + opciones(ESTADOS, f.estado, 'Todos') + '</select></div>' +
      '<div><label for="f-tipo">Tipo</label><select id="f-tipo">' + opciones(TIPOS, f.tipo_equipo, 'Todos') + '</select></div>' +
      '<div><label for="f-lab">Laboratorio</label><select id="f-lab"><option value="">Todos</option>' +
      (f.laboratorio ? '<option value="' + esc(f.laboratorio) + '" selected>' + esc(f.laboratorio) + '</option>' : '') + '</select></div>' +
      '<div><button type="button" class="btn" id="limpiar">Limpiar</button></div></form>' +
      '<div class="card" id="resultado"><div class="state"><div class="spinner"></div>Cargando equipos...</div></div>';

    // Laboratorios disponibles desde las estadísticas
    api('GET', API + '/stats').then(function (s) {
      if (token !== renderToken) return;
      var sel = document.getElementById('f-lab');
      var labs = Object.keys(s.por_laboratorio || {}).sort();
      if (f.laboratorio && labs.indexOf(f.laboratorio) < 0) labs.push(f.laboratorio);
      sel.innerHTML = '<option value="">Todos</option>' + labs.map(function (l) {
        return '<option value="' + esc(l) + '"' + (l === f.laboratorio ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('');
    }).catch(function () { /* el filtro de laboratorio queda con lo ya seleccionado */ });

    function aplicar(resetPagina) {
      var p = new URLSearchParams();
      var b = document.getElementById('f-busqueda').value.trim();
      if (b) p.set('busqueda', b);
      [['estado', 'f-estado'], ['tipo_equipo', 'f-tipo'], ['laboratorio', 'f-lab']].forEach(function (x) {
        var v = document.getElementById(x[1]).value; if (v) p.set(x[0], v);
      });
      if (!resetPagina && f.page > 1) p.set('page', f.page);
      var s = p.toString();
      navegar('/equipos' + (s ? '?' + s : ''), true);
    }
    var timer;
    document.getElementById('f-busqueda').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { f.page = 1; aplicar(true); }, 400); });
    ['f-estado', 'f-tipo', 'f-lab'].forEach(function (id) { document.getElementById(id).addEventListener('change', function () { aplicar(true); }); });
    document.getElementById('filtros').addEventListener('submit', function (e) { e.preventDefault(); });
    document.getElementById('limpiar').onclick = function () { navegar('/equipos', true); };

    var params = new URLSearchParams({ page: f.page, page_size: PAGE_SIZE });
    ['busqueda', 'estado', 'tipo_equipo', 'laboratorio'].forEach(function (k) { if (f[k]) params.set(k, f[k]); });

    function cargar() {
      api('GET', API + '?' + params.toString()).then(function (r) {
        if (token !== renderToken) return;
        var tot = r.total, paginas = Math.max(1, Math.ceil(tot / r.page_size));
        document.getElementById('resumen').textContent = tot + (tot === 1 ? ' equipo encontrado' : ' equipos encontrados');
        var box = document.getElementById('resultado');
        if (!r.equipos.length) {
          if (tot > 0 && f.page > 1) { f.page = paginas; params.set('page', paginas); return cargar(); }
          box.innerHTML = '<div class="state">No se encontraron equipos con los criterios indicados.</div>';
          return;
        }
        var filas = r.equipos.map(function (e) {
          return '<tr><td><a href="/equipos/' + esc(e.id) + '" data-link><strong>' + esc(e.numero_inventario) + '</strong></a></td>' +
            '<td>' + esc(etiqueta(TIPOS, e.tipo_equipo)) + '</td><td>' + esc(e.marca) + '</td><td>' + esc(e.modelo) + '</td>' +
            '<td>' + esc(e.numero_serie) + '</td><td>' + esc(e.laboratorio) + '</td><td>' + badge(e.estado) + '</td>' +
            '<td class="acciones"><a class="btn small" href="/equipos/' + esc(e.id) + '" data-link>Ver</a>' +
            '<a class="btn small" href="/equipos/' + esc(e.id) + '/editar" data-link>Editar</a>' +
            '<button class="btn small outline-danger" data-del="' + esc(e.id) + '">Eliminar</button></td></tr>';
        }).join('');
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Inventario</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>N.º de serie</th><th>Laboratorio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
          '<div class="pager"><span>Página ' + r.page + ' de ' + paginas + '</span><div class="btns">' +
          '<button class="btn small" id="prev"' + (r.page <= 1 ? ' disabled' : '') + '>← Anterior</button>' +
          '<button class="btn small" id="next"' + (r.page >= paginas ? ' disabled' : '') + '>Siguiente →</button></div></div>';
        var porId = {}; r.equipos.forEach(function (e) { porId[e.id] = e; });
        box.querySelectorAll('[data-del]').forEach(function (b) {
          b.onclick = function () { confirmarEliminar(porId[b.getAttribute('data-del')], render); };
        });
        document.getElementById('prev').onclick = function () { f.page = r.page - 1; aplicar(false); };
        document.getElementById('next').onclick = function () { f.page = r.page + 1; aplicar(false); };
      }).catch(function (e) {
        if (token !== renderToken) return;
        document.getElementById('resultado').innerHTML = '<div class="alert">' + esc(e.mensaje) + '</div><button class="btn primary" id="reintentar">Reintentar</button>';
        document.getElementById('reintentar').onclick = cargar;
      });
    }
    cargar();
  }

  /* ---------- vista: detalle ---------- */
  function vistaDetalle(id) {
    var token = renderToken;
    if (!UUID_RE.test(id)) return errorVista(new ApiError(404, 'El identificador del equipo no es válido.'));
    cargando('Cargando equipo...');
    api('GET', API + '/' + id).then(function (e) {
      if (token !== renderToken) return;
      function item(l, v, full) { return '<div' + (full ? ' class="full"' : '') + '><dt>' + l + '</dt><dd>' + v + '</dd></div>'; }
      app.innerHTML =
        '<div class="page-head"><div><p class="subtitle"><a href="/equipos" data-link>← Volver al listado</a></p>' +
        '<h1>' + esc(e.marca) + ' ' + esc(e.modelo) + '</h1><p class="subtitle">Inventario ' + esc(e.numero_inventario) + ' · ' + badge(e.estado) + '</p></div>' +
        '<div class="actions"><a class="btn primary" href="/equipos/' + esc(e.id) + '/editar" data-link>Editar</a>' +
        '<button class="btn outline-danger" id="eliminar">Eliminar</button></div></div>' +
        '<div class="card"><h2>Identificación</h2><dl class="detail-grid">' +
        item('Número de inventario', val(e.numero_inventario)) + item('Número de serie', val(e.numero_serie)) +
        item('Tipo de equipo', esc(etiqueta(TIPOS, e.tipo_equipo))) + item('Marca', val(e.marca)) + item('Modelo', val(e.modelo)) +
        item('Estado', badge(e.estado)) + '</dl></div>' +
        '<div class="card"><h2>Especificaciones</h2><dl class="detail-grid">' +
        item('Procesador', val(e.procesador)) + item('Memoria RAM', e.ram_gb ? esc(e.ram_gb) + ' GB' : val(null)) +
        item('Almacenamiento', val(e.almacenamiento)) + item('Sistema operativo', val(e.sistema_operativo)) + '</dl></div>' +
        '<div class="card"><h2>Ubicación y control</h2><dl class="detail-grid">' +
        item('Laboratorio', val(e.laboratorio)) + item('Ubicación', val(e.ubicacion)) + item('Responsable', val(e.responsable)) +
        item('Fecha de adquisición', fecha(e.fecha_adquisicion)) + item('Fecha de última revisión', fecha(e.fecha_ultima_revision)) +
        item('Observaciones', val(e.observaciones), true) + '</dl></div>' +
        '<div class="card"><dl class="detail-grid">' + item('Registrado el', fechaHora(e.created_at)) + item('Última actualización', fechaHora(e.updated_at)) +
        item('ID', '<code>' + esc(e.id) + '</code>') + '</dl></div>';
      document.getElementById('eliminar').onclick = function () {
        confirmarEliminar(e, function () { navegar('/equipos'); });
      };
    }).catch(function (e) { if (token === renderToken) errorVista(e, e.status === 404 ? null : function () { vistaDetalle(id); }); });
  }

  /* ---------- vista: formulario (crear / editar) ---------- */
  var CAMPOS_TEXTO_OPC = ['procesador', 'almacenamiento', 'sistema_operativo', 'ubicacion', 'responsable', 'observaciones'];

  function vistaForm(id) {
    var token = renderToken;
    if (id === null) return pintarForm(null, token);
    if (!UUID_RE.test(id)) return errorVista(new ApiError(404, 'El identificador del equipo no es válido.'));
    cargando('Cargando equipo...');
    api('GET', API + '/' + id).then(function (e) {
      if (token === renderToken) pintarForm(e, token);
    }).catch(function (e) { if (token === renderToken) errorVista(e, e.status === 404 ? null : function () { vistaForm(id); }); });
  }

  function pintarForm(eq, token) {
    var edit = !!eq; eq = eq || { tipo_equipo: 'desktop', estado: 'activo' };
    function campo(name, label, opts) {
      opts = opts || {};
      var v = eq[name] == null ? '' : eq[name];
      var cls = opts.cls ? ' class="' + opts.cls + '"' : '';
      var req = opts.req ? ' <span class="req">*</span>' : '';
      var input;
      if (opts.tipo === 'select') input = '<select id="c-' + name + '" name="' + name + '">' + opciones(opts.map, v) + '</select>';
      else if (opts.tipo === 'textarea') input = '<textarea id="c-' + name + '" name="' + name + '" rows="3">' + esc(v) + '</textarea>';
      else input = '<input id="c-' + name + '" name="' + name + '" type="' + (opts.tipo || 'text') + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : '') +
        (opts.tipo === 'number' ? ' min="1" max="1024" step="1"' : '') + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + ' value="' + esc(v) + '">';
      return '<div' + cls + '><label for="c-' + name + '">' + label + req + '</label>' + input + '<div class="err" id="e-' + name + '"></div></div>';
    }
    app.innerHTML =
      '<div class="page-head"><div><p class="subtitle"><a href="' + (edit ? '/equipos/' + esc(eq.id) : '/equipos') + '" data-link>← ' + (edit ? 'Volver al detalle' : 'Volver al listado') + '</a></p>' +
      '<h1>' + (edit ? 'Editar equipo' : 'Registrar equipo nuevo') + '</h1><p class="subtitle">Los campos marcados con <span style="color:var(--danger)">*</span> son obligatorios.</p></div></div>' +
      '<form id="form" class="card" novalidate><div id="form-error"></div>' +
      '<fieldset><legend>Identificación</legend><div class="form-grid">' +
      campo('numero_inventario', 'Número de inventario', { req: 1, max: 100, ph: 'INV-2024-001' }) +
      campo('numero_serie', 'Número de serie', { req: 1, max: 200, ph: 'SN-ABC123456' }) +
      campo('tipo_equipo', 'Tipo de equipo', { tipo: 'select', map: TIPOS }) +
      campo('marca', 'Marca', { req: 1, max: 100, ph: 'Dell' }) +
      campo('modelo', 'Modelo', { req: 1, max: 150, ph: 'OptiPlex 7090' }) +
      campo('estado', 'Estado', { tipo: 'select', map: ESTADOS }) + '</div></fieldset>' +
      '<fieldset><legend>Especificaciones</legend><div class="form-grid">' +
      campo('procesador', 'Procesador', { max: 200, ph: 'Intel Core i7-11700' }) +
      campo('ram_gb', 'Memoria RAM (GB)', { tipo: 'number', ph: '16' }) +
      campo('almacenamiento', 'Almacenamiento', { max: 200, ph: '512GB SSD' }) +
      campo('sistema_operativo', 'Sistema operativo', { max: 150, ph: 'Windows 11 Pro' }) + '</div></fieldset>' +
      '<fieldset><legend>Ubicación y control</legend><div class="form-grid">' +
      campo('laboratorio', 'Laboratorio', { req: 1, max: 150, ph: 'Laboratorio A' }) +
      campo('ubicacion', 'Ubicación', { max: 200, ph: 'Mesa 5, Fila 2' }) +
      campo('responsable', 'Responsable', { max: 200, ph: 'Ing. Juan Pérez' }) +
      campo('fecha_adquisicion', 'Fecha de adquisición', { tipo: 'date' }) +
      campo('fecha_ultima_revision', 'Fecha de última revisión', { tipo: 'date' }) +
      '<div></div>' + campo('observaciones', 'Observaciones', { tipo: 'textarea', cls: 'full' }) + '</div></fieldset>' +
      '<div class="form-actions"><a class="btn" href="' + (edit ? '/equipos/' + esc(eq.id) : '/equipos') + '" data-link>Cancelar</a>' +
      '<button type="submit" class="btn primary" id="guardar">' + (edit ? 'Guardar cambios' : 'Registrar equipo') + '</button></div></form>';

    var form = document.getElementById('form');
    var REQ = ['numero_inventario', 'numero_serie', 'marca', 'modelo', 'laboratorio'];

    function marcar(name, msg) {
      var el = document.getElementById('c-' + name), er = document.getElementById('e-' + name);
      if (!el || !er) return;
      er.textContent = msg || ''; el.classList.toggle('invalid', !!msg);
    }
    form.addEventListener('input', function (e) { if (e.target.name) marcar(e.target.name, ''); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      document.getElementById('form-error').innerHTML = '';
      var datos = {}, errores = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        marcar(el.name, '');
        var v = el.value.trim();
        if (el.name === 'ram_gb') {
          if (v === '') datos.ram_gb = null;
          else {
            var n = Number(v);
            if (!/^\d+$/.test(v) || n < 1 || n > 1024) errores.ram_gb = 'Ingrese un número entero entre 1 y 1024.';
            else datos.ram_gb = n;
          }
        } else if (el.name === 'fecha_adquisicion' || el.name === 'fecha_ultima_revision') {
          datos[el.name] = v || null;
        } else if (REQ.indexOf(el.name) >= 0) {
          datos[el.name] = v;
          if (!v) errores[el.name] = 'Este campo es obligatorio.';
          else if (v.length > el.maxLength && el.maxLength > 0) errores[el.name] = 'El texto es demasiado largo.';
        } else if (CAMPOS_TEXTO_OPC.indexOf(el.name) >= 0) {
          datos[el.name] = v || null;
        } else datos[el.name] = v;
      });

      var claves = Object.keys(errores);
      if (claves.length) {
        claves.forEach(function (k) { marcar(k, errores[k]); });
        document.getElementById(('c-' + claves[0])).focus();
        return;
      }

      var btn = document.getElementById('guardar'), txt = btn.textContent;
      btn.disabled = true; btn.textContent = 'Guardando...';
      var p = edit ? api('PUT', API + '/' + eq.id, datos) : api('POST', API, datos);
      p.then(function (r) {
        toast(edit ? 'Equipo actualizado correctamente.' : 'Equipo registrado correctamente.', 'ok');
        navegar('/equipos/' + r.id);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = txt;
        var primero = null;
        Object.keys(e.campos || {}).forEach(function (k) { marcar(k, e.campos[k]); if (!primero && document.getElementById('c-' + k)) primero = k; });
        document.getElementById('form-error').innerHTML = '<div class="alert">' + esc(e.mensaje) + '</div>';
        if (primero) document.getElementById('c-' + primero).focus(); else window.scrollTo(0, 0);
      });
    });
  }

  render();
})();
