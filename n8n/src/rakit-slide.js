// Gabung N item slide jadi SATU item berisi slides[] HTML siap render.
//
// Node ini adalah titik masuk loop retry: `Render` yang gagal kembali ke sini, bukan
// ke `Gemini gambar`. Karena itu semua data dibaca lewat referensi node bernama,
// tidak lewat $input — saat dipanggil ulang, $input berisi keluaran node retry,
// bukan JPEG hasil konversi.
// Gambar juga sengaja tidak digenerate ulang: penyebab 422 adalah teks yang meluber,
// bukan gambarnya, dan regenerasi lima gambar tiap ronde itu bakar kuota percuma.
//
// Tiap ronde teksnya DIPERKECIL. Retry yang mengirim input identik ke render-svc
// deterministik akan gagal identik 8 kali — yang membuatnya konvergen adalah ini.
const ronde = $runIndex;
const brief = $('Siapkan brief').first().json;
const copy = $('Gemini copy').first().json.output;
const meta = $('Pecah slide').all().map((i) => i.json);
// Artikel yang punya foto sendiri melewati `Gemini gambar` sama sekali — cabang itu
// tidak dieksekusi, jadi node-nya harus ditanya dulu sebelum dibaca. Tanpa penjaga
// ini ekspresinya melempar "Referenced node is unexecuted" dan seluruh carousel mati.
const jpeg = $('Jadi JPEG').isExecuted ? $('Jadi JPEG').all() : [];

if (jpeg.length && jpeg.length !== meta.length) {
  throw new Error(
    `Slide masuk ${jpeg.length} tapi metadata ${meta.length}. Pasangan per-indeks ` +
      'tidak bisa dipercaya — kemungkinan Gemini gambar men-drop item.'
  );
}

// Raster per slide. Node gambar memakai onError:continueRegularOutput, jadi slide
// yang gagal tetap mengirim item tapi tanpa binary.
const raster = jpeg.map((it) => (it.binary && it.binary.data && it.binary.data.data) || null);
const adaRaster = raster.filter(Boolean);
// Nol gambar bukan kegagalan yang menahan pipeline: slide tanpa raster jatuh ke kartu
// warna, dan artikel yang punya foto sendiri memang tidak memanggil Gemini sama sekali.
const gambarGagal = raster.filter((r) => !r).length;
// Slide yang gagal meminjam raster tetangga — satu latar berulang jauh lebih baik
// daripada satu slide kosong di tengah carousel.
const bg = raster.map((r) => r || adaRaster[0] || null);

// Gambar artikel, kalau ada. `Ambil cover` memakai onError:continueRegularOutput,
// jadi artikel tanpa gambar dan unduhan yang gagal sama-sama berakhir null di sini —
// dan dua-duanya memang ditangani sama: pakai gambar Gemini.
const unduhan = $('Ambil cover').first();
const coverB64 = (unduhan && unduhan.binary && unduhan.binary.data && unduhan.binary.data.data) || null;
// Mime dibaca dari unduhan, bukan diasumsikan: API menyajikan cover sebagai WebP,
// dan menuliskannya sebagai image/jpeg bikin Chromium menolak merender gambarnya.
const coverMime = (unduhan && unduhan.binary && unduhan.binary.data && unduhan.binary.data.mimeType) || 'image/jpeg';

// Foto artikel dipakai di SEMUA slide, bukan cuma slide 1.
//
// Alasannya bukan kerapian: model gambar menolak menggambar karakter berhak cipta dan
// wajah orang nyata, jadi "Spider-Man" atau "Sadie Sink" tidak akan pernah keluar dari
// Gemini. Satu-satunya foto yang benar-benar menampilkan subjek artikel adalah foto
// artikel itu sendiri. Lima gambar abstrak yang tidak menyinggung subjeknya kalah
// nyambung dibanding satu foto asli yang dipotong lima cara.
//
// Konsekuensi yang disengaja: artikel bergambar tidak memanggil Gemini gambar sama
// sekali — 45 dari 46 artikel punya gambar, jadi kuota gambar praktis berhenti terpakai.
// Diturunkan dari `meta`, BUKAN dari `bg`: cabang "punya cover" melewati Gemini, jadi
// `bg` kosong di situ dan memetakannya menghasilkan nol latar untuk semua slide.
const latar = meta.map((_, i) =>
  coverB64
    ? `data:${coverMime};base64,${coverB64}`
    : bg[i] ? `data:image/jpeg;base64,${bg[i]}` : null
);

/**
 * Titik potong per slide. Satu foto yang sama akan terlihat seperti satu gambar
 * diulang lima kali kalau dipasang identik; menggeser fokus dan sedikit zoom bikin
 * kelimanya terbaca sebagai satu seri, bukan pengulangan.
 *
 * Cuma dipakai kalau fotonya memang satu dan sama. Raster Gemini sudah berbeda-beda
 * per slide, jadi menggesernya malah membuang bagian yang sengaja dikomposisikan.
 */
const CROP = [
  { pos: '50% 30%', zoom: 1 },
  { pos: '22% 45%', zoom: 1.12 },
  { pos: '78% 45%', zoom: 1.12 },
  { pos: '50% 72%', zoom: 1.06 },
  { pos: '50% 50%', zoom: 1.18 },
];
const potong = (i) => (coverB64 ? CROP[i % CROP.length] : { pos: '50% 50%', zoom: 1 });

// Ronde 0 pakai ukuran penuh; tiap ronde berikutnya mengecil sampai lantai 70%.
// Digabung dengan pemangkasan kata di bawah, ronde 8 praktis mustahil meluber.
const skala = Math.max(0.7, 1 - ronde * 0.06);
const px = (n) => Math.round(n * skala);
const maksKata = (s, n) => {
  const kata = String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean);
  return kata.length <= n ? kata.join(' ') : kata.slice(0, n).join(' ') + '…';
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

/**
 * Rapikan hashtag jadi bentuk yang benar-benar jadi tautan di Instagram.
 *
 * Prompt sudah meminta hashtag, tapi model rutin mengembalikan kata telanjang
 * ("spiderman marvel mcu") — dan caption yang terbit jadi deretan kata biasa yang
 * tidak bisa diklik dan tidak masuk pencarian mana pun. Sudah kejadian sekali.
 * Ditegakkan di kode, bukan diminta di prompt, sama seperti batas jumlahnya.
 *
 * Spasi di dalam satu tagar juga dibuang: "#brand new day" cuma jadi tagar "#brand",
 * dua kata sisanya hilang jadi teks biasa.
 */
const tagar = (daftar) =>
  (daftar || [])
    .map((t) => String(t == null ? '' : t).trim().replace(/^#+/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => `#${t}`)
    .join(' ');

// Disisipkan build.mjs dari icons/icon-192.png.
const LOGO = '{{LOGO}}';

// Satu-satunya ajakan yang muncul di gambar, dan isinya tetap tiap posting.
// Diarahkan ke bio, bukan URL: tautan di caption Instagram tidak bisa diklik dan
// praktis tidak ada yang mengetik ulang alamat dari sebuah gambar.
// Teks dari model untuk slide terakhir sengaja ditimpa — penutup tidak perlu
// berubah tiap artikel, dan membiarkan model menulisnya cuma menambah satu
// peluang gagal (menyelipkan URL sendiri, atau ajakan yang meleset).
const CTA_AKHIR = {
  heading: 'Artikel lengkapnya di link bio',
  body: 'Semua tulisan aku ada di sana — teknis, review film, sampai catatan keseharian.',
};

// ── warna aksen: dipilih model, TIDAK dipercaya ─────────────────────────────────
// Biru brand, dipakai kalau aksen dari model tidak lolos pemeriksaan.
const AKSEN_CADANGAN = '#5EC8FF';

/** Luminansi relatif WCAG. */
const luminansi = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const kontras = (a, b) => {
  const [x, y] = [luminansi(a), luminansi(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Hue 0-360 dari hex. Dipakai untuk mengunci aksen di keluarga biru. */
const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const maks = Math.max(r, g, b);
  const beda = maks - Math.min(r, g, b);
  if (!beda) return 0;
  const h =
    maks === r ? ((g - b) / beda) % 6 : maks === g ? (b - r) / beda + 2 : (r - g) / beda + 4;
  return (h * 60 + 360) % 360;
};

/**
 * Aksen diperiksa TIGA kali, dan tiap pemeriksaan menutup kegagalan yang berbeda:
 *
 * 1. Bentuk `#RRGGBB`. Model rutin mengembalikan bentuk yang tidak diminta — hashtag
 *    tanpa `#` baru saja membuktikannya.
 * 2. Kontras >= 4,5:1 terhadap putih. Aksen jadi LATAR chip berteks putih, jadi hex
 *    yang sah pun bisa tidak terbaca; pastel lolos pemeriksaan bentuk tapi gagal ini.
 * 3. Hue 180-265 (teal sampai indigo). Ini yang menjaga identitas brand: foto dan
 *    layout boleh beda tiap artikel, warnanya tetap satu keluarga supaya orang tahu
 *    itu postingan yang sama tanpa membaca nama.
 *
 * Gagal salah satu berarti jatuh ke biru brand — bukan terbit dengan chip yang tidak
 * terbaca atau warna yang tidak ada hubungannya dengan brand.
 */
const aksen = (() => {
  const v = String(copy.accent == null ? '' : copy.accent).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return AKSEN_CADANGAN;
  if (kontras(v, '#FFFFFF') < 4.5) return AKSEN_CADANGAN;
  const h = hue(v);
  return h >= 180 && h <= 265 ? v.toUpperCase() : AKSEN_CADANGAN;
})();

// ── layout: dipilih model dari daftar tertutup ──────────────────────────────────
// Tertutup, bukan bebas, karena tiap bentuk harus bisa dibuktikan tidak meluber.
const LAYOUT = ['blok-bawah', 'pias-bawah', 'tengah'];
const layout = LAYOUT.includes(copy.layout) ? copy.layout : LAYOUT[0];

/**
 * Foto tampil UTUH — opacity 1, dan tidak ada satu pun lapisan yang menutup seluruh
 * kanvas. Versi sebelumnya memasang foto di opacity .42 lalu menimpanya dengan veil
 * .62–.96 sekanvas; yang sampai ke mata tinggal 16% di ujung atas dan 1,7% di bawah,
 * jadi review film dan catatan teknis menghasilkan kotak hitam yang sama persis.
 *
 * Kontras sekarang dijaga LOKAL: hanya di belakang teks, lewat blok/panel/scrim
 * sesuai layout. Itu yang membuat foto tetap terbaca sekaligus teks tetap aman di
 * atas foto seterang apa pun.
 *
 * `.fotolayer` memotong lapisan foto, dan itu WAJIB: transform:scale tidak mengubah
 * layout tapi tetap menambah scrollable overflow, jadi zoom 1.12 pada foto setinggi
 * kanvas membuat render-svc mengukur 1431px dan membalas 422 overflow — di SETIAP
 * artikel, dan tidak pernah sembuh oleh loop penyusutan karena penyebabnya bukan teks.
 * Yang dipotong hanya lapisan fotonya; lapisan teks justru harus tetap boleh meluber
 * supaya aturan 11 masih bisa menangkap teks yang benar-benar kepanjangan.
 */
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;color:#F5F7FA;position:relative}
/* Pembungkus foto memotong dirinya sendiri — lihat catatan di atas blok CSS. */
.fotolayer{position:absolute;inset:0;overflow:hidden}
.bg{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover}
/* Tanpa raster: kartu warna solid dari aksen, bukan kanvas kosong. Begitu foto jadi
   bintangnya, kelima gambar yang gagal menghasilkan lubang — ini yang menutupnya
   dengan sesuatu yang terlihat seperti pilihan desain. */
.kartu{position:absolute;inset:0;background:linear-gradient(155deg,${aksen} 0%,#0B0F14 78%)}
/* Redup tipis sekanvas, cuma untuk menahan foto yang benar-benar putih. .22 masih
   menyisakan 78% foto — bandingkan dengan veil lama yang menyisakan 4–16%. */
.redup{position:absolute;inset:0;background:rgba(11,15,20,.22)}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:${px(72)}px ${px(64)}px}
/* Kepala duduk langsung di atas foto, jadi dia bawa scrim sendiri. */
.atas{display:flex;justify-content:space-between;align-items:center;font-size:${px(24)}px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.merek{display:flex;align-items:center;gap:${px(16)}px;background:rgba(11,15,20,.72);padding:${px(12)}px ${px(22)}px ${px(12)}px ${px(12)}px;border-radius:999px}
.logo{height:${px(46)}px;width:auto;display:block;flex:none}
.nomor{background:rgba(11,15,20,.72);padding:${px(12)}px ${px(20)}px;border-radius:999px;color:#C3CCD6;letter-spacing:.1em}
/* Zona teks. Sengaja TANPA overflow:hidden — teks yang meluber harus menambah
   scrollHeight supaya render-svc bisa membalas 422 aturan 11 dan loop ronde
   memperkecilnya. Ditutup di sini berarti teks terpotong diam-diam. */
.teks{padding:${px(48)}px ${px(44)}px}
.kicker{display:inline-block;background:${aksen};color:#fff;font-size:${px(23)}px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:${px(10)}px ${px(20)}px;border-radius:${px(6)}px;margin-bottom:${px(22)}px}
h1{font-size:${px(74)}px;line-height:1.08;font-weight:800;letter-spacing:-.02em;text-transform:uppercase}
h1.cta{font-size:${px(58)}px;text-transform:none}
p{font-size:${px(34)}px;line-height:1.42;color:#D7DEE6;margin-top:${px(22)}px}
/* blok-bawah: pola HEROID — foto utuh, teks di dalam blok pekat di bawah. */
.l-blok .wrap{justify-content:space-between}
.l-blok .teks{background:rgba(9,12,16,.9);border-radius:${px(20)}px;border-left:${px(10)}px solid ${aksen}}
/* pias-bawah: foto 58% atas, panel warna solid 42% bawah. */
.l-pias .bg{height:783px;bottom:auto}
.l-pias .kartu{height:783px;bottom:auto}
.l-pias .redup{height:783px;bottom:auto}
.l-pias body,.l-pias{background:#0B0F14}
.l-pias .teks{background:#0B0F14;border-top:${px(8)}px solid ${aksen};border-radius:0;padding-top:${px(40)}px}
/* tengah: judul di tengah, scrim gradien terbatas di zona teksnya saja. */
/* tengah: scrim harus BENAR-BENAR sampai transparan sebelum tepi kotaknya, kalau
   tidak yang terlihat kotak abu-abu bersudut, bukan bayangan lembut. Karena itu
   berhenti di 72% dengan padding lega — sisa 28% kotak murni transparan.
   Konsekuensinya bagian pinggir teks kehilangan sebagian kontras, jadi ditambal
   text-shadow: dua lapis pelindung, dan yang kedua tidak bergantung ukuran kotak. */
.l-tengah .wrap{justify-content:space-between}
.l-tengah .tengahkan{flex:1;display:flex;align-items:center}
.l-tengah .teks{background:radial-gradient(72% 54% at 50% 50%,rgba(9,12,16,.93) 0%,rgba(9,12,16,.74) 46%,rgba(9,12,16,0) 72%);text-align:center;padding:${px(104)}px ${px(72)}px}
.l-tengah .kicker{margin-left:auto;margin-right:auto}
.l-tengah h1,.l-tengah p{text-shadow:0 ${px(2)}px ${px(20)}px rgba(0,0,0,.9)}
`.trim();

/**
 * Chip kategori — tempat warna aksen hidup, dan satu-satunya bagian yang menyebut
 * topik artikel. Diambil dari tag pertama, bukan dari field baru ke model: tag-nya
 * sudah ada di brief, sudah ditulis manusia, dan tidak bisa mengarang.
 */
const KICKER = (() => {
  const t = String(brief.tags || '').split(',')[0].trim();
  return (t || 'Artikel').slice(0, 18);
})();

const KELAS = { 'blok-bawah': 'l-blok', 'pias-bawah': 'l-pias', tengah: 'l-tengah' };

const slides = meta.map((m, i) => {
  const akhir = i === meta.length - 1;
  // Slide terakhir memakai teks tetap; apa pun yang ditulis model untuk slide itu dibuang.
  const sumber = akhir ? CTA_AKHIR : m;

  const heading = maksKata(sumber.heading, Math.max(5, 8 - Math.floor(ronde / 2)));
  const body = maksKata(sumber.body, Math.max(10, 25 - ronde * 2));

  const teks =
    `<div class="teks">` +
    `<span class="kicker">${esc(akhir ? 'Baca selengkapnya' : KICKER)}</span>` +
    `<h1${akhir ? ' class="cta"' : ''}>${esc(heading)}</h1>` +
    `${body ? `<p>${esc(body)}</p>` : ''}` +
    `</div>`;

  return `<!doctype html>
<html lang="id" class="${KELAS[layout]}"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
${latar[i]
      ? `<div class="fotolayer"><img class="bg" style="object-position:${potong(i).pos};transform:scale(${potong(i).zoom})" src="${latar[i]}"></div>`
      : '<div class="kartu"></div>'}
${latar[i] ? '<div class="redup"></div>' : ''}
<div class="wrap">
  <div class="atas">
    <span class="merek"><img class="logo" src="${LOGO}" alt="">Daffathan Labs</span>
    <span class="nomor">${i + 1} / ${meta.length}</span>
  </div>
  ${layout === 'tengah' ? `<div class="tengahkan">${teks}</div>` : teks}
</div>
</body></html>`;
});

// Artikel tanpa gambar: latar Gemini slide 1 dipromosikan jadi gambar artikel.
// Dirender lanskap 1200x630 — satu ukuran yang melayani og:image dan gambar tunggal
// LinkedIn sekaligus. Nol teks, nol logo: ini gambar artikel, bukan slide.
// Kalau artikel sudah punya cover, `hero` tetap null dan tidak ada yang di-commit.
const hero = coverB64 || !adaRaster[0]
  ? null
  : `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{width:1200px;height:630px;overflow:hidden;background:#0B0F14}
img{width:1200px;height:630px;object-fit:cover;display:block}
</style></head><body><img src="data:image/jpeg;base64,${adaRaster[0]}"></body></html>`;

return [{
  json: {
    code: brief.code,
    folder: brief.folder,
    url_id: brief.url_id,
    url_en: brief.url_en,
    dilewat: brief.dilewat,
    gambar_gagal: gambarGagal,
    ronde: ronde + 1,
    hero,
    // Diteruskan supaya cabang commit balik tidak perlu membaca `Siapkan brief` lagi.
    repo: brief.repo,
    berkas_md: brief.berkas_md,
    linkedin_caption: copy.linkedin_caption,
    // Dipotong keras di kode, bukan cuma diminta di prompt: model rutin melewati
    // batas yang hanya disebut dalam instruksi.
    ig_caption: [copy.ig_caption, tagar(copy.hashtags)].filter(Boolean).join('\n\n'),
    // Tanpa hashtag: di Facebook hashtag tidak menambah jangkauan, cuma bikin
    // tulisannya terlihat seperti hasil bot.
    fb_caption: copy.fb_caption,
    slides,
  },
}];
