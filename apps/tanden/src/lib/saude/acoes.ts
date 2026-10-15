/*
 * Botões dos avisos de água e pausa. Ficam aqui (sem dependências) porque o
 * registro de tipos de ação é um só para o app inteiro: os lembretes registram
 * os deles junto com estes.
 */
export const CARE_ACTION_AGUA = 'saude-agua';
export const CARE_ACTION_PAUSA = 'saude-pausa';

export const CARE_ACTION_TYPES = [
  { id: CARE_ACTION_AGUA, actions: [{ id: 'bebi', title: 'Bebi um copo' }, { id: 'adiar', title: 'Adiar 30 min' }] },
  { id: CARE_ACTION_PAUSA, actions: [{ id: 'levantei', title: 'Levantei' }, { id: 'adiar', title: 'Adiar 15 min' }] },
];
