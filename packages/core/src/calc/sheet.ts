import type { MathNode } from 'mathjs';
import { formatValue, nodeTex, nodeText, valueTex } from './format';
import { localize, preprocess, splitLabel, stripComment } from './lang';
import { math } from './math';
import { expandSymbolic, freeSymbols, withCtx, type Ctx, type Def } from './symbolic';

/*
 * Folha de cálculo: avalia linha a linha, de cima para baixo, guardando
 * variáveis e funções. Cada linha vira um CalcResult que o editor mostra ao lado.
 */

export type CalcKind = 'empty' | 'text' | 'value' | 'assign' | 'function' | 'symbolic' | 'solutions' | 'error';

export interface CalcResult {
  kind: CalcKind;
  label?: string | null;
  /** resultado pronto para mostrar ("12 m²", "2·x") */
  text?: string;
  /** versão em TeX quando ajuda (matrizes, expressões) */
  tex?: string | null;
  /** nome atribuído (x = ..., f(x) = ...) */
  name?: string;
  /** a atribuição era só um número digitado: o editor pode esconder o resultado */
  trivial?: boolean;
  error?: string;
  value?: unknown;
}

const ERRORS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/Undefined symbol (\S+)/, (m) => `${m[1]} não está definido`],
  [/Undefined function (\S+)/, (m) => `A função ${m[1]} não existe`],
  [/Unexpected end of expression/, () => 'Expressão incompleta'],
  [/Units do not match/, () => 'Unidades incompatíveis'],
  [/Cannot convert (.+) to (.+)/, () => 'Não dá para converter entre essas unidades'],
  [/Parenthesis \) expected/, () => 'Falta fechar parêntese'],
  [/Value expected/, () => 'Falta um valor'],
  [/Unexpected operator (\S+)/, (m) => `Operador ${m[1]} fora do lugar`],
  [/Unexpected type of argument/, () => 'Tipo de valor inválido para essa função'],
  [/Too many arguments/, () => 'Argumentos demais'],
  [/Too few arguments/, () => 'Faltam argumentos'],
  [/Unit .* not found|Unknown unit/, () => 'Unidade desconhecida'],
  [/Dimension mismatch/, () => 'Tamanhos de matriz incompatíveis'],
  [/Syntax error/, () => 'Erro de escrita'],
  [/Invalid left hand side of assignment/, () => 'Lado esquerdo do = inválido'],
  [/Unexpected part "?([^"]+)"?/, (m) => `Não entendi "${m[1]}"`],
  [/Char .* expected/, () => 'Erro de escrita'],
];

export function translateError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  for (const [re, fn] of ERRORS) {
    const m = re.exec(msg);
    if (m) return fn(m);
  }
  return msg.replace(/\s*\(char \d+\)$/, '');
}

const TOTAL = /^(total|soma|subtotal)$/i;

function isLiteral(n: MathNode): boolean {
  const a = n as MathNode & { op?: string; args?: MathNode[]; content?: MathNode };
  if (n.type === 'ConstantNode') return true;
  if (n.type === 'ParenthesisNode') return isLiteral(a.content!);
  if (n.type === 'OperatorNode' && a.op === '-' && a.args!.length === 1) return isLiteral(a.args![0]!);
  // 5 m, 12 kN/m, 9,8 m/s^2: número vezes unidade
  if (n.type === 'OperatorNode' && (a.op === '*' || a.op === '/') && a.args!.length === 2) {
    const [l, r] = a.args!;
    return isLiteral(l!) && isUnitExpr(r!);
  }
  return false;
}

function isUnitExpr(n: MathNode): boolean {
  const a = n as MathNode & { op?: string; args?: MathNode[]; content?: MathNode; name?: string };
  if (n.type === 'SymbolNode') return math.Unit.isValuelessUnit(a.name!);
  if (n.type === 'ParenthesisNode') return isUnitExpr(a.content!);
  if (n.type === 'OperatorNode' && (a.op === '*' || a.op === '/') && a.args!.length === 2) return isUnitExpr(a.args![0]!) && isUnitExpr(a.args![1]!);
  if (n.type === 'OperatorNode' && a.op === '^') return isUnitExpr(a.args![0]!) && a.args![1]!.type === 'ConstantNode';
  return false;
}

export class CalcSheet implements Ctx {
  scope = new Map<string, unknown>();
  defs = new Map<string, Def>();
  private section: unknown[] = [];

  /** Começa um trecho novo para "total" (título, outro bloco). */
  resetSection(): void {
    this.section = [];
  }

  /** Parse com a escrita brasileira, sem avaliar. */
  parse(src: string): MathNode {
    return localize(math.parse(preprocess(src)));
  }

  run(src: string): CalcResult {
    const raw = stripComment(src).trim();
    if (!raw) return { kind: 'empty' };
    const { label, body } = splitLabel(raw);
    try {
      return withCtx(this, () => ({ label, ...this.eval(body) }));
    } catch (e) {
      return { kind: 'error', label, error: translateError(e) };
    }
  }

  private keep(value: unknown): void {
    this.scope.set('ans', value);
    this.section.push(value);
  }

  private eval(body: string): CalcResult {
    if (TOTAL.test(body) && !this.scope.has(body)) {
      let sum: unknown = 0;
      for (const v of this.section) {
        try {
          sum = math.add(sum as never, v as never);
        } catch {
          /* parcela de outro tipo: fica de fora */
        }
      }
      this.keep(sum);
      return { kind: 'value', text: formatValue(sum), value: sum };
    }
    const node = this.parse(body);
    const a = node as MathNode & { name?: string; params?: string[]; expr?: MathNode; value?: MathNode; object?: MathNode; fn?: { name?: string } };

    if (node.type === 'FunctionAssignmentNode') {
      const ex = expandSymbolic(a.expr!, this, new Set(a.params));
      const fnode = new math.FunctionAssignmentNode(a.name!, a.params!, ex.node);
      fnode.compile().evaluate(this.scope);
      this.defs.set(a.name!, { params: a.params!, expr: ex.node });
      return { kind: 'function', name: a.name, text: `${a.name}(${a.params!.join('; ')}) = ${nodeText(ex.node)}`, tex: nodeTex(fnode) };
    }

    if (node.type === 'AssignmentNode' && a.object?.type === 'SymbolNode') {
      const ex = expandSymbolic(a.value!, this, new Set());
      const value = ex.node.compile().evaluate(this.scope);
      const name = (a.object as MathNode & { name: string }).name;
      this.scope.set(name, value);
      this.defs.delete(name);
      this.keep(value);
      return { kind: 'assign', name, text: formatValue(value), tex: valueTex(value), value, trivial: isLiteral(a.value!) };
    }

    const ex = expandSymbolic(node, this, new Set());
    if (ex.symbolic && node.type !== 'AssignmentNode') {
      const free = freeSymbols(ex.node, this.scope);
      const open = free.length > 0 || [...ex.vars].some((v) => ex.node.filter((n) => n.type === 'SymbolNode' && (n as MathNode & { name: string }).name === v).length > 0);
      if (open) {
        const c = ex.indefinite ? ' + C' : '';
        return { kind: 'symbolic', text: nodeText(ex.node) + c, tex: nodeTex(ex.node) + c, value: ex.node };
      }
    }
    const value = ex.node.compile().evaluate(this.scope);
    if (node.type === 'FunctionNode' && a.fn?.name === 'resolver' && Array.isArray(value)) {
      const v = (node as MathNode & { args: MathNode[] }).args[1];
      const name = v && v.type === 'SymbolNode' ? (v as MathNode & { name: string }).name : freeSymbols(node, this.scope)[0] ?? 'x';
      this.scope.set('ans', value);
      const text = value.length ? value.map((r) => `${name} = ${formatValue(r)}`).join('  ou  ') : 'sem solução no intervalo';
      return { kind: 'solutions', name, text, value };
    }
    if (node.type === 'AssignmentNode') {
      // atribuição em matriz (A[1,2] = 3): o mathjs já gravou no escopo
      return { kind: 'assign', text: formatValue(value), value };
    }
    this.keep(value);
    return { kind: 'value', text: formatValue(value), tex: valueTex(value), value };
  }

  /** Funções de uma variável definidas na folha (para o gráfico da aba Cálculo). */
  functions(): { name: string; param: string; text: string }[] {
    return [...this.defs.entries()]
      .filter(([, d]) => d.params.length === 1)
      .map(([name, d]) => ({ name, param: d.params[0]!, text: nodeText(d.expr) }));
  }
}
