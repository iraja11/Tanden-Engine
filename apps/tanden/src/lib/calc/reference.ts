// Cola da aba Cálculo: cada exemplo entra na folha com um clique.

export interface RefItem {
  ex: string;
  note: string;
}
export interface RefSection {
  title: string;
  items: RefItem[];
}

export const REFERENCE: RefSection[] = [
  {
    title: 'Contas',
    items: [
      { ex: '2,5 * 4 + 1.234,50', note: 'vírgula decimal, ponto ou espaço no milhar' },
      { ex: '200 * 15%', note: 'porcentagem' },
      { ex: '2^10 + 3² + √16', note: 'potência, ² ³, raiz' },
      { ex: 'Aluguel: 1500', note: 'rótulo antes de dois-pontos' },
      { ex: 'total', note: 'soma das linhas desde o último título' },
      { ex: 'ans * 2', note: 'resultado da linha anterior' },
      { ex: 'x = 3 // comentário', note: 'variável; // ou # comentam' },
    ],
  },
  {
    title: 'Unidades',
    items: [
      { ex: '100 km/h em m/s', note: '"em", "para" ou -> convertem' },
      { ex: '25 °C para °F', note: 'temperatura' },
      { ex: '3 m * 4 m', note: 'área: 12 m²' },
      { ex: '5 kN/m * (4 m)^2 / 8 em kN*m', note: 'momento numa viga' },
      { ex: '2 cv em kW', note: 'cavalo-vapor, hp, W' },
      { ex: '10 kgf em N', note: 'kgf, tf, lbf, N' },
      { ex: '3 kWh em MJ', note: 'energia' },
      { ex: '12 V / 4 kΩ em mA', note: 'Ω, µF, mH, kV…' },
      { ex: '30 mca em bar', note: 'pressão: Pa, bar, atm, psi, mca, mmHg' },
      { ex: '1500 rpm em Hz', note: 'rotação' },
    ],
  },
  {
    title: 'Funções',
    items: [
      { ex: 'f(x) = x^2 - 3x + 2', note: 'define uma função (aparece no gráfico)' },
      { ex: 'sen(30°) + cos(pi/3)', note: 'sen, cos, tg, arcsen… em radianos ou com °' },
      { ex: 'log(1000) + ln(e)', note: 'log na base 10, ln natural, log(x; b)' },
      { ex: 'max(3; 8; 1)', note: 'argumentos separados por ;' },
      { ex: 'arred(pi; 3)', note: 'arred, piso, teto, abs, fat, mdc, mmc' },
      { ex: 'media([4, 7, 9])', note: 'media, mediana, desvpad, soma' },
    ],
  },
  {
    title: 'Simbólico',
    items: [
      { ex: 'derivada(x^3 * sen(x); x)', note: 'derivada; com um 3º argumento, o valor no ponto' },
      { ex: 'integral(3x^2 + 1; x)', note: 'integral indefinida' },
      { ex: 'integral(e^(-x^2); x; -inf; inf)', note: 'integral definida (aceita infinito)' },
      { ex: 'resolver(x^2 - 5x + 6 = 0; x)', note: 'raízes; resolver(eq; x; a; b) procura em [a; b]' },
      { ex: 'simplificar((x^2 - 1)/(x - 1))', note: 'simplifica' },
      { ex: 'expandir((x + 1)^3)', note: 'expande produtos e potências' },
      { ex: 'taylor(sen(x); x; 0; 7)', note: 'série de Taylor (expr; x; ponto; ordem)' },
      { ex: 'limite(sen(x)/x; x; 0)', note: 'limite; 4º argumento "+" ou "-" para um lado' },
      { ex: 'somatorio(1/k^2; k; 1; 1000)', note: 'somatorio e produtorio' },
      { ex: 'v(t) = derivada(5t^2; t)', note: 'guarda a derivada como função' },
    ],
  },
  {
    title: 'Matrizes e complexos',
    items: [
      { ex: 'A = [1, 2; 3, 4]', note: ', separa colunas e ; separa linhas' },
      { ex: 'det(A)', note: 'det, inv, transp, A * B, A^2' },
      { ex: '(2 + 3i) * (1 - i)', note: 'números complexos' },
      { ex: 'raiz(-9)', note: '3i' },
    ],
  },
  {
    title: 'Constantes',
    items: [
      { ex: 'pi', note: 'π; também e, phi e inf' },
      { ex: '70 kg * g0 em N', note: 'g0: gravidade padrão' },
      { ex: 'c0', note: 'velocidade da luz' },
      { ex: 'Rgas', note: 'constante dos gases (também NA, kB, qe, hP)' },
      { ex: 'eps0', note: 'permissividade do vácuo (também mu0, Gconst, patm)' },
    ],
  },
];

export const PLOT_HELP = [
  ['y = sen(x)', 'função de x (ou só sen(x), ou f(x))'],
  ['Nome: x^2', 'nome na legenda'],
  ['(cos(t); sen(t))', 'curva paramétrica em t'],
  ['r = 1 + cos(θ)', 'curva polar'],
  ['pontos: (1; 2) (3; 4)', 'pontos soltos'],
  ['x = 2', 'reta vertical'],
  ['x: -5..5', 'intervalo (também y: e t:)'],
  ['título: …   proporção: igual   grade: não', 'opções'],
];

export const TEX_HELP = [
  ['$E = mc^2$', 'fórmula no meio do texto'],
  ['$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$', 'fórmula em destaque'],
  ['$\\sum_{k=1}^{n} k$', 'somatório'],
  ['$\\vec F = m \\vec a$', 'vetores'],
];
