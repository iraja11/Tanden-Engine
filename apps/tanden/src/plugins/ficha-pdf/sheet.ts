import { el, elementBlock, flowCards, groupedBlock, type Block, type Card } from './layout';
import { esc, inline, mdBlocks, textBlock } from './md';
import type { Ficha } from './model';

/*
 * Monta as páginas A4 da ficha (794 × 1123 px, 96 dpi) dentro de `host`.
 * Página 1: cabeçalho, faixa de combate, atributos com perícias e treinos à
 * esquerda; à direita começa o fluxo de cartões, que segue nas páginas 2+.
 */

const nf = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Quadradinhos de uso: cheios = gastos. */
function pips(total: number, spent: number, cls = 'pip'): string {
  let s = '';
  for (let i = 0; i < total; i++) s += `<span class="${cls}${i < spent ? ' on' : ''}"></span>`;
  return s;
}

const profDot = (level: 0 | 1 | 2) => `<span class="dot l${level}"></span>`;

function page(host: HTMLElement, n: number): HTMLElement {
  const p = el('div', 'page');
  p.dataset['n'] = String(n);
  host.append(p);
  return p;
}

function header(f: Ficha, portrait: string | null): HTMLElement {
  const h = el('header', 'hero');
  const pic = el('div', `portrait${portrait ? '' : ' empty'}`);
  if (portrait) pic.style.backgroundImage = `url("${portrait}")`;
  else pic.textContent = f.name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  const id = el('div', 'ident');
  id.append(el('h1', 'name', esc(f.name)));
  if (f.lineage) id.append(el('div', 'lineage', esc(f.lineage)));
  const chips = el('div', 'chips');
  for (const c of f.chips) chips.append(el('span', 'chip', `<i>${esc(c.label)}</i> ${esc(c.value)}`));
  if (chips.childElementCount) id.append(chips);
  const lv = el('div', 'level');
  lv.append(el('div', 'level-badge', `<small>Nível</small><b>${f.level}</b>`));
  if (f.xp) {
    const { have, floor, next } = f.xp;
    const pct = next ? Math.max(0, Math.min(100, ((have - floor) / (next - floor)) * 100)) : 100;
    const xp = el('div', 'xp');
    xp.innerHTML = `<div class="xp-bar"><span style="width:${pct}%"></span></div><small>${have.toLocaleString('pt-BR')}${next ? ` / ${next.toLocaleString('pt-BR')}` : ''} XP${f.canLevelUp ? ' · subir de nível!' : ''}</small>`;
    lv.append(xp);
  }
  h.append(pic, id, lv);
  return h;
}

function statBox(label: string, value: string, cls = '', sub = ''): HTMLElement {
  const b = el('div', `stat ${cls}`);
  b.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}`;
  return b;
}

function combat(f: Ficha): HTMLElement {
  const row = el('div', 'combat');
  const ac = el('div', 'stat ac');
  ac.innerHTML = `<div class="shield"><div class="stat-label">CA</div><div class="stat-value">${esc(f.ac)}</div></div>${f.acNote ? `<div class="stat-sub">${esc(f.acNote)}</div>` : ''}`;
  row.append(ac);

  const hp = el('div', 'stat hp');
  hp.innerHTML = `<div class="stat-label">Pontos de vida</div>
    <div class="hp-grid">
      <div><div class="hp-num">${esc(f.hp.cur) || '&nbsp;'}</div><small>atuais</small></div>
      <div class="hp-sep">/</div>
      <div><div class="hp-num max">${esc(f.hp.max) || '&nbsp;'}</div><small>máximo</small></div>
      <div class="hp-temp"><div class="hp-num">${esc(f.hp.temp) || '&nbsp;'}</div><small>temporários</small></div>
    </div>`;
  row.append(hp);

  if (f.system === '5e') {
    const dice = f.hitDice.map((d) => `${d.total}d${d.die}`).join(' + ');
    const spent = f.hitDice.reduce((s, d) => s + d.spent, 0);
    const total = f.hitDice.reduce((s, d) => s + d.total, 0);
    row.append(statBox('Dados de vida', esc(dice || '—'), 'hd', `<span class="pips">${pips(Math.min(total, 20), spent)}</span>`));
  }
  row.append(statBox('Iniciativa', esc(f.init), 'small'));
  row.append(statBox('Deslocamento', esc(f.speed || '—'), 'small', f.size ? esc(f.size) : ''));
  const death = el('div', 'stat death');
  death.innerHTML = `<div class="stat-label">Testes contra a morte</div>
    <div class="death-row"><small>sucessos</small><span class="pips">${pips(3, f.death.success, 'pip round ok')}</span></div>
    <div class="death-row"><small>falhas</small><span class="pips">${pips(3, f.death.fail, 'pip round bad')}</span></div>`;
  row.append(death);
  return row;
}

function attrCard(a: Ficha['attrs'][number]): HTMLElement {
  const c = el('div', 'attr');
  c.innerHTML = `<div class="attr-name">${esc(a.label)}</div>
    <div class="attr-core">
      <div class="attr-mod">${esc(a.mod)}</div>
      <div class="attr-score"><small>valor</small>${a.score ?? '—'}</div>
    </div>
    <div class="attr-row save">${profDot(a.saveProf ? 1 : 0)}<span class="b">${esc(a.save)}</span><span>Salvaguarda</span></div>
    ${a.skills.map((s) => `<div class="attr-row">${profDot(s.level)}<span class="b">${esc(s.bonus)}</span><span>${esc(s.name)}</span></div>`).join('')}`;
  return c;
}

function trainingBox(f: Ficha): HTMLElement {
  const box = el('section', 'card training');
  box.append(el('h3', 'card-title', 'Treinos e proficiências'));
  const body = el('div', 'card-body');
  const opts = (all: string[], have: string[]) => all.map((x) => `<span class="opt${have.some((h) => h.toLowerCase().startsWith(x.slice(0, 4).toLowerCase())) ? ' on' : ''}"><span class="dia"></span>${x}</span>`).join('');
  const row = (label: string, html: string) => `<div class="tr-row"><div class="tr-label">${label}</div><div class="tr-val">${html}</div></div>`;
  let html = '';
  if (f.system === '5e') {
    html += row('Armaduras', opts(['Leve', 'Média', 'Pesada', 'Escudos'], f.training.armor));
    html += row('Armas', opts(['Simples', 'Marciais', 'De fogo'], f.training.weapons));
  }
  if (f.training.otherWeapons) html += row('Outras armas', esc(f.training.otherWeapons));
  if (f.training.tools) html += row('Ferramentas', esc(f.training.tools));
  if (f.training.languages.length) html += row('Idiomas', f.training.languages.map((l) => `<span class="tag-pill">${esc(l)}</span>`).join(''));
  if (f.feats.length) html += row('Talentos', f.feats.map((l) => `<span class="tag-pill">${esc(l)}</span>`).join(''));
  if (f.classOptions.length) html += row('Opções de classe', f.classOptions.map((l) => `<span class="tag-pill">${esc(l)}</span>`).join(''));
  if (f.attunement.length) html += row('Sintonizados', f.attunement.map((l) => `<span class="tag-pill">${esc(l)}</span>`).join(''));
  if (f.conditions.length || f.exhaustion) {
    html += row('Condições', [...f.conditions.map((x) => `<span class="tag-pill warn">${esc(x)}</span>`), f.exhaustion ? `<span class="tag-pill warn">Exaustão ${f.exhaustion}</span>` : ''].join(''));
  }
  body.innerHTML = `${html}<div class="grid-fill"></div>`;
  box.append(body);
  return box;
}

// ---------------------------------------------------------------- cartões do fluxo

function tableBlocks(cols: Array<{ label: string; cls?: string }>, rows: string[][], cls: string): Block[] {
  const id = `${cls}-${Math.random().toString(36).slice(2, 7)}`;
  const makeBox = () => {
    const table = el('table', `grid ${cls}`);
    const tr = el('tr');
    for (const c of cols) tr.append(el('th', c.cls ?? '', c.label));
    const thead = el('thead');
    thead.append(tr);
    const tbody = el('tbody');
    table.append(thead, tbody);
    return { box: table, slot: tbody };
  };
  return rows.map((r) => groupedBlock(id, makeBox, () => {
    const tr = el('tr');
    r.forEach((v, i) => tr.append(el('td', cols[i]?.cls ?? '', v)));
    return tr;
  }));
}

function cards(f: Ficha): Card[] {
  const out: Card[] = [];
  if (f.attacks.length) {
    out.push({
      title: 'Ataques e truques',
      cls: 'attacks',
      blocks: tableBlocks(
        [{ label: 'Ataque' }, { label: 'Acerto/CD', cls: 'c' }, { label: 'Dano e tipo' }],
        f.attacks.map((a) => [
          `<b>${esc(a.name)}</b>${a.notes ? `<div class="note">${inline(a.notes)}</div>` : ''}`,
          `<span class="big">${esc(a.hit) || '—'}</span>`,
          esc(a.damage),
        ]),
        'atk',
      ),
    });
  }
  if (f.abilities.length) {
    out.push({
      title: 'Habilidades',
      blocks: f.abilities.map((a) => elementBlock(() => {
        const d = el('div', 'ability');
        const uses = a.uses.max !== null && a.uses.max > 0 ? `<span class="pips">${pips(Math.min(a.uses.max, 12), a.uses.spent)}</span>` : '';
        const meta = [a.time, a.recharge && `recupera no descanso ${a.recharge}`].filter(Boolean).map((x) => esc(x)).join(' · ');
        d.innerHTML = `<div class="ab-head"><b>${esc(a.name)}</b>${uses}</div>${meta ? `<div class="meta">${meta}</div>` : ''}${a.notes ? `<div class="ab-text">${inline(a.notes)}</div>` : ''}`;
        return d;
      })),
    });
  }
  if (f.casting || f.slots.length || f.pact || f.spells.length) {
    const blocks: Block[] = [];
    if (f.casting) {
      const c = f.casting;
      blocks.push(elementBlock(() => el('div', 'cast-stats', `
        <div><small>Atributo</small><b>${esc(c.label)}</b></div>
        <div><small>CD</small><b>${c.dc}</b></div>
        <div><small>Ataque</small><b>${c.attack >= 0 ? '+' : '−'}${Math.abs(c.attack)}</b></div>`)));
    }
    const slots = [...f.slots.map((s) => ({ label: `${s.level}º`, total: s.total, spent: s.spent }))];
    if (f.pact) slots.push({ label: `Pacto ${f.pact.level}º`, total: f.pact.total, spent: f.pact.spent });
    if (slots.length) {
      blocks.push(elementBlock(() => el('div', 'slots', slots.map((s) => `<div class="slot"><small>${s.label}</small><span class="pips">${pips(s.total, s.spent)}</span></div>`).join(''))));
    }
    const byLevel = [...new Set(f.spells.map((s) => s.level))].sort((a, b) => a - b);
    for (const lv of byLevel) {
      blocks.push(elementBlock(() => el('h4', 'sub gap', lv === 0 ? 'Truques' : `${lv}º círculo`)));
      for (const s of f.spells.filter((x) => x.level === lv)) {
        blocks.push(elementBlock(() => {
          const marks = [s.concentration && 'C', s.ritual && 'R', s.material && 'M'].filter(Boolean).map((m) => `<span class="mk">${m}</span>`).join('');
          const meta = [s.time, s.range].filter(Boolean).map(esc).join(' · ');
          return el('div', `spell${s.prepared ? ' prep' : ''}`, `<div class="sp-head"><span class="dia${s.prepared ? ' on' : ''}"></span><b>${esc(s.name)}</b>${marks}</div>${meta || s.notes ? `<div class="meta">${meta}${meta && s.notes ? ' — ' : ''}${s.notes ? inline(s.notes) : ''}</div>` : ''}`);
        }));
      }
    }
    out.push({ title: 'Conjuração', blocks });
  }
  const text = (title: string, md: string, extra: Block[] = []) => {
    const blocks = [...extra, ...mdBlocks(md)];
    if (blocks.length) out.push({ title, blocks });
  };
  text('Características de classe', f.texts.features);
  text('Traços de espécie', f.texts.traits);
  text('Talentos', f.texts.feats);
  if (f.inventory.length || f.hasCoins) {
    const blocks: Block[] = tableBlocks(
      [{ label: '', cls: 'eq' }, { label: 'Item' }, { label: 'Qtd', cls: 'c' }, { label: 'Peso', cls: 'r' }],
      f.inventory.map((it) => [
        `<span class="dia${it.equipped ? ' on' : ''}"></span>`,
        `${esc(it.name)}${it.notes ? `<div class="note">${inline(it.notes)}</div>` : ''}`,
        String(it.qty),
        it.weight === null ? '' : `${nf(it.weight * it.qty)} kg`,
      ]),
      'inv',
    );
    if (f.inventory.length) {
      const load = f.load.max ? `${nf(f.load.weight)} de ${nf(f.load.max)} kg` : `${nf(f.load.weight)} kg`;
      blocks.push(elementBlock(() => el('div', 'load', `<span><span class="dia on"></span> equipado</span><span>Carga: <b>${load}</b></span>`)));
    }
    blocks.push(elementBlock(() => el('div', 'coins', f.coins.map((c) => `<div class="coin ${c.key}"><b>${c.value ? c.value.toLocaleString('pt-BR') : ''}</b><small>${c.label}</small></div>`).join(''))));
    out.push({ title: 'Equipamento', blocks });
  }
  text('Aparência', f.texts.appearance);
  text('História e personalidade', f.texts.story);
  for (const x of f.extras) text(x.title, x.body);
  out.push({ title: 'Anotações', blocks: [], fill: true });
  return out;
}

// ---------------------------------------------------------------- montagem

export interface RenderOptions {
  portrait: string | null;
  accent: string;
}

/** Monta as páginas. Precisa estar no documento (mede alturas). */
export function renderSheet(f: Ficha, host: HTMLElement, opts: RenderOptions): HTMLElement[] {
  host.replaceChildren();
  host.style.setProperty('--accent', opts.accent);
  const pages: HTMLElement[] = [];

  const p1 = page(host, 1);
  pages.push(p1);
  p1.append(header(f, opts.portrait), combat(f));
  const main = el('div', 'p1-main');
  const left = el('div', 'p1-left');
  const quick = el('div', 'quick');
  quick.append(
    statBox('Proficiência', esc(f.prof), 'mini'),
    statBox('Percepção passiva', String(f.passive.perception), 'mini'),
    statBox('Inspiração heroica', `<span class="dia big${f.inspiration ? ' on' : ''}"></span>`, 'mini'),
  );
  const attrs = el('div', 'attrs');
  const colA = el('div', 'attr-col');
  const colB = el('div', 'attr-col');
  f.attrs.forEach((a, i) => (i < 3 ? colA : colB).append(attrCard(a)));
  if (f.system === '5e') {
    colA.append(el('div', 'passives', `<div class="stat-label">Passivas</div>
      <div class="pass-row"><span>Intuição</span><b>${f.passive.insight}</b></div>
      <div class="pass-row"><span>Investigação</span><b>${f.passive.investigation}</b></div>`));
  }
  attrs.append(colA, colB);
  left.append(quick, attrs, trainingBox(f));
  const right = el('div', 'col p1-right');
  main.append(left, right);
  p1.append(main);

  const flow = {
    next(): HTMLElement {
      const p = page(host, pages.length + 1);
      pages.push(p);
      p.append(el('div', 'run-head', `<b>${esc(f.name)}</b><span>${esc(f.lineage)}</span>`));
      const cols = el('div', 'cols');
      const a = el('div', 'col');
      const b = el('div', 'col');
      cols.append(a, b);
      p.append(cols);
      // a segunda coluna da página vem antes de uma página nova
      queue.push(b);
      return a;
    },
  };
  const queue: HTMLElement[] = [];
  const columns = { next: () => queue.shift() ?? flow.next() };
  flowCards(cards(f), columns, right);

  const today = new Date().toLocaleDateString('pt-BR');
  pages.forEach((p, i) => p.append(el('footer', 'foot', `<span>${esc(f.name)} · ficha de personagem</span><span>${today} · ${i + 1}/${pages.length}</span>`)));
  return pages;
}
