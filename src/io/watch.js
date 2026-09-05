import { CONFIG } from '../core/config.js';
import { storageGet, storageSet } from './cache.js';

/**
 * Change memory for the interconsulta streams the doctor actually runs.
 *
 * Every load used to overwrite the previous one, so the extension could only
 * ever show a snapshot. This keeps the previous state of the watched SICs and
 * reports what moved since the last look: a state change or a cita that got
 * confirmed.
 *
 * Scoped on purpose. Watching all 847 SIC would produce noise; watching the
 * telemedicine specialties he resolves himself produces a morning briefing.
 */

const KEY = CONFIG.watchKey;

/** @returns {Promise<{snapshot: object, savedAt: number, seenAt: number}>} */
async function load() {
  const raw = (await storageGet(KEY)) ?? {};
  return { snapshot: raw.snapshot ?? {}, savedAt: raw.savedAt ?? 0, seenAt: raw.seenAt ?? 0 };
}

/** The fields whose change is worth reporting. */
function fingerprint(s) {
  return {
    estadoId: s.estadoId,
    estado:   s.estado,
    grupo:    s.grupo,
    cita:     s.fechaCita || '',
  };
}

function isWatched(s, especialidades) {
  return especialidades.includes(s.especialidad);
}

const LABEL = {
  estado: 'Cambió de estado',
  cita:   'Cambió la cita',
  nueva:  'Interconsulta nueva',
};

/**
 * Pure diff against a snapshot — no storage, so it can be tested directly.
 *
 * @param {object[]} sics            every SIC loaded
 * @param {string[]} especialidades  which streams to watch
 * @param {object}   snapshot        previous fingerprints, keyed by SIC id
 * @returns {{cambios: object[], firstRun: boolean, next: object, vigiladas: number}}
 */
export function computeCambios(sics, especialidades, snapshot = {}) {
  const firstRun = Object.keys(snapshot).length === 0;
  const watched = sics.filter(s => isWatched(s, especialidades));
  const next = {};
  const cambios = [];

  for (const s of watched) {
    const fp = fingerprint(s);
    next[s.id] = fp;
    const prev = snapshot[s.id];

    // A first run has nothing to compare against: record, do not cry wolf.
    if (firstRun) continue;

    const base = {
      id: s.id, paciente: s.paciente.nombre, run: s.paciente.run,
      especialidad: s.especialidad, fecha: s.fecha, dias: s.antiguedadDias,
    };

    if (!prev) {
      cambios.push({ ...base, tipo: 'nueva', label: LABEL.nueva, antes: '', ahora: s.estado });
      continue;
    }
    if (fp.estadoId !== prev.estadoId) {
      cambios.push({ ...base, tipo: 'estado', label: LABEL.estado, antes: prev.estado, ahora: s.estado });
    }
    if (fp.cita !== prev.cita && fp.cita) {
      cambios.push({ ...base, tipo: 'cita', label: LABEL.cita, antes: prev.cita || 'sin cita', ahora: fp.cita });
    }
  }

  const orden = { nueva: 0, estado: 1, cita: 2 };
  cambios.sort((a, b) => (orden[a.tipo] - orden[b.tipo]) || b.dias - a.dias);

  return { cambios, firstRun, next, vigiladas: watched.length };
}

/**
 * Compares the watched SICs against the stored snapshot and advances it.
 * @param {object} [opts]
 * @param {boolean} [opts.commit]  commit:false previews without advancing
 * @returns {Promise<{cambios: object[], firstRun: boolean, desde: number, vigiladas: number}>}
 */
export async function diffWatched(sics, especialidades, { commit = true } = {}) {
  const { snapshot, savedAt } = await load();
  const { cambios, firstRun, next, vigiladas } = computeCambios(sics, especialidades, snapshot);
  if (commit) await storageSet(KEY, { snapshot: next, savedAt: Date.now(), seenAt: savedAt });
  return { cambios, firstRun, desde: savedAt, vigiladas };
}
