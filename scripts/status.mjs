// Gera status-dark.svg e status-light.svg com a presença do Discord (via Lanyard): o que está tocando no
// Spotify ou o jogo aberto. Roda na GitHub Action a cada 30 minutos; sem dependências (Node 20+).
// A capa do álbum vai embutida em base64, porque o GitHub não carrega imagens externas dentro de um SVG.
import fs from "node:fs";

const ID = "810005107801718804";
const out = process.argv[2] || "dist";
fs.mkdirSync(out, { recursive: true });

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function dataUri(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

// LANYARD_FILE=arquivo.json troca a consulta por uma resposta salva (para testar o visual)
const raw = process.env.LANYARD_FILE
  ? JSON.parse(fs.readFileSync(process.env.LANYARD_FILE, "utf8"))
  : await (await fetch(`https://api.lanyard.rest/v1/users/${ID}`)).json();
const d = raw.data;
const STATUS = { online: ["Online", "#23a55a"], idle: ["Ausente", "#f0b232"], dnd: ["Não perturbe", "#f23f43"], offline: ["Offline", "#80848e"] };
const [statusLabel, statusColor] = STATUS[d?.discord_status] ?? STATUS.offline;
const game = d?.activities?.find((a) => a.type === 0);

let kind = "idle", title = "Sem atividade agora", sub = "", art = null, progress = null;
if (d?.listening_to_spotify && d.spotify) {
  kind = "spotify";
  title = d.spotify.song;
  sub = d.spotify.artist.replace(/;\s*/g, ", ");
  art = await dataUri(d.spotify.album_art_url);
  const { start, end } = d.spotify.timestamps;
  progress = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
} else if (game) {
  kind = "game";
  title = game.name;
  sub = [game.details, game.state].filter(Boolean).join(" · ");
}
const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const label = { spotify: "OUVINDO NO SPOTIFY", game: "JOGANDO", idle: "DISCORD" }[kind];

function card(dark) {
  const bg = dark ? "#0E1015" : "#FFFFFF", line = dark ? "#1C2029" : "#DDE0E6", paper = dark ? "#ECEEF2" : "#0B0D12", mute = dark ? "#7A8394" : "#5D6574";
  const x = art ? 196 : 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="190" viewBox="0 0 840 190" role="img" aria-label="${esc(label)}: ${esc(title)}">
  <style>
    .m { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; letter-spacing: .14em; }
    .t { font-family: "Space Grotesk", "Inter", "Segoe UI", Helvetica, Arial, sans-serif; }
    .eq rect { transform-origin: bottom; transform-box: fill-box; animation: eq .9s ease-in-out infinite alternate; }
    .eq rect:nth-child(2) { animation-duration: .7s; } .eq rect:nth-child(3) { animation-duration: 1.1s; } .eq rect:nth-child(4) { animation-duration: .8s; }
    @keyframes eq { from { transform: scaleY(.25); } to { transform: scaleY(1); } }
    .live { animation: blink 1.6s steps(2, jump-none) infinite; } @keyframes blink { 50% { opacity: .2; } }
  </style>
  <defs><clipPath id="c"><rect x="24" y="24" width="142" height="142" rx="12"/></clipPath></defs>
  <rect x=".5" y=".5" width="839" height="189" rx="20" fill="${bg}" stroke="${line}"/>
  ${art ? `<image href="${art}" x="24" y="24" width="142" height="142" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>` : ""}
  <g class="m" font-size="11" fill="${mute}">
    <circle class="live" cx="${x + 5}" cy="44" r="4.5" fill="#3D7BFF"/>
    <text x="${x + 18}" y="48">AO VIVO · ${label}</text>
    <text x="816" y="48" text-anchor="end"><tspan fill="${statusColor}">●</tspan> ${esc(statusLabel.toUpperCase())}</text>
  </g>
  ${kind === "spotify" ? `<g class="eq" fill="#3D7BFF">${[0, 1, 2, 3].map((i) => `<rect x="${x + i * 6}" y="66" width="4" height="22" rx="1"/>`).join("")}</g>` : ""}
  <text class="t" x="${kind === "spotify" ? x + 34 : x}" y="88" font-size="28" font-weight="700" fill="${paper}">${esc(cut(title, art ? 34 : 44))}</text>
  <text class="t" x="${x}" y="118" font-size="17" fill="${mute}">${esc(cut(sub, art ? 52 : 66))}</text>
  ${progress === null ? "" : `<rect x="${x}" y="140" width="${800 - x}" height="4" rx="2" fill="${line}"/><rect x="${x}" y="140" width="${Math.round((800 - x) * progress)}" height="4" rx="2" fill="#3D7BFF"/>`}
  <text class="m" x="${x}" y="168" font-size="10" fill="${mute}">ATUALIZADO ${esc(when)} · BRT</text>
</svg>
`;
}

fs.writeFileSync(`${out}/status-dark.svg`, card(true));
fs.writeFileSync(`${out}/status-light.svg`, card(false));

// histórico das músicas: o branch output é refeito a cada execução, então o arquivo anterior é lido de lá,
// a música atual entra no topo (sem repetir) e ficam as 12 mais recentes. Usado pelo portfólio.
const RECENT = "https://raw.githubusercontent.com/77sorryz/77sorryz/output/recent.json";
let recent = [];
try {
  const r = await fetch(`${RECENT}?t=${Date.now()}`);
  if (r.ok) recent = (await r.json()).tracks ?? [];
} catch {}
if (d?.listening_to_spotify && d.spotify?.track_id) {
  const s = d.spotify;
  recent = [
    { id: s.track_id, song: s.song, artist: s.artist.replace(/;\s*/g, ", "), album: s.album, art: s.album_art_url, at: Date.now() },
    ...recent.filter((x) => x.id !== s.track_id),
  ].slice(0, 12);
}
fs.writeFileSync(`${out}/recent.json`, JSON.stringify({ updated: Date.now(), tracks: recent }, null, 1));
console.log(kind, title);
