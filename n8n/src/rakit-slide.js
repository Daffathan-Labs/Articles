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
const jpeg = $('Jadi JPEG').all();

if (jpeg.length !== meta.length) {
  throw new Error(
    `Slide masuk ${jpeg.length} tapi metadata ${meta.length}. Pasangan per-indeks ` +
      'tidak bisa dipercaya — kemungkinan Gemini gambar men-drop item.'
  );
}

// Raster per slide. Node gambar memakai onError:continueRegularOutput, jadi slide
// yang gagal tetap mengirim item tapi tanpa binary.
const raster = jpeg.map((it) => (it.binary && it.binary.data && it.binary.data.data) || null);
const adaRaster = raster.filter(Boolean);
// Nol gambar tidak dianggap kegagalan: latar cuma dekorasi di balik veil gelap,
// dan slide tanpa latar tetap terbaca penuh. Lebih baik terbit polos daripada
// menahan seluruh pipeline karena hiasan.
const gambarGagal = raster.filter((r) => !r).length;
// Slide yang gagal meminjam raster tetangga — satu latar berulang jauh lebih baik
// daripada satu slide kosong di tengah carousel.
const bg = raster.map((r) => r || adaRaster[0] || null);

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

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;color:#F5F7FA;position:relative}
.bg{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;opacity:.42}
/* Ujung atas dipertebal dari .50: kicker dan penomoran duduk di sana, dan foto
   latar yang kebetulan terang bisa menelannya. Satu angka, tanpa logika per-slide. */
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,15,20,.62) 0%,rgba(11,15,20,.82) 52%,rgba(11,15,20,.96) 100%)}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:${px(92)}px ${px(84)}px}
.atas{display:flex;justify-content:space-between;align-items:baseline;font-size:${px(25)}px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#5EC8FF}
.atas .nomor{color:#8A97A6;letter-spacing:.1em}
h1{font-size:${px(78)}px;line-height:1.07;font-weight:800;letter-spacing:-.02em}
h1.cta{font-size:${px(62)}px}
p{font-size:${px(36)}px;line-height:1.44;font-weight:400;color:#C3CCD6;margin-top:${px(26)}px}
/* Baris bawah hanya logo. URL per-slide dibuang: di Instagram tidak bisa diklik,
   dan yang panjang justru terpotong elipsis seperti di render pertama. */
.foot{display:flex;justify-content:flex-end;align-items:flex-end}
.logo{height:${px(112)}px;width:auto;flex:none}
`.trim();

const slides = meta.map((m, i) => {
  const akhir = i === meta.length - 1;
  // Slide terakhir memakai teks tetap; apa pun yang ditulis model untuk slide itu dibuang.
  const sumber = akhir ? CTA_AKHIR : m;

  const heading = maksKata(sumber.heading, Math.max(5, 8 - Math.floor(ronde / 2)));
  const body = maksKata(sumber.body, Math.max(10, 25 - ronde * 2));

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
${bg[i] ? `<img class="bg" src="data:image/jpeg;base64,${bg[i]}">` : ''}
<div class="veil"></div>
<div class="wrap">
  <div class="atas"><span>Daffathan Labs</span><span class="nomor">${i + 1} / ${meta.length}</span></div>
  <div>
    <h1${akhir ? ' class="cta"' : ''}>${esc(heading)}</h1>
    ${body ? `<p>${esc(body)}</p>` : ''}
  </div>
  <div class="foot"><img class="logo" src="${LOGO}" alt=""></div>
</div>
</body></html>`;
});

return [{
  json: {
    code: brief.code,
    folder: brief.folder,
    url_id: brief.url_id,
    url_en: brief.url_en,
    dilewat: brief.dilewat,
    gambar_gagal: gambarGagal,
    ronde: ronde + 1,
    linkedin_caption: copy.linkedin_caption,
    // Dipotong keras di kode, bukan cuma diminta di prompt: model rutin melewati
    // batas yang hanya disebut dalam instruksi.
    ig_caption: [copy.ig_caption, (copy.hashtags || []).slice(0, 5).join(' ')]
      .filter(Boolean)
      .join('\n\n'),
    slides,
  },
}];
