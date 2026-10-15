/*
 * Modelos de página e de banco de dados.
 *
 * Modelos de página são notas comuns na pasta "Modelos/" (a mesma do plugin
 * Templates do Obsidian), com as variáveis {{title}}, {{date}}, {{time}} e
 * {{date:DD/MM/YYYY}}. Um modelo com "modelo-para: [[Banco]]" no topo vira
 * opção do botão "Novo" daquele banco.
 *
 * Modelos de banco criam a nota do banco (com o bloco base) e já trazem
 * propriedades, opções, views e alguns modelos de linha.
 */
import { setProp, parseProps, splitFrontmatter } from '../caderno/frontmatter';
import { formatDate, isoDate } from './expr';
import { serializeBase, type BaseDef, type PropConfig, type ViewDef } from './model';

export const TEMPLATES_DIR = 'Modelos';
/** chave que liga um modelo a um banco; sai da nota criada */
export const TEMPLATE_FOR = 'modelo-para';

/** Aplica as variáveis do modelo. */
export function fillTemplate(text: string, vars: { title: string; now?: Date }): string {
  const now = vars.now ?? new Date();
  return text.replace(/\{\{\s*(title|titulo|título|date|data|time|hora|now|agora)(?::([^}]*))?\s*\}\}/gi, (_, k: string, fmt?: string) => {
    switch (k.toLowerCase()) {
      case 'title': case 'titulo': case 'título': return vars.title;
      case 'date': case 'data': return fmt ? formatDate(now, fmt.trim()) : isoDate(now, false);
      case 'time': case 'hora': return formatDate(now, fmt?.trim() || 'HH:mm');
      default: return fmt ? formatDate(now, fmt.trim()) : isoDate(now, true);
    }
  });
}

/** Texto da nota nova a partir de um modelo: tira a ligação com o banco e aplica as variáveis. */
export function instantiate(template: string, title: string, now?: Date): string {
  let t = setProp(template, TEMPLATE_FOR, null);
  t = fillTemplate(t, { title, now });
  return t;
}

/** Nota em branco de uma linha, com valores iniciais no topo. */
export function blankRow(_title: string, props: Record<string, string | string[]>): string {
  // o nome do arquivo já é o título (como no Notion e no título embutido do Obsidian)
  let t = '\n';
  for (const [k, v] of Object.entries(props)) t = setProp(t, k, v);
  return t;
}

/** Junta valores iniciais (da coluna do quadro, do filtro) ao topo do modelo. */
export function withDefaults(text: string, props: Record<string, string | string[]>): string {
  let t = text;
  const cur = parseProps(text);
  for (const [k, v] of Object.entries(props)) if (cur[k] === undefined || cur[k] === '') t = setProp(t, k, v);
  return t;
}

/** O banco ao qual um modelo pertence ("[[Projetos]]" → "Projetos"), ou null. */
export function templateTarget(text: string): string | null {
  const v = parseProps(text)[TEMPLATE_FOR];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  return s.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim() || null;
}

// ------------------------------------------------------------------ modelos de banco

export interface DbTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  properties: Record<string, PropConfig>;
  formulas?: Record<string, string>;
  views: ViewDef[];
  /** linhas de exemplo: nome → propriedades */
  samples?: Array<{ name: string; props: Record<string, string | string[]>; body?: string }>;
  /** modelos de linha: nome → texto */
  rowTemplates?: Array<{ name: string; text: string }>;
}

const status = (todo = 'A fazer', doing = 'Em andamento', done = 'Feito'): PropConfig => ({
  displayName: 'Status',
  type: 'status',
  options: [
    { value: todo, color: 'gray', group: 'todo' },
    { value: doing, color: 'blue', group: 'doing' },
    { value: done, color: 'green', group: 'done' },
  ],
});

export const DB_TEMPLATES: DbTemplate[] = [
  {
    id: 'vazio', name: 'Banco vazio', icon: '▤', description: 'Só uma tabela com nome e tags. Você monta o resto.',
    properties: { tags: { displayName: 'Tags', type: 'multiselect' } },
    views: [{ type: 'table', name: 'Tabela', order: ['file.name', 'note.tags'] }],
  },
  {
    id: 'tarefas', name: 'Tarefas', icon: '☑', description: 'Quadro por status, prazos, prioridade e uma visão de calendário.',
    properties: {
      status: status(),
      prioridade: { displayName: 'Prioridade', type: 'select', options: [{ value: 'Alta', color: 'red' }, { value: 'Média', color: 'yellow' }, { value: 'Baixa', color: 'gray' }] },
      prazo: { displayName: 'Prazo', type: 'date' },
      projeto: { displayName: 'Projeto', type: 'relation', target: 'Projetos' },
      'formula.situação': { displayName: 'Situação' },
    },
    formulas: { situação: 'if(status == "Feito", "✓ feito", if(prazo.isEmpty(), "", if(prazo < today(), "⚠ atrasada", prazo.relative())))' },
    views: [
      { type: 'board', name: 'Quadro', groupBy: { property: 'note.status', direction: 'ASC' }, order: ['file.name', 'note.prioridade', 'note.prazo'] },
      { type: 'table', name: 'Todas', order: ['file.name', 'note.status', 'note.prioridade', 'note.prazo', 'formula.situação', 'note.projeto'], sort: [{ property: 'note.prazo', direction: 'ASC' }] },
      { type: 'calendar', name: 'Calendário', date: 'note.prazo' },
      { type: 'list', name: 'Hoje', filters: { and: ['prazo <= today()', 'status != "Feito"'] }, order: ['file.name', 'note.prioridade'] },
    ],
    samples: [
      { name: 'Planejar a semana', props: { status: 'A fazer', prioridade: 'Alta', prazo: '@hoje+1' } },
      { name: 'Revisar anotações', props: { status: 'Em andamento', prioridade: 'Média', prazo: '@hoje+3' } },
      { name: 'Organizar o cofre', props: { status: 'Feito', prioridade: 'Baixa', prazo: '@hoje-2' } },
    ],
  },
  {
    id: 'projetos', name: 'Projetos', icon: '◆', description: 'Projetos com progresso, datas de início e fim e linha do tempo.',
    properties: {
      status: status('Ideia', 'Ativo', 'Concluído'),
      início: { displayName: 'Início', type: 'date' },
      fim: { displayName: 'Fim', type: 'date' },
      área: { displayName: 'Área', type: 'select', options: [{ value: 'Trabalho', color: 'blue' }, { value: 'Estudo', color: 'purple' }, { value: 'Pessoal', color: 'green' }] },
      progresso: { displayName: 'Progresso manual', type: 'number', format: 'percent' },
      'formula.andamento': { displayName: 'Progresso', format: 'percent' },
    },
    // com tarefas (- [ ]) na página, o progresso sai delas; sem tarefas, vale o número digitado
    formulas: { andamento: 'if(file.tasks > 0, file.tasksDone / file.tasks, progresso)' },
    views: [
      { type: 'table', name: 'Projetos', order: ['file.name', 'note.status', 'note.área', 'formula.andamento', 'note.início', 'note.fim'], groupBy: { property: 'note.área', direction: 'ASC' } },
      { type: 'timeline', name: 'Linha do tempo', date: 'note.início', endDate: 'note.fim' },
      { type: 'board', name: 'Por status', groupBy: { property: 'note.status', direction: 'ASC' } },
    ],
    samples: [
      { name: 'Tanden Engine', props: { status: 'Ativo', área: 'Pessoal', progresso: '0.4', início: '@hoje-10', fim: '@hoje+30' } },
      { name: 'Curso de inglês', props: { status: 'Ideia', área: 'Estudo', progresso: '0', início: '@hoje+7', fim: '@hoje+60' } },
    ],
    rowTemplates: [{ name: 'Projeto', text: '---\nstatus: Ideia\n---\n# {{title}}\n\n## Objetivo\n\n## Próximos passos\n- [ ] \n\n## Notas\n' }],
  },
  {
    id: 'leituras', name: 'Leituras', icon: '❦', description: 'Livros e artigos em galeria, com nota de 1 a 5 e status de leitura.',
    properties: {
      autor: { displayName: 'Autor', type: 'text' },
      status: { displayName: 'Status', type: 'select', options: [{ value: 'Quero ler', color: 'gray' }, { value: 'Lendo', color: 'blue' }, { value: 'Lido', color: 'green' }, { value: 'Abandonado', color: 'red' }] },
      nota: { displayName: 'Nota', type: 'number' },
      gênero: { displayName: 'Gênero', type: 'multiselect' },
      capa: { displayName: 'Capa', type: 'files' },
      terminado: { displayName: 'Terminado em', type: 'date' },
      'formula.estrelas': { displayName: 'Estrelas' },
    },
    formulas: { estrelas: 'if(nota.isEmpty(), "", "★".repeat(nota) + "☆".repeat(5 - nota))' },
    views: [
      { type: 'gallery', name: 'Estante', image: 'note.capa', order: ['file.name', 'note.autor', 'formula.estrelas'] },
      { type: 'board', name: 'Por status', groupBy: { property: 'note.status', direction: 'ASC' }, order: ['file.name', 'note.autor'] },
      { type: 'table', name: 'Tabela', order: ['file.name', 'note.autor', 'note.status', 'note.nota', 'note.gênero', 'note.terminado'], summaries: { 'note.nota': 'Average' } },
    ],
    samples: [
      { name: 'Duna', props: { autor: 'Frank Herbert', status: 'Lendo', gênero: ['Ficção científica'], nota: '5' } },
      { name: 'Hábitos Atômicos', props: { autor: 'James Clear', status: 'Lido', gênero: ['Produtividade'], nota: '4', terminado: '@hoje-20' } },
      { name: 'O Hobbit', props: { autor: 'J. R. R. Tolkien', status: 'Quero ler', gênero: ['Fantasia'] } },
    ],
    rowTemplates: [{ name: 'Livro', text: '---\nstatus: Quero ler\n---\n# {{title}}\n\n## Resumo\n\n## Citações\n> \n\n## O que eu levo\n' }],
  },
  {
    id: 'habitos', name: 'Hábitos', icon: '◎', description: 'Um registro por dia com caixas de seleção e porcentagem cumprida.',
    properties: {
      data: { displayName: 'Data', type: 'date' },
      exercício: { displayName: 'Exercício', type: 'checkbox' },
      leitura: { displayName: 'Leitura', type: 'checkbox' },
      água: { displayName: 'Água', type: 'checkbox' },
      estudo: { displayName: 'Estudo', type: 'checkbox' },
      'formula.feito': { displayName: 'Cumprido', format: 'percent' },
    },
    formulas: { feito: 'progress([exercício, leitura, água, estudo])' },
    views: [
      { type: 'table', name: 'Registro', order: ['file.name', 'note.data', 'note.exercício', 'note.leitura', 'note.água', 'note.estudo', 'formula.feito'], sort: [{ property: 'note.data', direction: 'DESC' }], summaries: { 'note.exercício': 'PercentChecked', 'note.leitura': 'PercentChecked', 'note.água': 'PercentChecked', 'note.estudo': 'PercentChecked' } },
      { type: 'calendar', name: 'Mês', date: 'note.data' },
    ],
    rowTemplates: [{ name: 'Dia', text: '---\ndata: {{date}}\nexercício: false\nleitura: false\nágua: false\nestudo: false\n---\n# {{title}}\n' }],
  },
  {
    id: 'reunioes', name: 'Reuniões', icon: '◷', description: 'Atas com data, participantes e pauta pronta em cada reunião nova.',
    properties: {
      data: { displayName: 'Data', type: 'datetime' },
      tipo: { displayName: 'Tipo', type: 'select', options: [{ value: '1:1', color: 'purple' }, { value: 'Equipe', color: 'blue' }, { value: 'Cliente', color: 'orange' }] },
      participantes: { displayName: 'Participantes', type: 'person' },
    },
    views: [
      { type: 'table', name: 'Todas', order: ['file.name', 'note.data', 'note.tipo', 'note.participantes'], sort: [{ property: 'note.data', direction: 'DESC' }] },
      { type: 'calendar', name: 'Agenda', date: 'note.data' },
    ],
    rowTemplates: [{ name: 'Reunião', text: '---\ndata: {{date:YYYY-MM-DD}}T{{time}}\n---\n# {{title}}\n\n## Pauta\n- \n\n## Decisões\n- \n\n## Ações\n- [ ] \n' }],
  },
  {
    id: 'contatos', name: 'Contatos (CRM)', icon: '☺', description: 'Pessoas e empresas, com e-mail, telefone, etapa e último contato.',
    properties: {
      empresa: { displayName: 'Empresa', type: 'text' },
      email: { displayName: 'E-mail', type: 'email' },
      telefone: { displayName: 'Telefone', type: 'phone' },
      site: { displayName: 'Site', type: 'url' },
      etapa: { displayName: 'Etapa', type: 'status', options: [{ value: 'Lead', color: 'gray', group: 'todo' }, { value: 'Conversa', color: 'yellow', group: 'doing' }, { value: 'Proposta', color: 'orange', group: 'doing' }, { value: 'Fechado', color: 'green', group: 'done' }] },
      'último contato': { displayName: 'Último contato', type: 'date' },
      'formula.dias': { displayName: 'Dias sem contato' },
    },
    formulas: { dias: 'if(note["último contato"].isEmpty(), "", days(note["último contato"]))' },
    views: [
      { type: 'table', name: 'Contatos', order: ['file.name', 'note.empresa', 'note.email', 'note.telefone', 'note.etapa', 'note.último contato', 'formula.dias'] },
      { type: 'board', name: 'Funil', groupBy: { property: 'note.etapa', direction: 'ASC' }, order: ['file.name', 'note.empresa'] },
    ],
  },
  {
    id: 'financas', name: 'Gastos', icon: '$', description: 'Entradas e saídas com categoria, totais no rodapé e agrupamento por mês.',
    properties: {
      valor: { displayName: 'Valor', type: 'number', format: 'real:2' },
      tipo: { displayName: 'Tipo', type: 'select', options: [{ value: 'Saída', color: 'red' }, { value: 'Entrada', color: 'green' }] },
      categoria: { displayName: 'Categoria', type: 'select', options: [{ value: 'Mercado', color: 'orange' }, { value: 'Casa', color: 'brown' }, { value: 'Transporte', color: 'blue' }, { value: 'Lazer', color: 'pink' }, { value: 'Salário', color: 'green' }] },
      data: { displayName: 'Data', type: 'date' },
      'formula.mês': { displayName: 'Mês' },
      'formula.saldo': { displayName: 'Saldo', format: 'real:2' },
    },
    formulas: { mês: 'if(data.isEmpty(), "", data.format("YYYY-MM"))', saldo: 'if(tipo == "Entrada", valor, -valor)' },
    samples: [
      { name: 'Salário', props: { valor: '4500', tipo: 'Entrada', categoria: 'Salário', data: '@hoje-10' } },
      { name: 'Mercado do mês', props: { valor: '620.4', tipo: 'Saída', categoria: 'Mercado', data: '@hoje-8' } },
      { name: 'Cinema', props: { valor: '48', tipo: 'Saída', categoria: 'Lazer', data: '@hoje-2' } },
    ],
    views: [
      { type: 'table', name: 'Por mês', order: ['file.name', 'note.data', 'note.tipo', 'note.categoria', 'note.valor', 'formula.saldo'], groupBy: { property: 'formula.mês', direction: 'DESC' }, sort: [{ property: 'note.data', direction: 'DESC' }], summaries: { 'formula.saldo': 'Sum', 'note.valor': 'Sum' } },
      { type: 'board', name: 'Categorias', groupBy: { property: 'note.categoria', direction: 'ASC' }, order: ['file.name', 'note.valor'] },
    ],
  },
  {
    id: 'diario', name: 'Diário', icon: '✎', description: 'Uma página por dia com humor e calendário do mês.',
    properties: {
      data: { displayName: 'Data', type: 'date' },
      humor: { displayName: 'Humor', type: 'select', options: [{ value: 'Ótimo', color: 'green' }, { value: 'Bem', color: 'blue' }, { value: 'Normal', color: 'gray' }, { value: 'Cansada', color: 'yellow' }, { value: 'Mal', color: 'red' }] },
    },
    views: [
      { type: 'calendar', name: 'Calendário', date: 'note.data' },
      { type: 'list', name: 'Entradas', order: ['file.name', 'note.humor'], sort: [{ property: 'note.data', direction: 'DESC' }] },
    ],
    rowTemplates: [{ name: 'Dia', text: '---\ndata: {{date}}\n---\n# {{date:dddd, D [de] MMMM}}\n\n## Como foi o dia\n\n## Gratidão\n- \n' }],
  },
];

/** Monta o texto da nota de um banco novo e as notas que vêm com ele. */
export function createDatabase(name: string, folder: string, tpl: DbTemplate, now = new Date()): { note: string; files: Array<{ path: string; text: string }> } {
  const rows = folder ? `${folder}/${name}` : name;
  const def: BaseDef = {
    filters: { and: [`file.inFolder(${JSON.stringify(rows)})`, '!arquivado'] },
    ...(tpl.formulas ? { formulas: { ...tpl.formulas } } : {}),
    properties: structuredClone(tpl.properties),
    views: structuredClone(tpl.views),
  };
  if (tpl.rowTemplates?.length) def.template = `[[${TEMPLATES_DIR}/${name}/${tpl.rowTemplates[0]!.name}]]`;
  const note = `# ${name}\n\n\`\`\`base\n${serializeBase(def)}\`\`\`\n`;
  const files: Array<{ path: string; text: string }> = [];
  // "@hoje+3" nos exemplos vira uma data perto de hoje
  const rel = (v: string) => {
    const m = /^@hoje([+-]\d+)?$/.exec(v);
    if (!m) return v;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(m[1] ?? 0));
    return isoDate(d, false);
  };
  for (const s of tpl.samples ?? []) {
    const props = Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, Array.isArray(v) ? v : rel(v)]));
    let t = blankRow(s.name, props);
    if (s.body) t += s.body;
    if (!('criado' in s.props)) t = setProp(t, 'criado', isoDate(now, true));
    files.push({ path: `${rows}/${s.name}.md`, text: t });
  }
  for (const r of tpl.rowTemplates ?? []) {
    files.push({ path: `${TEMPLATES_DIR}/${name}/${r.name}.md`, text: setProp(r.text, TEMPLATE_FOR, `[[${name}]]`) });
  }
  return { note, files };
}

/** Modelos de página prontos, criados em Modelos/ na primeira vez. */
export const PAGE_TEMPLATES: Array<{ name: string; text: string }> = [
  { name: 'Reunião', text: '---\ndata: {{date}}\ntags: [reunião]\n---\n# {{title}}\n\n**Participantes:** \n\n## Pauta\n- \n\n## Decisões\n- \n\n## Próximas ações\n- [ ] \n' },
  { name: 'Nota diária', text: '---\ndata: {{date}}\n---\n# {{date:dddd, D [de] MMMM [de] YYYY}}\n\n## Foco do dia\n- [ ] \n\n## Anotações\n\n## Gratidão\n- \n' },
  { name: 'Projeto', text: '---\nstatus: Ideia\ninício: {{date}}\n---\n# {{title}}\n\n## Por quê\n\n## Objetivo\n\n## Etapas\n- [ ] \n\n## Recursos\n' },
  { name: 'Estudo', text: '---\nmatéria: \nfonte: \ntags: [estudo]\n---\n# {{title}}\n\n## Ideias principais\n\n## Dúvidas\n- \n\n## Resumo em 3 linhas\n' },
  { name: 'Documento', text: '# {{title}}\n\n> Resumo em uma frase.\n\n## Contexto\n\n## Proposta\n\n## Próximos passos\n' },
];

/** Corpo do modelo sem o topo (para mostrar uma prévia). */
export const templatePreview = (text: string): string => splitFrontmatter(text).body.trim().split('\n').slice(0, 6).join('\n');
