/**
 * Parseo de la ficha imprimible del HIS de Hanga Roa (PURG0005 urgencia /
 * PAMB0005 ambulatorio) — el contenido clínico de una atención del RCE.
 *
 * `his-parse.js` lee la LISTA de atenciones (consficha000); este módulo lee el
 * CONTENIDO de una de ellas, para poder mostrarla en la app igual que una
 * atención de Eloisa en vez de mandar al médico a otra pestaña.
 *
 * Portado del proyecto RCE VISOR (his_reports/parsers/ficha), que ya tenía
 * resuelto y probado este formato. Como allá, en dos fases separadas:
 *
 *   1. `extraerPares`  — HTML → `{ ETIQUETA: valor }`. El HIS expone la ficha
 *      como pares `<b>ETIQUETA:</b>VALOR` dentro de divs.
 *   2. `parseFichaHis` — traduce esas etiquetas al objeto tipado que pinta la
 *      interfaz. Es una tabla de sinónimos (con y sin tilde, variantes entre
 *      PURG0005 y PAMB0005); se lee de arriba abajo.
 *
 * Con dos ayudantes, por las rarezas del HIS:
 *   · `extraerSignosVitales` — tabla de SV, sólo en urgencia.
 *   · `buscarMedico` — el médico aparece de siete formas distintas según la
 *     versión de la ficha; se prueban en orden de confianza.
 *
 * Regex y sin DOM, igual que el resto de los lectores (SysLab, consficha): así
 * se prueba en node contra el HTML real.
 */

const TAG = /<[^>]+>/g;
const BR = /<br\s*\/?>/gi;
const COMENTARIO = /<!--[\s\S]*?-->/g;
const ETIQUETA = /<b>([^<:]{2,80}):<\/b>/gi;
const ESPACIOS = /[ \t]+/g;

// El HIS es PHP: si en algún formulario pasa por `htmlentities()`, las tildes
// llegan como `&oacute;` y los símbolos clínicos como `&#176;` (grado) o
// `&#181;` (micro). Con un decodificador corto, una ETIQUETA con entidad
// («DIAGN&Oacute;STICO PRI») no coincide con ningún sinónimo y el campo entero
// desaparece del informe sin que nadie lo note. Por eso se decodifica el juego
// latino con nombre y todas las numéricas, como hace `html.unescape`.
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', uuml: 'ü', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', ccedil: 'ç', Ccedil: 'Ç',
  deg: '°', micro: 'µ', ordm: 'º', ordf: 'ª', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  middot: '·', bull: '•', plusmn: '±', times: '×', divide: '÷', frac12: '½', euro: '€',
};
const desentidad = s => String(s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,9});/g, (m, cuerpo) => {
  if (cuerpo[0] === '#') {
    const n = cuerpo[1] === 'x' || cuerpo[1] === 'X'
      ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  }
  return ENTIDADES[cuerpo] ?? m;
});

/** El HIS sirve UTF-8; los bytes mal formados no deben tumbar la lectura. */
const texto = html => (typeof html === 'string' ? html : new TextDecoder('utf-8').decode(html));

/**
 * Fase 1: `{ ETIQUETA: valor }` de un HTML con `<b>ETIQUETA:</b>VALOR`.
 *
 * El valor va desde `</b>` hasta lo que ocurra antes: la siguiente etiqueta o
 * el `</div>` que cierra su contenedor. Cortar en el `</div>` es lo que evita
 * pegar el campo siguiente al valor de éste. Los `<br>` internos pasan a saltos
 * de línea porque en INDICACIONES son las viñetas del plan de tratamiento.
 * Gana la primera aparición: las etiquetas repetidas no se pisan.
 *
 * @param {string} html  ya saneado de comentarios (lo hace `parseFichaHis`)
 * @returns {Record<string,string>}
 */
export function extraerPares(html) {
  const s = String(html ?? '');
  const marcas = [...s.matchAll(new RegExp(ETIQUETA.source, ETIQUETA.flags))];
  /** @type {Record<string,string>} */
  const pares = {};
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i];
    const etiqueta = desentidad(m[1]).replace(/\u00a0/g, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
    const desde = m.index + m[0].length;
    const siguienteB = i + 1 < marcas.length ? marcas[i + 1].index : s.length;
    const cierreDiv = s.indexOf('</div>', desde);
    const hasta = Math.min(siguienteB, cierreDiv === -1 ? siguienteB : cierreDiv);
    const crudo = s.slice(desde, hasta);
    const valor = desentidad(crudo.replace(BR, '\n').replace(TAG, ''))
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map(l => l.replace(ESPACIOS, ' ').trim())
      .filter(Boolean)
      .join('\n');
    if (!(etiqueta in pares)) pares[etiqueta] = valor;
  }
  return pares;
}

/**
 * ¿Este HTML es una ficha de verdad? Cuenta pares `<b>ETIQUETA:</b>`: una ficha
 * real trae decenas; una respuesta vacía (ficha ajena, sin permiso, sesión
 * caída) trae 0-2. Sirve para no gastar el parseo entero ni mostrar una tarjeta
 * en blanco cuando el HIS responde 200 con una página casi vacía.
 */
export function contarPares(html) {
  return (texto(html).match(/<b>[^<:]{2,80}:<\/b>/gi) ?? []).length;
}

const celdas = fila => [...fila.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
  .map(c => desentidad(c[1].replace(/<[^>]+>|&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim());

/**
 * Tabla de signos vitales, sólo presente en urgencia (PURG0005). Se reconoce
 * porque su encabezado trae SAT y O2 — así no se confunde con las tablas de
 * exámenes o de medicamentos que pueden estar en la misma ficha. En
 * ambulatorio devuelve `{}` y los campos quedan vacíos.
 * @returns {Record<string,string>} `{ ENCABEZADO: valor }`
 */
export function extraerSignosVitales(html) {
  const s = String(html ?? '');
  for (const t of s.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tabla = t[1];
    const may = tabla.toUpperCase();
    if (!may.includes('SAT') || !may.includes('O2')) continue;
    const filas = [...tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(f => f[1]);
    if (filas.length < 2) continue;
    const encabezados = celdas(filas[0]).map(h => h.toUpperCase());
    if (!encabezados.some(h => h.includes('SAT'))) continue;
    const datos = celdas(filas[1]);
    /** @type {Record<string,string>} */
    const sv = {};
    encabezados.forEach((h, i) => { if (i < datos.length) sv[h] = datos[i]; });
    return sv;
  }
  return {};
}

// ── El médico tratante ──────────────────────────────────────
// El HIS lo expone de siete formas según la versión de la ficha. Se prueban en
// orden de confianza; cada una está cubierta por un test con su fixture.

const ETIQUETAS_MEDICO = ['MÉDICO', 'MEDICO', 'MÉDICO ATIENDE', 'MEDICO ATIENDE',
  'MÉDICO TRATANTE', 'MEDICO TRATANTE', 'MÉDICO RESPONSABLE', 'MEDICO RESPONSABLE',
  'MÉDICO CITA', 'MEDICO CITA', 'MÉDICO ATENCIÓN', 'MEDICO ATENCION',
  'PROFESIONAL', 'FACULTATIVO', 'DOCTOR'];

// «\b» delante: MEDIC dentro de PARAMEDICO o RADIOMEDICO no es el rol tratante.
const ES_MEDICO = /(?:^|[^\p{L}])M[ÉE]DIC/iu;
// Etiquetas que contienen MEDIC y NO son el profesional: diagnósticos,
// indicaciones, y las administrativas del HIS («ALTA MÉDICA: SI», «ATENCIÓN
// MÉDICA: Consulta de morbilidad»), cuyo valor se pintaba como si fuera quien
// atendió al paciente.
const NO_ES_MEDICO = /DIAG|INDICAC|COMENT|ALTA|HORA|FECHA|ORDEN|ATENCI|LICENC|CERTIF|ANTECED|EGRES|INGRES/i;
// Y el valor tiene que poder ser un nombre: «SI», «NO», «1» o una fecha no lo son.
const VALOR_ES_NOMBRE = v => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(v) && !/^\d/.test(v.trim());

// Identificador del campo: prefijo HIS opcional (cbo, txt, nombre…), raíz
// «medic», sufijo opcional. El lookahead rechaza paramedico/radiomedico/
// premedico: comparten la raíz pero confundir al paramédico con el médico
// tratante cambiaría el autor de la atención.
const ID_MEDICO = '(?!(?:para|radio|pre)m)[a-z]{0,10}_?m[ée]dic[oa]?[_a-z]*';
const ATTR_MEDICO = `(?:name|id)\\s*=\\s*["']?${ID_MEDICO}`;
// Dos regex porque el orden de los atributos en HTML no está garantizado.
const INPUT_NOMBRE_VALOR = new RegExp(`<input[^>]*\\b${ATTR_MEDICO}[^"'>\\s]*["']?[^>]*\\bvalue\\s*=\\s*["']([^"']{3,200})["']`, 'i');
const INPUT_VALOR_NOMBRE = new RegExp(`<input[^>]*\\bvalue\\s*=\\s*["']([^"']{3,200})["'][^>]*\\b${ATTR_MEDICO}`, 'i');
const SELECT_MEDICO = new RegExp(`<select[^>]*\\b${ATTR_MEDICO}[^"'>\\s]*["']?[^>]*>([\\s\\S]*?)</select>`, 'i');
const OPCION_ELEGIDA = /<option[^>]*\bselected\b[^>]*>([^<]{3,200})<\/option>/i;

const TAG_INLINE = '(b|strong|th|td|label|span|p)';
const LABEL_MEDICO = new RegExp(`<${TAG_INLINE}[^>]*>\\s*[^<]*\\bm[ée]dic[^<:]*:\\s*</\\1>`, 'gi');
const SIGUIENTE_LABEL = new RegExp(`<${TAG_INLINE}[^>]*>\\s*[^<:]{2,80}:\\s*</\\1>`, 'i');
const PALABRA_MEDICO = /(?:^|[^\p{L}])m[ée]dic[oa](?![\p{L}])/giu;
const VALOR_CERCANO = /value\s*=\s*["']([^"']{3,200})["']/i;
// Mayúsculas a propósito (sin bandera «i»): DR./DRA. + nombre en mayúsculas.
const NOMBRE_DR = /\bDRA?\.?\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]*(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]*){1,4}/;
const PARECE_NOMBRE = /[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.\s]{2,}/;
const RELLENO = /^(seleccione|--|\.\.\.|sin m[eé]dico|n\/a)$|^(seleccione|--|\.\.\.|sin m[eé]dico|n\/a)\b/i;

/**
 * Estrategia 5: la etiqueta «MÉDICO:» y el valor en el elemento siguiente
 * (`<div><b>MÉDICO:</b></div><div>DR. X</div>` o una tabla plana). `extraerPares`
 * se pierde estos casos porque el `</div>` cierra antes del valor.
 */
function medicoEnHermano(s) {
  for (const m of s.matchAll(LABEL_MEDICO)) {
    if (NO_ES_MEDICO.test(m[0])) continue;
    let ventana = s.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const corte = SIGUIENTE_LABEL.exec(ventana);   // no invadir el campo siguiente
    if (corte) ventana = ventana.slice(0, corte.index);
    const plano = ventana.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const cand = PARECE_NOMBRE.exec(plano);
    if (!cand) continue;
    const nombre = cand[0].trim().replace(/\.+$/, '').trim();
    if (nombre.length >= 3 && !RELLENO.test(nombre)) return nombre;
  }
  return '';
}

/**
 * El médico tratante, probando en orden de confianza. Devuelve '' si ninguna
 * estrategia lo encuentra: la interfaz omite los campos vacíos.
 * @param {Record<string,string>} pares
 * @param {string} s  HTML ya saneado de comentarios
 */
export function buscarMedico(pares, s) {
  for (const e of ETIQUETAS_MEDICO) if (pares[e]) return pares[e];           // 1
  for (const [k, v] of Object.entries(pares)) {                              // 2
    if (v && ES_MEDICO.test(k) && !NO_ES_MEDICO.test(k) && VALOR_ES_NOMBRE(v)) return v;
  }
  for (const re of [INPUT_NOMBRE_VALOR, INPUT_VALOR_NOMBRE]) {               // 3
    const m = re.exec(s);
    if (m) return m[1].trim();
  }
  const sel = SELECT_MEDICO.exec(s);                                         // 4
  if (sel) {
    const opt = OPCION_ELEGIDA.exec(sel[1]);
    if (opt && opt[1].trim() && !RELLENO.test(opt[1].trim())) return opt[1].trim();
  }
  const hermano = medicoEnHermano(s);                                        // 5
  if (hermano) return hermano;
  for (const m of s.matchAll(PALABRA_MEDICO)) {                              // 6
    const v = VALOR_CERCANO.exec(s.slice(m.index + m[0].length, m.index + m[0].length + 500));
    if (v && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v[1])) return v[1].trim();
  }
  for (const m of s.matchAll(PALABRA_MEDICO)) {                              // 7
    // Ventana corta: el director del hospital firma el pie de TODAS las fichas.
    const dr = NOMBRE_DR.exec(s.slice(m.index + m[0].length, m.index + m[0].length + 400));
    if (dr) return dr[0].trim();
  }
  return '';
}

// ── Fase 2: etiquetas del HIS → estructura tipada ───────────

/**
 * @typedef {object} FichaHis
 * @property {{nombre:string,nombreSocial:string,rut:string,nacimiento:string,edad:string,sexo:string,genero:string,prevision:string,direccion:string,comuna:string,nacionalidad:string,telefono:string,pueblo:string}} paciente
 * @property {{tipoAtencion:string,clasificacion:string,admisor:string,fechaIngreso:string,horaIngreso:string,llegadaEn:string,atencionesAnteriores:string,ultimaAtencion:string,fechaSuceso:string,motivoConsulta:string,medico:string,fechaAtencion:string,horaAtencion:string,boxAtencion:string}} meta
 * @property {Record<string,string>} signosVitales
 * @property {{anamnesis:string,examenFisico:string,hipotesis:string,indicaciones:string,indicacionesAlta:string}} atencion
 * @property {{principal:string,secundario:string,complementario:string}} diagnosticos
 * @property {{condicion:string,pronostico:string,destino:string,fechaSalida:string,horaSalida:string}} cierre
 */

/**
 * Parsea PURG0005 (urgencia) o PAMB0005 (ambulatorio). El mismo parser sirve
 * para las dos: sólo urgencia trae signos vitales, y en ambulatorio esos campos
 * quedan vacíos (la interfaz no pinta lo vacío).
 *
 * @param {string|Uint8Array} html
 * @returns {FichaHis}
 */
export function parseFichaHis(html) {
  // Un solo saneo para todas las fases: dentro de un comentario HTML puede
  // haber literales `<b>ETIQUETA:</b>` o `<input name=…>` que darían un falso
  // positivo tanto en extraerPares como en buscarMedico.
  const s = texto(html).replace(COMENTARIO, '');
  const pares = extraerPares(s);
  const sv = extraerSignosVitales(s);

  /** Primera etiqueta presente de las dadas; '' si ninguna. */
  const P = (...etiquetas) => {
    for (const e of etiquetas) { const v = pares[e.toUpperCase()]; if (v) return v; }
    return '';
  };
  /** Signo vital cuyo encabezado contenga alguna de estas claves. */
  const SV = (...claves) => {
    for (const c of claves) {
      for (const [h, v] of Object.entries(sv)) if (h.includes(c.toUpperCase())) return v;
    }
    return '';
  };

  return {
    paciente: {
      nombre: P('NOMBRES'), nombreSocial: P('NOMBRE SOCIAL'), rut: P('RUT'),
      nacimiento: P('NACIMIENTO'), edad: P('EDAD'), sexo: P('SEXO'),
      genero: P('IDENTIDAD DE GÉNERO', 'IDENTIDAD DE GENERO'),
      prevision: P('PREVISIÓN', 'PREVISION'),
      direccion: P('DIRECCIÓN', 'DIRECCION'), comuna: P('COMUNA'),
      nacionalidad: P('NACIONALIDAD'), telefono: P('TELÉFONO', 'TELEFONO'),
      pueblo: P('PUEBLO ORIGINARIO'),
    },
    meta: {
      tipoAtencion: P('TIPO ATENCIÓN', 'TIPO ATENCION'),
      clasificacion: P('CLASIFICACIÓN ATENCIÓN', 'CLASIFICACION ATENCION'),
      admisor: P('ADMISOR'), fechaIngreso: P('FECHA INGRESO'),
      horaIngreso: P('HR INGRESO', 'HORA INGRESO'), llegadaEn: P('LLEGADA EN'),
      atencionesAnteriores: P('N° ATENCIONES ANT.'),
      ultimaAtencion: P('FECHA ÚLTIMA ATENCIÓN', 'FECHA ULTIMA ATENCION'),
      fechaSuceso: P('FECHA SUCESO'), motivoConsulta: P('MOTIVO CONSULTA'),
      medico: buscarMedico(pares, s),
      fechaAtencion: P('FECHA ATENCIÓN', 'FECHA ATENCION'),
      horaAtencion: P('HORA ATENCIÓN', 'HORA ATENCION'),
      boxAtencion: P('BOX ATENCIÓN', 'BOX ATENCION'),
    },
    signosVitales: {
      hora: SV('HORA'), FC: SV('F.C.'),
      PAS: SV('P. SISTÓLICA', 'P. SISTOLICA', 'SISTO'),
      PAD: SV('P. DIASTÓLICA', 'P. DIASTOLICA', 'DIASTO'),
      PAM: SV('PAM'), FR: SV('F.R.'), SatO2: SV('SAT. O2', 'SAT O2'),
      TempRectal: SV('T° RECTAL', 'TEMP RECTAL', 'RECTAL'),
      TempAxilar: SV('T° AXILAR', 'TEMP AXILAR', 'AXILAR'),
      dolor: SV('ESCALA DEL DOLOR'), glicemia: SV('HEMOGLUCOTEST'),
      glasgow: SV('ESCALA GLASGOW'),
      peso: P('PESO'), altura: P('ALTURA'), imc: P('IMC'),
    },
    atencion: {
      anamnesis: P('ANAMNESIS'),
      examenFisico: P('EXAMEN FÍSICO', 'EXAMEN FISICO'),
      hipotesis: P('HIPOTESIS DIAGNÓSTICA', 'HIPOTESIS DIAGNOSTICA', 'HIPOTESIS'),
      indicaciones: P('INDICACIONES MÉDICAS / PLAN DE TTO', 'INDICACIONES MEDICAS / PLAN DE TTO', 'INDICACIONES'),
      indicacionesAlta: P('INDICACIONES AL ALTA'),
    },
    diagnosticos: {
      principal: P('DIAGNÓSTICO PRI', 'DIAGNOSTICO PRI'),
      secundario: P('DIAGNÓSTICO SEC', 'DIAGNOSTICO SEC'),
      complementario: P('DIAG. COMPLEMENTARIO'),
    },
    cierre: {
      condicion: P('CONDICIÓN CIERRE ATENCIÓN', 'CONDICION CIERRE ATENCION'),
      pronostico: P('PRONÓSTICO MÉDICO LEGAL', 'PRONOSTICO MEDICO LEGAL'),
      destino: P('DESTINO'), fechaSalida: P('FECHA SALIDA'), horaSalida: P('HORA SALIDA'),
    },
  };
}

/**
 * Los signos vitales con valor, como pares [rótulo, valor], en orden clínico.
 * Lo comparten el panel y el informe imprimible A PROPÓSITO: cuando cada uno
 * armaba su lista, el papel perdía la PAM, el dolor y la talla, y fundía la
 * temperatura axilar con la rectal bajo un mismo «T°». Pantalla y papel tienen
 * que decir lo mismo del mismo paciente.
 * @param {Record<string,string>} sv
 * @returns {Array<[string,string]>}
 */
export function signosVitalesLista(sv) {
  const s = sv ?? {};
  return /** @type {Array<[string,string]>} */ ([
    ['FC', s.FC],
    ['PA', s.PAS && s.PAD ? `${s.PAS}/${s.PAD}` : (s.PAS || s.PAD || '')],
    ['PAM', s.PAM], ['FR', s.FR], ['Sat O₂', s.SatO2],
    ['T° axilar', s.TempAxilar], ['T° rectal', s.TempRectal],
    ['HGT', s.glicemia], ['Glasgow', s.glasgow], ['Dolor', s.dolor],
    ['Peso', s.peso], ['Talla', s.altura], ['IMC', s.imc],
  ].filter(([, v]) => v));
}

/** ¿La ficha trae algo clínico que valga la pena pintar? */
export function fichaTieneContenido(f) {
  if (!f) return false;
  const a = f.atencion ?? {};
  const d = f.diagnosticos ?? {};
  const c = f.cierre ?? {};
  // Los signos vitales y el cierre cuentan: una atención de urgencia puede no
  // traer texto y sí traer FC 132, PA 82/44 y «Grave · Hospitalización». Decir
  // «sin contenido clínico» sobre eso sería falso, y el informe imprimible sí
  // lo imprimía: pantalla y papel se contradecían sobre el mismo paciente.
  return Boolean(a.anamnesis || a.examenFisico || a.hipotesis || a.indicaciones ||
    a.indicacionesAlta || d.principal || d.secundario || d.complementario ||
    f.meta?.motivoConsulta || c.condicion || c.destino || c.pronostico ||
    signosVitalesLista(f.signosVitales).length);
}
