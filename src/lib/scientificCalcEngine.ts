export type AngleMode = 'DEG' | 'RAD';

export interface CalcEvaluation {
  ok: boolean;
  value?: number;
  display: string;
  fraction?: string;
  error?: string;
}

export interface QuadraticSolution {
  kind: 'LINEAR' | 'DEGENERATE' | 'TWO_REAL' | 'DOUBLE_REAL' | 'COMPLEX';
  delta?: number;
  x1?: string;
  x2?: string;
  vertex?: { x: string; y: string };
  summary: string;
}

export interface LinearSystem2Solution {
  kind: 'UNIQUE' | 'INFINITE' | 'NO_SOLUTION';
  x?: string;
  y?: string;
  summary: string;
}

export interface FunctionTableRow {
  x: number;
  fx: string;
  gx?: string;
}

function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.abs(n - Math.round(n)) > 1e-9 || n > 170) {
    throw new Error('Math ERROR');
  }
  const k = Math.round(n);
  let res = 1;
  for (let i = 2; i <= k; i++) res *= i;
  return res;
}

function nCr(n: number, r: number): number {
  const ni = Math.round(n);
  const ri = Math.round(r);
  if (
    Math.abs(n - ni) > 1e-9 ||
    Math.abs(r - ri) > 1e-9 ||
    ni < 0 ||
    ri < 0 ||
    ri > ni ||
    ni > 170
  ) {
    throw new Error('Math ERROR');
  }
  return factorial(ni) / (factorial(ri) * factorial(ni - ri));
}

function nPr(n: number, r: number): number {
  const ni = Math.round(n);
  const ri = Math.round(r);
  if (
    Math.abs(n - ni) > 1e-9 ||
    Math.abs(r - ri) > 1e-9 ||
    ni < 0 ||
    ri < 0 ||
    ri > ni ||
    ni > 170
  ) {
    throw new Error('Math ERROR');
  }
  return factorial(ni) / factorial(ni - ri);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function formatCalcNumber(num: number): string {
  if (!Number.isFinite(num)) return 'Math ERROR';
  if (Math.abs(num) < 1e-12) return '0';
  const roundedInt = Math.round(num);
  if (Math.abs(num - roundedInt) < 1e-11 && Math.abs(roundedInt) < 1e12) {
    return String(roundedInt);
  }
  if (Math.abs(num) >= 1e10 || (Math.abs(num) > 0 && Math.abs(num) < 1e-6)) {
    return num.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return Number(num.toPrecision(10)).toString();
}

/**
 * Continued-fraction rational approximation for Casio S⇔D key.
 */
export function toFractionString(value: number, maxDenominator = 10000): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (Math.abs(value) < 1e-12) return '0';
  const sign = value < 0 ? '-' : '';
  const x = Math.abs(value);
  if (Math.abs(x - Math.round(x)) < 1e-10) {
    return `${sign}${Math.round(x)}`;
  }

  let h1 = 1;
  let h2 = 0;
  let k1 = 0;
  let k2 = 1;
  let b = x;
  for (let iter = 0; iter < 24; iter++) {
    const a = Math.floor(b);
    const auxH = a * h1 + h2;
    const auxK = a * k1 + k2;
    if (auxK > maxDenominator) break;
    h2 = h1;
    h1 = auxH;
    k2 = k1;
    k1 = auxK;
    if (Math.abs(x - h1 / k1) < 1e-9) break;
    const frac = b - a;
    if (frac < 1e-12) break;
    b = 1 / frac;
  }

  if (k1 <= 1 || Math.abs(x - h1 / k1) > 1e-7) return undefined;
  const d = gcd(h1, k1);
  return `${sign}${h1 / d}/${k1 / d}`;
}

type Token =
  | { type: 'NUM'; value: number }
  | { type: 'ID'; value: string }
  | { type: 'OP'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' };

function tokenize(raw: string): Token[] {
  const s = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/∛/g, 'cbrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');

  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        numStr += s[i++];
      }
      if (i < s.length && (s[i] === 'E' || (s[i] === 'e' && /[+-0-9]/.test(s[i + 1] || '')))) {
        const expChar = s[i++];
        let expPart = expChar;
        if (s[i] === '+' || s[i] === '-') expPart += s[i++];
        while (i < s.length && /[0-9]/.test(s[i])) expPart += s[i++];
        numStr += expPart;
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) throw new Error('Syntax ERROR');
      tokens.push({ type: 'NUM', value: val });
      continue;
    }
    if ((ch === 'C' || ch === 'P') && !/[a-zA-Z]/.test(s[i + 1] || '')) {
      tokens.push({ type: 'ID', value: ch });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        id += s[i++];
      }
      tokens.push({ type: 'ID', value: id });
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA' });
      i++;
      continue;
    }
    if ('+-*/^!%'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }
    throw new Error('Syntax ERROR');
  }

  // Insert implicit multiplication: 2pi, 2(3+1), (2)(3), 3sin(30), 2x
  const out: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const curr = tokens[idx];
    const prev = out[out.length - 1];
    if (prev) {
      const prevIsValue =
        prev.type === 'NUM' ||
        prev.type === 'RPAREN' ||
        (prev.type === 'OP' && (prev.value === '!' || prev.value === '%')) ||
        (prev.type === 'ID' &&
          ['pi', 'e', 'Ans', 'ans', 'x', 'X'].includes(prev.value));
      const currStartsValue =
        curr.type === 'LPAREN' ||
        curr.type === 'ID' ||
        (curr.type === 'NUM' && prev.type === 'RPAREN');

      const isCombinatorOp = curr.type === 'ID' && (curr.value === 'C' || curr.value === 'P');
      if (prevIsValue && currStartsValue && !isCombinatorOp) {
        out.push({ type: 'OP', value: '*' });
      }
    }
    out.push(curr);
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private angleMode: AngleMode,
    private ans: number,
    private xVal?: number,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const val = this.parseAddSub();
    if (this.pos < this.tokens.length) {
      throw new Error('Syntax ERROR');
    }
    return val;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (true) {
      const t = this.peek();
      if (t?.type === 'OP' && (t.value === '+' || t.value === '-')) {
        this.consume();
        const right = this.parseMulDiv();
        left = t.value === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseCombinator();
    while (true) {
      const t = this.peek();
      if (t?.type === 'OP' && (t.value === '*' || t.value === '/')) {
        this.consume();
        const right = this.parseCombinator();
        if (t.value === '/' && Math.abs(right) < 1e-15) {
          throw new Error('Math ERROR');
        }
        left = t.value === '*' ? left * right : left / right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseCombinator(): number {
    let left = this.parsePower();
    while (true) {
      const t = this.peek();
      if (t?.type === 'ID' && (t.value === 'C' || t.value === 'P')) {
        this.consume();
        const right = this.parsePower();
        left = t.value === 'C' ? nCr(left, right) : nPr(left, right);
      } else {
        break;
      }
    }
    return left;
  }

  private parsePower(): number {
    const base = this.parseUnary();
    const t = this.peek();
    if (t?.type === 'OP' && t.value === '^') {
      this.consume();
      const exp = this.parsePower();
      const res = Math.pow(base, exp);
      if (!Number.isFinite(res)) throw new Error('Math ERROR');
      return res;
    }
    return base;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t?.type === 'OP' && (t.value === '+' || t.value === '-')) {
      this.consume();
      const val = this.parseUnary();
      return t.value === '-' ? -val : val;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): number {
    let val = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (t?.type === 'OP' && t.value === '!') {
        this.consume();
        val = factorial(val);
      } else if (t?.type === 'OP' && t.value === '%') {
        this.consume();
        val = val / 100;
      } else {
        break;
      }
    }
    return val;
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (!t) throw new Error('Syntax ERROR');

    if (t.type === 'NUM') {
      this.consume();
      return t.value;
    }

    if (t.type === 'LPAREN') {
      this.consume();
      const inner = this.parseAddSub();
      if (this.peek()?.type === 'RPAREN') {
        this.consume();
      }
      return inner;
    }

    if (t.type === 'ID') {
      this.consume();
      const id = t.value;
      if (id === 'pi' || id === 'PI') return Math.PI;
      if (id === 'e') return Math.E;
      if (id === 'Ans' || id === 'ans') return this.ans;
      if (id === 'x' || id === 'X') {
        if (this.xVal === undefined) throw new Error('Biến x chỉ dùng trong Bảng f(x)');
        return this.xVal;
      }

      // Function call (with optional parentheses for single argument like sin 30)
      const args: number[] = [];
      if (this.peek()?.type === 'LPAREN') {
        this.consume();
        if (this.peek()?.type !== 'RPAREN') {
          args.push(this.parseAddSub());
          while (this.peek()?.type === 'COMMA') {
            this.consume();
            args.push(this.parseAddSub());
          }
        }
        if (this.peek()?.type === 'RPAREN') this.consume();
      } else {
        args.push(this.parseUnary());
      }

      const a = args[0];
      const toRad = (v: number) => (this.angleMode === 'DEG' ? (v * Math.PI) / 180 : v);
      const fromRad = (v: number) => (this.angleMode === 'DEG' ? (v * 180) / Math.PI : v);

      switch (id.toLowerCase()) {
        case 'sin':
          return Math.sin(toRad(a));
        case 'cos':
          return Math.cos(toRad(a));
        case 'tan': {
          const rad = toRad(a);
          if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error('Math ERROR');
          return Math.tan(rad);
        }
        case 'asin':
        case 'arcsin':
          if (a < -1 || a > 1) throw new Error('Math ERROR');
          return fromRad(Math.asin(a));
        case 'acos':
        case 'arccos':
          if (a < -1 || a > 1) throw new Error('Math ERROR');
          return fromRad(Math.acos(a));
        case 'atan':
        case 'arctan':
          return fromRad(Math.atan(a));
        case 'sqrt':
          if (a < 0) throw new Error('Math ERROR');
          return Math.sqrt(a);
        case 'cbrt':
          return Math.cbrt(a);
        case 'abs':
          return Math.abs(a);
        case 'ln':
          if (a <= 0) throw new Error('Math ERROR');
          return Math.log(a);
        case 'log':
          if (args.length === 2) {
            if (args[0] <= 0 || args[0] === 1 || args[1] <= 0) throw new Error('Math ERROR');
            return Math.log(args[1]) / Math.log(args[0]);
          }
          if (a <= 0) throw new Error('Math ERROR');
          return Math.log10(a);
        case 'exp':
          return Math.exp(a);
        default:
          throw new Error('Syntax ERROR');
      }
    }

    throw new Error('Syntax ERROR');
  }
}

export function evaluateExpression(
  expression: string,
  options?: { angleMode?: AngleMode; ans?: number; x?: number },
): CalcEvaluation {
  const cleaned = expression.trim();
  if (!cleaned) {
    return { ok: true, value: 0, display: '0', fraction: '0' };
  }
  try {
    const tokens = tokenize(cleaned);
    const parser = new Parser(
      tokens,
      options?.angleMode ?? 'DEG',
      options?.ans ?? 0,
      options?.x,
    );
    const value = parser.parse();
    if (!Number.isFinite(value)) {
      return { ok: false, display: 'Math ERROR', error: 'Math ERROR' };
    }
    return {
      ok: true,
      value,
      display: formatCalcNumber(value),
      fraction: toFractionString(value),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Syntax ERROR';
    return { ok: false, display: msg, error: msg };
  }
}

export function solveQuadratic(a: number, b: number, c: number): QuadraticSolution {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    return { kind: 'DEGENERATE', summary: 'Vui lòng nhập hệ số hợp lệ.' };
  }
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) {
      return {
        kind: 'DEGENERATE',
        summary: Math.abs(c) < 1e-12 ? 'Phương trình vô số nghiệm' : 'Phương trình vô nghiệm',
      };
    }
    const x = -c / b;
    return {
      kind: 'LINEAR',
      x1: toFractionString(x) || formatCalcNumber(x),
      summary: `PT bậc nhất: x = ${formatCalcNumber(x)}`,
    };
  }

  const delta = b * b - 4 * a * c;
  const vx = -b / (2 * a);
  const vy = a * vx * vx + b * vx + c;
  const vertex = { x: formatCalcNumber(vx), y: formatCalcNumber(vy) };

  if (delta > 1e-12) {
    const sqrtD = Math.sqrt(delta);
    const r1 = (-b + sqrtD) / (2 * a);
    const r2 = (-b - sqrtD) / (2 * a);
    return {
      kind: 'TWO_REAL',
      delta,
      x1: `${formatCalcNumber(r1)}${toFractionString(r1) && toFractionString(r1) !== formatCalcNumber(r1) ? ` (${toFractionString(r1)})` : ''}`,
      x2: `${formatCalcNumber(r2)}${toFractionString(r2) && toFractionString(r2) !== formatCalcNumber(r2) ? ` (${toFractionString(r2)})` : ''}`,
      vertex,
      summary: `Δ = ${formatCalcNumber(delta)} > 0: có 2 nghiệm thực phân biệt`,
    };
  }
  if (Math.abs(delta) <= 1e-12) {
    const r = -b / (2 * a);
    const frac = toFractionString(r);
    const label = frac && frac !== formatCalcNumber(r) ? `${formatCalcNumber(r)} (${frac})` : formatCalcNumber(r);
    return {
      kind: 'DOUBLE_REAL',
      delta: 0,
      x1: label,
      x2: label,
      vertex,
      summary: `Δ = 0: có nghiệm kép x₁ = x₂ = ${label}`,
    };
  }

  const realPart = -b / (2 * a);
  const imagPart = Math.sqrt(-delta) / (2 * Math.abs(a));
  return {
    kind: 'COMPLEX',
    delta,
    x1: `${formatCalcNumber(realPart)} + ${formatCalcNumber(imagPart)}i`,
    x2: `${formatCalcNumber(realPart)} - ${formatCalcNumber(imagPart)}i`,
    vertex,
    summary: `Δ = ${formatCalcNumber(delta)} < 0: vô nghiệm thực (có 2 nghiệm phức)`,
  };
}

export function solveLinearSystem2(
  a1: number,
  b1: number,
  c1: number,
  a2: number,
  b2: number,
  c2: number,
): LinearSystem2Solution {
  const D = a1 * b2 - a2 * b1;
  const Dx = c1 * b2 - c2 * b1;
  const Dy = a1 * c2 - a2 * c1;
  if (Math.abs(D) > 1e-12) {
    const x = Dx / D;
    const y = Dy / D;
    const fx = toFractionString(x);
    const fy = toFractionString(y);
    return {
      kind: 'UNIQUE',
      x: fx && fx !== formatCalcNumber(x) ? `${formatCalcNumber(x)} (${fx})` : formatCalcNumber(x),
      y: fy && fy !== formatCalcNumber(y) ? `${formatCalcNumber(y)} (${fy})` : formatCalcNumber(y),
      summary: `Hệ có nghiệm duy nhất (D = ${formatCalcNumber(D)})`,
    };
  }
  if (Math.abs(Dx) <= 1e-12 && Math.abs(Dy) <= 1e-12) {
    return { kind: 'INFINITE', summary: 'Hệ có vô số nghiệm (2 đường thẳng trùng nhau)' };
  }
  return { kind: 'NO_SOLUTION', summary: 'Hệ vô nghiệm (2 đường thẳng song song)' };
}

export function computeFunctionTable(
  fxExpr: string,
  start: number,
  end: number,
  step: number,
  angleMode: AngleMode = 'DEG',
  gxExpr?: string,
): FunctionTableRow[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step <= 0) {
    return [];
  }
  const rows: FunctionTableRow[] = [];
  const maxRows = 45;
  let current = start;
  let count = 0;
  while (current <= end + 1e-9 && count < maxRows) {
    const cleanX = Number(current.toFixed(6));
    const evalF = evaluateExpression(fxExpr, { angleMode, x: cleanX });
    const row: FunctionTableRow = {
      x: cleanX,
      fx: evalF.ok ? evalF.display : 'ERROR',
    };
    if (gxExpr && gxExpr.trim()) {
      const evalG = evaluateExpression(gxExpr, { angleMode, x: cleanX });
      row.gx = evalG.ok ? evalG.display : 'ERROR';
    }
    rows.push(row);
    current += step;
    count++;
  }
  return rows;
}
