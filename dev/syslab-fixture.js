/**
 * Órdenes sintéticas de SysLab (HHR) con la forma que devuelve `stepReadResults`.
 * El paciente es el mismo RUT sintético que usa el recorrido del Salvador, para
 * que una sola búsqueda traiga los dos hospitales y se pueda comprobar que
 * «marcar todas» alcanza a ambos.
 */
export const EXAMENES = [
  {
    id: '43095679', link: 'http://10.4.69.90/syslab/detalleexamenes.php?id=43095679',
    date: '22/07/2026', time: '08:18:37', rutBody: '11111111',
    patientName: 'PACIENTE EJEMPLO SINTÉTICO', origin: 'Policlinico',
    exams: ['Perfil Hepatico', 'Uricemia', 'Crea + VFG'],
  },
  {
    id: '43088164', link: 'http://10.4.69.90/syslab/detalleexamenes.php?id=43088164',
    date: '26/01/2026', time: '09:31:46', rutBody: '11111111',
    patientName: 'PACIENTE EJEMPLO SINTÉTICO', origin: 'Policlinico',
    exams: ['Perfil Hepatico', 'Hemograma'],
  },
  {
    id: '43081057', link: 'http://10.4.69.90/syslab/detalleexamenes.php?id=43081057',
    date: '09/07/2025', time: '14:26:11', rutBody: '11111111',
    patientName: 'PACIENTE EJEMPLO SINTÉTICO', origin: 'Urgencia',
    exams: ['Proteina C Reactiva', 'Hemograma'],
  },
];
