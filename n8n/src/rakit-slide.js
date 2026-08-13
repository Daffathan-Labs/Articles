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
// Base64 dibaca dari `json.b64`, BUKAN dari `binary.data.data`.
//
// Instance ini menyimpan binary di filesystem, jadi `binary.data.data` berisi string
// literal "filesystem-v2" dan berkas aslinya cuma ditunjuk `binary.data.id`. Dipasang
// ke <img src="data:…;base64,filesystem-v2">, yang keluar ikon gambar rusak — di
// setiap slide, tanpa satu pun error. Node `Slide base64`/`Cover base64` yang membaca
// berkasnya dari disk. Yang masih boleh diambil dari `binary` cuma metadata seperti
// mimeType; nilainya utuh, yang jadi rujukan hanya `.data`.
const jpeg = $('Slide base64').all();

if (jpeg.length !== meta.length) {
  throw new Error(
    `Slide masuk ${jpeg.length} tapi metadata ${meta.length}. Pasangan per-indeks ` +
      'tidak bisa dipercaya — kemungkinan Gemini gambar men-drop item.'
  );
}

// Raster per slide. Slide yang gambarnya gagal tetap punya item di sini, isinya null —
// itu yang menjaga slide ke-4 tidak memakai gambar milik slide ke-1.
const raster = jpeg.map((it) => (it.json && it.json.b64) || null);
const adaRaster = raster.filter(Boolean);
// Nol gambar bukan kegagalan yang menahan pipeline: slide tanpa raster jatuh ke kartu
// warna, bukan ke gambar milik slide lain.
const gambarGagal = raster.filter((r) => !r).length;

// Gambar artikel, kalau ada. `Ambil cover` memakai onError:continueRegularOutput,
// jadi artikel tanpa gambar dan unduhan yang gagal sama-sama berakhir null di sini —
// dan dua-duanya memang ditangani sama: pakai gambar Gemini.
const unduhan = $('Cover base64').first().json || {};
const coverB64 = unduhan.b64 || null;
// Mime dibaca dari unduhan, bukan diasumsikan: API menyajikan cover sebagai WebP,
// dan menuliskannya sebagai image/jpeg bikin Chromium menolak merender gambarnya.
const coverMime = unduhan.mime || 'image/jpeg';

/**
 * SATU ATURAN: sebuah slide cuma boleh memakai gambarnya sendiri.
 *
 * Tidak ada slide yang meminjam gambar slide lain, dan foto artikel berhenti di slide 1.
 * Sebelumnya ada dua jalur pengulangan — slide gagal meminjam raster tetangga, lalu
 * kalau semua gagal kelimanya jatuh ke foto artikel dengan crop berbeda. Hasilnya satu
 * foto yang sama di lima slide, dan crop yang digeser tidak menyamarkan apa pun.
 *
 * Foto artikel tetap memegang slide 1 karena dia satu-satunya gambar yang benar-benar
 * menampilkan subjeknya: model gambar menolak menggambar karakter berhak cipta dan
 * wajah orang nyata, jadi "Spider-Man" atau "Sadie Sink" tidak akan pernah keluar dari
 * Gemini. Slide 2+ punya teksnya sendiri, jadi gambarnya dibuat dari teks itu.
 *
 * Slide tanpa gambar jatuh ke kartu berpola di bawah — bukan lubang, dan bukan foto
 * ulangan. Itu satu-satunya bentuk yang bikin lima slide mustahil terlihat sama.
 */
const latar = raster.map((b64, i) =>
  i === 0 && coverB64
    ? `data:${coverMime};base64,${coverB64}`
    : b64 ? `data:image/jpeg;base64,${b64}` : null
);

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
 * Buang penekanan markdown.
 *
 * Model rutin menulis `*cameo*`, `*time skip*`, `**penting**`. Tidak satu pun tempat
 * tujuannya merender markdown: slide itu GAMBAR, dan caption Instagram/Facebook/LinkedIn
 * menampilkan teks apa adanya. Jadi yang terbaca justru bintangnya. Sudah terbit sekali
 * di render Spider-Man — tiga slide sekaligus.
 *
 * Garis bawah sengaja TIDAK ikut dibuang: `snake_case` itu hal biasa di artikel teknis,
 * dan merusaknya lebih mahal daripada membiarkan satu italic gaya `_begini_` lolos.
 */
const polos = (s) => String(s == null ? '' : s).replace(/\*+/g, '').replace(/`/g, '');

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
/*
 * Still film DIPAKSA ke `pias-bawah`, apa pun yang dipilih model.
 *
 * Backdrop TMDB semuanya 16:9; kanvas slide 4:5. Di `blok-bawah` dan `tengah` foto mengisi
 * 1080x1350, jadi `object-fit: cover` membuang 55% lebarnya dan subjeknya gampang
 * kepotong keluar frame — merusak satu-satunya alasan memakai foto asli. `pias-bawah`
 * memberi foto area 1080x783 dan cuma membuang 22%.
 *
 * Artikel non-film tetap bebas memilih ketiganya: gambar Gemini digenerate langsung di
 * rasio kanvas, jadi tidak ada yang dibuang.
 */
const adaFotoAsli = meta.some((m) => m.pakai_foto);
const layout = adaFotoAsli
  ? 'pias-bawah'
  : LAYOUT.includes(copy.layout) ? copy.layout : LAYOUT[0];

/**
 * Tinggi pias = 1080 / (16/9). Backdrop TMDB semuanya 16:9 — diverifikasi, 85 backdrop
 * Brand New Day rasionya 1,775-1,784 tanpa kecuali — jadi di kotak setinggi ini sebuah
 * still masuk PERSIS, tanpa satu piksel pun dibuang.
 *
 * Itu yang membedakannya dari versi sebelumnya: kotaknya dulu 783px, jadi `cover`
 * membesarkan still sampai lebarnya 1391px dan membuang 22% sisi kiri-kanan. Yang
 * terlihat: orang yang dagunya berhenti di garis panel teks.
 */
const PIAS = 608;

/**
 * Kotak untuk foto PEMAIN, yang bentuknya potret 2:3 — arah yang berlawanan dengan still.
 *
 * Potret 2:3 tidak akan pernah memenuhi kotak selebar 1080 tanpa dipotong: untuk selebar
 * itu tingginya harus 1620px, lebih tinggi dari kanvasnya sendiri. Jadi pilihannya cuma
 * dua, dan dua-dua-nya dirender lalu dilihat sebelum dipilih: dipotong jadi bujur sangkar
 * (ubun-ubunnya hilang) atau kotaknya ditinggikan sampai potretnya besar. Yang kedua yang
 * dipakai — 780px membuat potretnya 520px, bukan 405px, dan tidak ada satu piksel pun
 * yang dibuang.
 *
 * 780, bukan lebih: sisa 570px untuk panel teks, sedikit lebih lega dari 567px yang sudah
 * terbukti muat di desain sebelumnya. Sempat dicoba 800 dan render-svc membalas 422
 * "konten 1352px melebihi kanvas 1350px" — meleset dua piksel, tapi cukup untuk memicu
 * ronde penyusutan teks di SETIAP slide potret.
 */
const PIAS_POTRET = 780;

/**
 * Campur dua warna. `t` = porsi warna kedua.
 *
 * Ada karena panelnya dulu hitam rata (#0B0F14) di SEMUA artikel: aksen cuma muncul di
 * chip kecil, jadi review film dan catatan teknis sama-sama keluar sebagai kotak hitam
 * bertulisan putih. Sekarang aksen ikut menginti panel, blok, dan pias di belakang foto.
 * Dicampur ke arah hitam, bukan dipakai mentah: porsinya dipatok maksimal .40 supaya
 * kontras teks putih tidak pernah turun di bawah 8:1 — dijaga test, bukan dikira-kira.
 */
const GELAP = '#0B0F14';
const campur = (a, b, t) => {
  const n = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(n(a, i) * (1 - t) + n(b, i) * t).toString(16).padStart(2, '0'))
      .join('')
  );
};
const tinta = (t) => campur(GELAP, aksen, t);

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
/* Tanpa gambar: kartu aksen, bukan kanvas kosong dan bukan foto slide lain.
   EMPAT pola, dipilih dari nomor slide. Satu gradien yang sama di empat slide cuma
   memindahkan keluhan "gambarnya sama semua" dari foto ke latar belakang. */
.kartu{position:absolute;inset:0;background:#0B0F14}
.k0{background:linear-gradient(155deg,${aksen} 0%,#0B0F14 72%)}
.k1{background:radial-gradient(88% 68% at 82% 16%,${aksen} 0%,#0B0F14 66%)}
.k2{background:linear-gradient(200deg,#0B0F14 34%,${aksen} 100%)}
.k3{background:repeating-linear-gradient(45deg,${aksen}66 0 ${px(4)}px,rgba(0,0,0,0) ${px(4)}px ${px(30)}px),linear-gradient(160deg,#131A22 0%,#0B0F14 100%)}
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
/* blok-bawah: pola HEROID — foto utuh, teks di dalam blok pekat di bawah. Bloknya
   berinti aksen, bukan hitam: ini satu dari tiga tempat warna artikel benar-benar
   terlihat. F0 = 94% — cukup pekat untuk duduk di atas foto seterang apa pun. */
.l-blok .wrap{justify-content:space-between}
.l-blok .teks{background:linear-gradient(155deg,${tinta(0.36)}F0 0%,${tinta(0.1)}F0 100%);border-radius:${px(20)}px;border-left:${px(10)}px solid ${aksen}}
/* pias-bawah: foto UTUH di kotak 16:9 atas, panel bertinta aksen di bawah.
   object-fit contain, bukan cover — inilah bedanya. cover mengisi kotak dengan cara
   membuang bagian foto yang tidak muat, dan yang dibuang selalu tepi: kepala, bahu,
   tangan yang sedang menembakkan jaring. contain memuat SELURUH foto lalu menyisakan
   ruang; ruang sisa itu diisi gradien aksen di .fotolayer, bukan hitam. Untuk still
   16:9 tidak ada ruang sisa sama sekali — pas persis. */
.l-pias .fotolayer{height:${PIAS}px;bottom:auto;background:linear-gradient(200deg,${tinta(0.4)} 0%,${tinta(0.12)} 100%);box-shadow:inset 0 -${px(8)}px 0 ${aksen}}
.l-pias .bg{height:${PIAS}px;object-fit:contain}
.l-pias .kartu{height:${PIAS}px;bottom:auto}
/* Teks pias tidak pernah berdiri di atas foto, jadi redup sekanvas cuma memudarkan
   fotonya tanpa menjaga apa pun. */
.l-pias .redup{display:none}
/* Panel dipasang di body supaya warnanya menyambung dari tepi foto sampai dasar
   kanvas tanpa sambungan yang terlihat. 45% ≈ tepi bawah foto. */
.l-pias body{background:linear-gradient(180deg,${tinta(0.34)} 45%,${tinta(0.06)} 100%)}
/* Mulai dari transparan: pelindung teks yang menambah kontras di bagian bawah panel
   tanpa memunculkan kotak bersudut di atas gradien body. */
.l-pias .teks{background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.3) 100%);border-radius:0;padding-top:${px(40)}px}
/* Teks duduk TEPAT di bawah foto, bukan di dasar kanvas.
   .wrap memakai space-between, jadi .teks dulu terlempar ke bawah dan menyisakan
   lubang 228px antara tepi foto dan chip kategori — persis "whitespace kejauhan".
   Diperbaiki dengan menaikkan padding-atas .wrap setinggi kotak foto, bukan dengan
   memosisikan .teks secara absolut: .teks HARUS tetap di aliran normal supaya teks
   yang meluber tetap menambah scrollHeight dan render-svc masih bisa membalas 422.
   Kepala dipindah ke absolut — dia memang cuma melayang di atas foto. */
.l-pias .wrap{justify-content:flex-start;padding-top:${PIAS + px(36)}px}
.l-pias.potret .wrap{padding-top:${PIAS_POTRET + px(36)}px}
.l-pias .atas{position:absolute;top:${px(72)}px;left:${px(64)}px;right:${px(64)}px}
/* Slide berfoto PEMAIN: kotaknya ditinggikan karena potret 2:3 arahnya berlawanan
   dengan still 16:9 — alasan lengkapnya di atas PIAS_POTRET. Kelasnya menempel di
   <html> yang sama dengan .l-pias, jadi tanpa spasi. */
.l-pias.potret .fotolayer{height:${PIAS_POTRET}px}
.l-pias.potret .bg{height:${PIAS_POTRET}px}
/* tengah: judul di tengah, scrim gradien terbatas di zona teksnya saja. */
/* tengah: scrim harus BENAR-BENAR sampai transparan sebelum tepi kotaknya, kalau
   tidak yang terlihat kotak abu-abu bersudut, bukan bayangan lembut. Karena itu
   berhenti di 72% dengan padding lega — sisa 28% kotak murni transparan.
   Konsekuensinya bagian pinggir teks kehilangan sebagian kontras, jadi ditambal
   text-shadow: dua lapis pelindung, dan yang kedua tidak bergantung ukuran kotak. */
.l-tengah .wrap{justify-content:space-between}
.l-tengah .tengahkan{flex:1;display:flex;align-items:center}
.l-tengah .teks{background:radial-gradient(72% 54% at 50% 50%,${tinta(0.28)}ED 0%,${tinta(0.16)}BD 46%,${tinta(0.1)}00 72%);text-align:center;padding:${px(104)}px ${px(72)}px}
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

  const heading = maksKata(polos(sumber.heading), Math.max(5, 8 - Math.floor(ronde / 2)));
  const body = maksKata(polos(sumber.body), Math.max(10, 25 - ronde * 2));

  const teks =
    `<div class="teks">` +
    `<span class="kicker">${esc(akhir ? 'Baca selengkapnya' : KICKER)}</span>` +
    `<h1${akhir ? ' class="cta"' : ''}>${esc(heading)}</h1>` +
    `${body ? `<p>${esc(body)}</p>` : ''}` +
    `</div>`;

  return `<!doctype html>
<html lang="id" class="${KELAS[layout]}${m.foto_potret ? ' potret' : ''}"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
${latar[i]
      // Titik fokus cuma berpengaruh di layout yang memotong (blok-bawah, tengah).
      // Foto artikel di slide 1 diturunkan sedikit: subjek foto banner hampir selalu
      // duduk di atas tengah, dan blok teks memakan sepertiga bawah. Di pias-bawah
      // fotonya `contain`, tidak ada yang dipotong, jadi nilai ini tidak dipakai.
      ? `<div class="fotolayer"><img class="bg" style="object-position:${i === 0 && coverB64 ? '50% 30%' : '50% 50%'}" src="${latar[i]}"></div>`
      : `<div class="kartu k${i % 4}"></div>`}
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
    linkedin_caption: polos(copy.linkedin_caption),
    // Dipotong keras di kode, bukan cuma diminta di prompt: model rutin melewati
    // batas yang hanya disebut dalam instruksi.
    ig_caption: [polos(copy.ig_caption), tagar(copy.hashtags)].filter(Boolean).join('\n\n'),
    // Tanpa hashtag: di Facebook hashtag tidak menambah jangkauan, cuma bikin
    // tulisannya terlihat seperti hasil bot.
    fb_caption: polos(copy.fb_caption),
    slides,
  },
}];
