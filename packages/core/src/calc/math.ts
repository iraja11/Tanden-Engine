import { all, create, type MathJsInstance } from 'mathjs';

/*
 * Instância própria do mathjs: unidades brasileiras e de engenharia que faltam,
 * constantes com nomes curtos. As funções simbólicas e numéricas entram em sheet.ts.
 */

export const math: MathJsInstance = create(all!, { number: 'number', precision: 64 });

const UNITS: [string, string, boolean?][] = [
  ['cal', '4.184 J', true],
  ['rpm', '1 / min'],
  ['ha', '10000 m^2'],
  ['cv', '735.49875 W'],
  ['mca', '9806.65 Pa'],
  ['tf', '1000 kgf'],
  ['pol', '1 inch'],
  ['Ah', '3600 C', true],
];
// createUnit põe a unidade nova como preferida na hora de mostrar (12 m² viraria 0,0012 ha):
// guarda os sistemas de unidades e devolve como estavam
const systems = (math.Unit as unknown as { UNIT_SYSTEMS: Record<string, Record<string, unknown>> }).UNIT_SYSTEMS;
const saved = Object.fromEntries(Object.entries(systems).map(([k, v]) => [k, { ...v }]));
for (const [name, def, prefixes] of UNITS) {
  try {
    math.createUnit(name, prefixes ? { definition: def, prefixes: 'short' } : def);
  } catch {
    /* já existe nesta versão do mathjs */
  }
}
for (const [k, v] of Object.entries(systems)) {
  for (const q of Object.keys(v)) if (!(q in saved[k]!)) delete v[q];
  Object.assign(v, saved[k]);
}

/** Constantes com nome curto. As longas do mathjs (speedOfLight, avogadro...) também valem. */
export const CONSTANTS: Record<string, [string, string]> = {
  g0: ['9.80665 m/s^2', 'gravidade padrão'],
  c0: ['299792458 m/s', 'velocidade da luz'],
  NA: ['6.02214076e23 mol^-1', 'número de Avogadro'],
  kB: ['1.380649e-23 J/K', 'constante de Boltzmann'],
  qe: ['1.602176634e-19 C', 'carga elementar'],
  eps0: ['8.8541878128e-12 F/m', 'permissividade do vácuo'],
  mu0: ['1.25663706212e-6 N/A^2', 'permeabilidade do vácuo'],
  Rgas: ['8.314462618 J/(mol K)', 'constante dos gases'],
  Gconst: ['6.6743e-11 N m^2/kg^2', 'constante gravitacional'],
  hP: ['6.62607015e-34 J s', 'constante de Planck'],
  patm: ['101325 Pa', 'pressão atmosférica padrão'],
};

math.import(
  {
    ...Object.fromEntries(Object.entries(CONSTANTS).map(([k, [v]]) => [k, math.evaluate(v)])),
    inf: Infinity,
  },
  { override: true },
);
