#!/usr/bin/env node
/**
 * Pratinjau satu artikel film UJUNG KE UJUNG, tanpa menyentuh produksi.
 *
 *   node n8n/uji-film.mjs review-spiderman-brand-new-day-2026
 *   node n8n/uji-film.mjs                       # daftar artikel yang bisa dipakai
 *
 * Yang dijalankan di sini adalah Code node ASLI dari portofolio-publish.local.json —
 * bukan salinannya — plus panggilan TMDB, Gemini, dan render-svc yang sungguhan. Jadi
 * kalau hasilnya bagus di sini, yang terbit nanti juga bagus; kalau meleset, melesetnya
 * ketahuan sebelum ada satu e-mail approval pun terkirim.
 *
 * KENAPA ADA WORKFLOW SEMENTARA. Kunci Gemini hidup di kredensial n8n dan tidak pernah
 * menyentuh disk. Skrip ini membuat satu workflow sekali pakai, memakainya, lalu
 * MENGHAPUSNYA lagi — termasuk kalau di tengah jalan gagal. Webhook yang meneruskan ke
 * kredensial Gemini itu pintu terbuka ke kuota orang, jadi dia tidak boleh menginap.
 *
 * Yang TIDAK dilakukan skrip ini: menyentuh workflow produksi, mengirim e-mail,
 * commit, dan posting ke mana pun. Render-nya masuk ke brand `uji`, bukan `daffathan`.
 */
import fs from 'node:fs';
import path from 'node:path';

const AKAR = path.join(import.meta.dirname, '..');
const S = JSON.parse(fs.readFileSync(path.join(AKAR, 'n8n/src/secrets.local.json'), 'utf8'));
const WF = JSON.parse(fs.readFileSync(path.join(AKAR, 'n8n/portofolio-publish.local.json'), 'utf8'));
const node = (n) => WF.nodes.find((x) => x.name === n);
const src = (n) => node(n).parameters.jsCode;
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

const API = 'https://workflow.daffathan-labs.my.id';
const kepala = { 'X-N8N-API-KEY': S.n8n_api_key, 'Content-Type': 'application/json' };
const nilai = (nama) =>
  node('Kredensial').parameters.assignments.assignments.find((a) => a.name === nama).value;
const ARTIKEL = String(nilai('article_api_url')).replace(/\/+$/, '');
const SITUS = String(nilai('site_url')).replace(/\/+$/, '');

// ── 1. artikelnya ──────────────────────────────────────────────────────────────
const semua = (await (await fetch(`${ARTIKEL}/articles`)).json()).data || [];
const KODE = process.argv[2];
if (!KODE) {
  const film = [...new Set(semua.map((a) => a.id))].filter((id) => /^review-/.test(id));
  console.log(`${film.length} artikel review yang bisa dipratinjau:\n  ${film.join('\n  ')}`);
  console.log('\nPakai: node n8n/uji-film.mjs <kode>');
  process.exit(0);
}

const punya = semua.filter((a) => a.id === KODE);
if (!punya.length) {
  console.error(`"${KODE}" tidak ada di ${ARTIKEL}/articles. Jalankan tanpa argumen untuk daftarnya.`);
  process.exit(1);
}
const id = punya.find((a) => a.locale === 'id');
const en = punya.find((a) => a.locale === 'en');
const utama = id || en;
const tautan = (a) => (a ? `${SITUS}/${a.locale}/articles/${a.slug}` : null);

// Bentuknya harus SAMA PERSIS dengan keluaran siapkan-brief.js — prompt-copy.txt membaca
// field-field ini lewat nama, dan satu nama yang meleset bikin promptnya bolong diam-diam.
const brief = {
  folder: KODE,
  code: KODE.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 64),
  title_id: (id && id.title) || null,
  title_en: (en && en.title) || null,
  excerpt: utama.excerpt,
  tags: (utama.tags || []).join(', '),
  teks: String(utama.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000),
  url_en: tautan(en) || tautan(id),
  url_id: tautan(id) || tautan(en),
  cover: utama.image && !/^https?:\/\//i.test(utama.image) ? `${ARTIKEL}${utama.image}` : utama.image,
  repo: '', berkas_md: [], dilewat: [],
};
console.log(`artikel : ${KODE}`);
console.log(`judul   : ${brief.title_id || brief.title_en}`);
console.log(`teks    : ${brief.teks.length} karakter | tag: ${brief.tags || '(kosong)'}`);

// ── 2. workflow sementara ──────────────────────────────────────────────────────
// Node-nya DISALIN dari workflow produksi, bukan ditulis ulang: prompt, skema, model, dan
// kredensialnya harus identik, kalau tidak yang diuji bukan yang bakal terbit.
const salin = (nama, ubah = {}) => ({ ...JSON.parse(JSON.stringify(node(nama))), ...ubah });
const webhook = (nama, jalur, x) => ({
  id: `w-${jalur}`, name: nama, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [x, 0],
  webhookId: `a1b2c3d4-0000-4000-8000-0000000000${jalur === 'uji-copy' ? '11' : '22'}`,
  parameters: { httpMethod: 'POST', path: jalur, responseMode: 'responseNode', options: {} },
});
const balas = (nama, x, y) => ({
  id: `r-${nama}`, name: nama, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
  position: [x, y],
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
});

const sementara = {
  name: `uji-film ${KODE} (HAPUS)`,
  settings: { executionOrder: 'v1' },
  nodes: [
    webhook('Webhook', 'uji-copy', 0),
    // Dinamai persis "Siapkan brief" karena prompt-copy.txt memanggilnya lewat nama itu.
    {
      id: 'brief', name: 'Siapkan brief', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
      parameters: { jsCode: 'return [{ json: $("Webhook").first().json.body.brief }];' },
    },
    salin('Gemini copy', { position: [440, 0] }),
    salin('Gemini Flash', { position: [400, 200] }),
    salin('Skema copy', { position: [560, 200] }),
    balas('Balas copy', 660, 0),
    webhook('Webhook visi', 'uji-vision', 0),
    salin('Terangkan still', {
      position: [220, 400],
      parameters: {
        ...node('Terangkan still').parameters,
        jsonBody: '={{ JSON.stringify($json.body.body) }}',
      },
    }),
    balas('Balas visi', 440, 400),
  ].map((n) => ({ ...n, position: n.position || [0, 0] })),
  connections: {
    Webhook: { main: [[{ node: 'Siapkan brief', type: 'main', index: 0 }]] },
    'Siapkan brief': { main: [[{ node: 'Gemini copy', type: 'main', index: 0 }]] },
    'Gemini copy': { main: [[{ node: 'Balas copy', type: 'main', index: 0 }]] },
    'Gemini Flash': { ai_languageModel: [[{ node: 'Gemini copy', type: 'ai_languageModel', index: 0 }]] },
    'Skema copy': { ai_outputParser: [[{ node: 'Gemini copy', type: 'ai_outputParser', index: 0 }]] },
    'Webhook visi': { main: [[{ node: 'Terangkan still', type: 'main', index: 0 }]] },
    'Terangkan still': { main: [[{ node: 'Balas visi', type: 'main', index: 0 }]] },
  },
};

// Webhook visi posisinya bentrok dengan Webhook copy; digeser supaya kanvasnya terbaca
// kalau ada yang sempat membukanya sebelum dihapus.
sementara.nodes.find((n) => n.name === 'Webhook visi').position = [0, 400];

const buat = await fetch(`${API}/api/v1/workflows`, {
  method: 'POST', headers: kepala, body: JSON.stringify(sementara),
});
const dibuat = await buat.json();
if (buat.status !== 200) {
  console.error('gagal membuat workflow sementara:', buat.status, JSON.stringify(dibuat).slice(0, 400));
  process.exit(1);
}
// try/finally: workflow sementara HARUS terhapus walau di tengah jalan ada yang gagal.
// Tanpa ini satu error meninggalkan webhook hidup yang meneruskan ke kredensial Gemini.
try {
  await fetch(`${API}/api/v1/workflows/${dibuat.id}/activate`, { method: 'POST', headers: kepala });
  console.log(`workflow sementara: ${dibuat.id} (dihapus lagi di akhir)`);

  const panggil = async (jalur, badan) => {
    const r = await fetch(`${API}/webhook/${jalur}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(badan),
    });
    if (!r.ok) throw new Error(`${jalur} balas ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return await r.json();
  };

  // ── 3. caption + slide, dari Gemini copy yang asli ───────────────────────────
  const copy = (await panggil('uji-copy', { brief })).output;
  if (!copy || !Array.isArray(copy.slides)) throw new Error('Gemini copy tidak mengembalikan slides[]');
  console.log(`\nfilm dikenali: ${copy.film ? `"${copy.film}"` : '(kosong — jalur foto asli tidak jalan)'}`);
  console.log(`aksen ${copy.accent} | layout ${copy.layout} | mood ${copy.image_mood}`);

  // ── 4. TMDB ──────────────────────────────────────────────────────────────────
  const tmdb = async (j) =>
    await (await fetch(`https://api.themoviedb.org/3/${j}api_key=${S.tmdb_api_key}`)).json();
  // Judul dan tahun dipisah, sama seperti node `Cari film`. Tahun yang ikut menempel di
  // query mengembalikan NOL hasil untuk sebagian judul — lihat catatan di build.mjs.
  const cari = copy.film
    ? await tmdb(
        `search/movie?query=${encodeURIComponent(copy.film)}` +
          `&year=${encodeURIComponent(copy.film_tahun || '')}&`
      )
    : { results: [] };
  const film = (cari.results || [])[0];
  const gambar = film ? await tmdb(`movie/${film.id}/images?`) : { backdrops: [] };
  const pemain = film ? await tmdb(`movie/${film.id}/credits?`) : { cast: [] };
  const polos = (gambar.backdrops || []).filter((b) => b.iso_639_1 == null).length;
  console.log(
    film
      ? `TMDB    : #${film.id} ${film.title} | ${(gambar.backdrops || []).length} backdrop, ${polos} polos`
      : 'TMDB    : tidak ketemu — slide jatuh ke gambar generate'
  );

  const sampul = brief.cover
    ? Buffer.from(await (await fetch(brief.cover)).arrayBuffer()).toString('base64')
    : null;

  // ── 5. Code node ASLI ────────────────────────────────────────────────────────
  const ref = (peta) => (n) => ({
    isExecuted: true,
    first: () => ({ json: peta[n] === undefined ? {} : peta[n] }),
    all: () => (Array.isArray(peta[`${n}[]`]) ? peta[`${n}[]`].map((json) => ({ json })) : []),
  });

  const kandidat = (
    await new AsyncFn('$', src('Siapkan kandidat')).call(
      { helpers: { httpRequest: async ({ url }) => Buffer.from(await (await fetch(url)).arrayBuffer()) } },
      ref({ 'Still film': gambar, 'Pemain film': pemain, 'Cover base64': { b64: sampul } })
    )
  )[0].json;
  console.log(
    `kandidat: ${kandidat.url.length} still` +
      (kandidat.body ? ` | ${(JSON.stringify(kandidat.body).length / 1048576).toFixed(2)} MB ke Gemini` : ' (Gemini visi dilewati)')
  );

  const visi = kandidat.body ? await panggil('uji-vision', { body: kandidat.body }) : {};

  const meta = new Function('$', src('Pecah slide'))(
    ref({
      'Siapkan brief': brief, 'Gemini copy': { output: copy },
      'Siapkan kandidat': kandidat, 'Terangkan still': visi, 'Pemain film': pemain,
    })
  ).map((x) => x.json);

  console.log('\nfoto tiap slide:');
  meta.forEach((m, i) =>
    console.log(
      `  ${i + 1}. ${String(m.foto_url || '(kartu warna)').split('/').pop().padEnd(36)}` +
        `${m.foto_potret ? 'potret pemain' : m.foto_url ? 'still 16:9   ' : '             '}  ${m.heading}`
    )
  );
  const dipakai = meta.map((m) => m.foto_url).filter(Boolean);
  if (new Set(dipakai).size !== dipakai.length) console.log('  !! ADA GAMBAR YANG DIPAKAI DUA KALI');

  const raster = [];
  for (const m of meta) {
    if (!m.foto_url) { raster.push(null); continue; }
    const r = await fetch(m.foto_url);
    raster.push(r.ok ? Buffer.from(await r.arrayBuffer()).toString('base64') : null);
  }

  const hasil = new Function('$runIndex', '$', src('Rakit slide'))(
    0,
    ref({
      'Siapkan brief': brief, 'Gemini copy': { output: copy },
      'Cover base64': { b64: sampul, mime: 'image/webp' },
      'Pecah slide[]': meta,
      'Slide base64[]': raster.map((b64) => ({ b64, mime: 'image/jpeg' })),
    })
  )[0].json;

  // ── 6. caption, dicetak utuh supaya benar-benar dibaca ───────────────────────
  const kata = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  for (const [judul, isi, target] of [
    ['INSTAGRAM', hasil.ig_caption, '30-60 kata'],
    ['FACEBOOK', hasil.fb_caption, '150-250 kata'],
    ['LINKEDIN', hasil.linkedin_caption, '120-200 kata'],
  ]) {
    console.log(`\n${'─'.repeat(72)}\n${judul}  (${kata(isi)} kata, target ${target})\n${'─'.repeat(72)}`);
    console.log(isi);
  }

  // ── 7. render ────────────────────────────────────────────────────────────────
  const r = await fetch(`${S.render_url}/render`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${S.render_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brand: 'uji', code: brief.code, caption: hasil.ig_caption,
      images: hasil.slides.map((html, i) => ({ name: String(i + 1).padStart(2, '0'), html })),
    }),
  });
  const teks = await r.text();
  console.log(`\nrender HTTP ${r.status}${r.ok ? '' : ` — ${teks.slice(0, 300)}`}`);
  if (r.ok) console.log('PRATINJAU: ' + JSON.parse(teks).previewUrl);
} finally {
  const hapus = await fetch(`${API}/api/v1/workflows/${dibuat.id}`, { method: 'DELETE', headers: kepala });
  console.log(`\nworkflow sementara dihapus: HTTP ${hapus.status}`);
}
