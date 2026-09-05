/** Diario de notas del paciente: la más nueva primero, cada una editable en su sitio. */
import { esc, $, closestOf } from '../dom.js';

const fechaNota = at => {
  if (!at) return 'Sin fecha';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** El diario del paciente: la más nueva primero, cada una editable en su sitio. */
export function renderNotes(cur) {
  const rec = cur?.record;
  const notas = rec?.notas ?? (rec?.note ? [{ at: null, text: rec.note }] : []);
  $('ppNotes').innerHTML = notas.map(n => `
    <div class="pp-nota" data-at="${esc(String(n.at ?? 'null'))}">
      <div class="pp-nota-h"><span>${esc(fechaNota(n.at))}</span><button type="button" class="btn-mini ghost" data-note-act="edit">Editar</button></div>
      <p class="pp-nota-t">${esc(n.text)}</p>
      <div class="pp-nota-e"><textarea>${esc(n.text)}</textarea><div><button type="button" class="btn-mini" data-note-act="save">Guardar</button><button type="button" class="btn-mini ghost" data-note-act="cancel">Cancelar</button></div></div>
    </div>`).join('');
}

/**
 * Cablea «Añadir nota» y los botones de cada entrada. `getCur` devuelve el
 * paciente abierto; los ganchos escriben (la interfaz nunca guarda por su cuenta).
 */
export function initNotas({ getCur, saveNote, addNote, editNote }) {
  $('ppSaveNote').addEventListener('click', async () => {
    const cur = getCur();
    if (!cur) return;
    const text = $('ppNoteText').value;
    if (!text.trim()) return;
    const ok = addNote ? await addNote(cur.record, text) : await saveNote(cur.record, text);
    if (ok) { $('ppNoteText').value = ''; renderNotes(cur); }
  });
  $('ppNotes').addEventListener('click', async e => {
    const cur = getCur();
    const btn = closestOf(e, 'button[data-note-act]');
    if (!btn || !cur) return;
    const item = /** @type {HTMLElement} */ (btn.closest('.pp-nota'));
    const at = item.dataset.at || null;
    if (btn.dataset.noteAct === 'edit') {
      item.classList.add('editing');
      item.querySelector('textarea').focus();
    } else if (btn.dataset.noteAct === 'cancel') {
      renderNotes(cur);
    } else if (btn.dataset.noteAct === 'save') {
      const text = item.querySelector('textarea').value;
      if (editNote) await editNote(cur.record, at === 'null' ? null : at, text);
      renderNotes(cur);
    }
  });
}
