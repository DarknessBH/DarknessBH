// Gera os cards de estatísticas do perfil (tema azul) em assets/stats/.
// Uso: GITHUB_TOKEN=... USERNAME=DarknessBH node scripts/gerar-estatisticas.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.USERNAME_GH || process.env.USERNAME || 'DarknessBH';
const OUT = 'assets/stats';
if (!TOKEN) throw new Error('Defina GITHUB_TOKEN');

const C = {
  bg: '#050c26', border: '#1d2a5c', grid: '#16224d',
  title: '#ffffff', text: '#c9d6ff', muted: '#7d8fc4',
  bar: '#3fa9ff', barSoft: '#1d3f9a',
};
const FONT = "'Segoe UI',Ubuntu,'Helvetica Neue',Arial,sans-serif";
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes { stargazerCount languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { login: USERNAME } }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));
const u = json.data.user;
const cc = u.contributionsCollection;

// ---- dados
const days = cc.contributionCalendar.weeks.flatMap(w => w.contributionDays);
const porMes = new Map();
for (const d of days) {
  const k = d.date.slice(0, 7);
  porMes.set(k, (porMes.get(k) || 0) + d.contributionCount);
}
const meses = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  .map(([k, v]) => ({ ano: +k.slice(0, 4), mes: +k.slice(5, 7) - 1, total: v }));

const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
const bytes = new Map();
for (const r of u.repositories.nodes) for (const e of r.languages.edges)
  bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
const totalBytes = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
const langs = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([name, size]) => ({ name, pct: (size / totalBytes) * 100 }));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = n => n.toLocaleString('pt-BR');
const card = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${C.bg}" stroke="${C.border}"/>
${body}
</svg>
`;

// ---- card de resumo
function resumo() {
  const linhas = [
    ['Contribuições (último ano)', cc.contributionCalendar.totalContributions],
    ['Commits', cc.totalCommitContributions],
    ['Pull requests', cc.totalPullRequestContributions],
    ['Repositórios públicos', u.repositories.totalCount],
    ['Estrelas recebidas', stars],
  ];
  const body = [`  <text x="24" y="38" font-size="17" font-weight="700" fill="${C.title}">Estatísticas</text>`];
  linhas.forEach(([label, v], i) => {
    const y = 76 + i * 26;
    body.push(`  <rect x="24" y="${y - 9}" width="4" height="10" rx="2" fill="${C.bar}"/>`);
    body.push(`  <text x="38" y="${y}" font-size="14" fill="${C.text}">${label}</text>`);
    body.push(`  <text x="416" y="${y}" font-size="14" font-weight="700" fill="${C.title}" text-anchor="end">${fmt(v)}</text>`);
  });
  return card(440, 200, body.join('\n'));
}

// ---- card de linguagens (barras horizontais, um só tom)
function linguagens() {
  const body = [`  <text x="24" y="38" font-size="17" font-weight="700" fill="${C.title}">Linguagens mais usadas</text>`];
  const x0 = 24, w = 392;
  langs.forEach((l, i) => {
    const y = 66 + i * 26;
    body.push(`  <text x="${x0}" y="${y}" font-size="13" fill="${C.text}">${esc(l.name)}</text>`);
    body.push(`  <text x="${x0 + w}" y="${y}" font-size="13" fill="${C.muted}" text-anchor="end">${l.pct.toFixed(1).replace('.', ',')}%</text>`);
    body.push(`  <rect x="${x0}" y="${y + 6}" width="${w}" height="6" rx="3" fill="${C.grid}"/>`);
    body.push(`  <rect x="${x0}" y="${y + 6}" width="${Math.max(6, (w * l.pct) / 100).toFixed(1)}" height="6" rx="3" fill="${C.bar}"><title>${esc(l.name)}: ${l.pct.toFixed(1)}%</title></rect>`);
  });
  return card(440, 200, body.join('\n'));
}

// ---- gráfico de colunas: contribuições por mês
function colunas() {
  const W = 900, H = 320, L = 56, R = 24, T = 84, B = 262;
  const max = Math.max(1, ...meses.map(m => m.total));
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;
  const y = v => B - ((B - T) * v) / topo;
  const banda = (W - L - R) / meses.length;
  const bw = Math.min(32, banda * 0.5);
  const total = meses.reduce((s, m) => s + m.total, 0);

  const out = [
    `  <text x="24" y="38" font-size="17" font-weight="700" fill="${C.title}">Contribuições por mês</text>`,
    `  <text x="24" y="60" font-size="13" fill="${C.muted}">Últimos 12 meses · ${fmt(total)} no total</text>`,
  ];
  for (let i = 0; i <= 4; i++) {
    const v = (topo / 4) * i, yy = y(v).toFixed(1);
    out.push(`  <line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${i ? C.grid : C.border}" stroke-width="1"/>`);
    out.push(`  <text x="${L - 10}" y="${(+yy + 4).toFixed(1)}" font-size="11" fill="${C.muted}" text-anchor="end">${fmt(Math.round(v))}</text>`);
  }
  const iMax = meses.findIndex(m => m.total === max);
  meses.forEach((m, i) => {
    const cx = L + banda * i + banda / 2, x = cx - bw / 2;
    const top = y(m.total), h = B - top, r = Math.min(4, h);
    if (m.total > 0) {
      out.push(`  <path d="M${x.toFixed(1)} ${B} V${(top + r).toFixed(1)} Q${x.toFixed(1)} ${top.toFixed(1)} ${(x + r).toFixed(1)} ${top.toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)} ${top.toFixed(1)} ${(x + bw).toFixed(1)} ${(top + r).toFixed(1)} V${B} Z" fill="${C.bar}"><title>${MESES[m.mes]}/${m.ano}: ${fmt(m.total)} contribuições</title></path>`);
    }
    const label = m.mes === 0 || i === 0 ? `${MESES[m.mes]} ${String(m.ano).slice(2)}` : MESES[m.mes];
    out.push(`  <text x="${cx.toFixed(1)}" y="${B + 20}" font-size="12" fill="${C.muted}" text-anchor="middle">${label}</text>`);
    if (i === iMax || i === meses.length - 1) {
      out.push(`  <text x="${cx.toFixed(1)}" y="${(top - 8).toFixed(1)}" font-size="12" font-weight="700" fill="${C.text}" text-anchor="middle">${fmt(m.total)}</text>`);
    }
  });
  return card(W, H, out.join('\n'));
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/resumo.svg`, resumo());
writeFileSync(`${OUT}/linguagens.svg`, linguagens());
writeFileSync(`${OUT}/contribuicoes.svg`, colunas());
console.log('Cards gerados em', OUT, { meses: meses.map(m => m.total), langs: langs.map(l => l.name) });
