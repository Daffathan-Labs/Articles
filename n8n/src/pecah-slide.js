// Fan-out satu item per slide. Node `Gemini gambar` memproses satu item per
// panggilan, jadi ini yang membuat carousel 5 slide menghasilkan 5 gambar;
// `Rakit slide` menggabungnya kembali jadi satu item.
const brief = $('Siapkan brief').first().json;
// Dibaca lewat nama node, bukan $input: node-node TMDB menyisip di antara `Gemini copy`
// dan node ini, jadi $input sudah bukan keluaran copy lagi.
const c = $('Gemini copy').first().json.output;

if (!c || !Array.isArray(c.slides) || !c.slides.length) {
  throw new Error(
    'Gemini copy tidak mengembalikan slides[]. Ini beda dari "model menolak": ' +
      `output yang diterima = ${JSON.stringify(c).slice(0, 300)}`
  );
}

// Rentang aman IG carousel adalah 2-10 item. Prompt meminta 5; potong di 10 kalau
// model kebablasan, dan gagal keras kalau cuma 1 supaya tidak diam-diam jadi post biasa.
const slides = c.slides.slice(0, 10);
if (slides.length < 2) {
  throw new Error(`Cuma ${slides.length} slide — IG carousel butuh minimal 2.`);
}

// Sufiks dikunci di kode, bukan di prompt: ini syarat teknis yang tidak boleh
// dinegosiasikan model. Semua teks hidup di HTML, nol di raster.
// Arah cahaya/warna datang dari model per artikel, bukan dipatok di sini. Dulu baris
// ini memaksa "muted desaturated palette, dark moody background" ke SEMUA artikel, dan
// itu yang bikin review film dan catatan teknis menghasilkan foto yang sama gelapnya.
//
// Yang tetap dikunci di kode cuma dua, karena keduanya syarat teknis yang tidak boleh
// dinegosiasikan model: nol teks di raster, dan ruang lapang di zona teks.
const RUANG = {
  'blok-bawah': 'Leave the lower third visually calm and uncluttered.',
  'pias-bawah': 'Keep the main subject in the upper half of the frame.',
  tengah: 'Leave the centre of the frame open and uncluttered.',
};
const mood = String(c.image_mood || '').trim();
const SUFIKS =
  `Photographic, shallow depth of field.${mood ? ` ${mood}.` : ''} ` +
  `${RUANG[c.layout] || RUANG['blok-bawah']} ` +
  'Absolutely no text, letters, numbers, watermarks, logos or user interface anywhere.';

/**
 * Kolam foto ASLI untuk artikel film.
 *
 * Model gambar menolak menggambar karakter berhak cipta dan wajah orang nyata, jadi
 * Spider-Man dan Sadie Sink tidak akan pernah keluar dari Gemini. Kalau artikelnya ulasan
 * film, fotonya diambil dari still resmi filmnya; artikel lain tetap digenerate.
 *
 * Diurutkan `vote_average` menurun lalu diambil SELANG, bukan lima teratas berurutan:
 * puluhan backdrop dari satu film hampir selalu memuat beberapa frame dari adegan yang
 * sama, dan lima teratas gampang jadi lima potongan adegan yang itu-itu juga — persis
 * keluhan yang baru saja ditutup.
 *
 * Poster sengaja tidak dipakai sama sekali: poster memuat judul, nama pemain, dan blok
 * kredit, dan seluruh desain ini berdiri di atas aturan sebaliknya — semua kata hidup di
 * HTML, nol di raster.
 */
const LANGKAH = 3;
const ambilSelang = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length && out.length < n; i += LANGKAH) out.push(arr[i]);
  // Selangnya kehabisan sebelum kuota penuh: sisanya diambil berurutan dari yang belum
  // terpakai. Satu frame yang mirip masih lebih baik daripada satu slide tanpa foto.
  for (let i = 0; i < arr.length && out.length < n; i += 1) {
    if (!out.includes(arr[i])) out.push(arr[i]);
  }
  return out;
};

const still = $('Still film').first().json;
const backdrops = Array.isArray(still && still.backdrops) ? still.backdrops : [];
const dariTmdb = ambilSelang(
  backdrops.slice().sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)),
  slides.length
).map((b) => `https://image.tmdb.org/t/p/w1280${b.file_path}`);

// Disisipkan build.mjs: ekspresi asli kalau GOOGLE_AKTIF, `[]` kalau tidak. Node yang
// tidak dipasang tidak bisa dirujuk `$('...')` — ekspresinya melempar, bukan mengembalikan
// undefined. Pola yang sama dipakai untuk {{LOGO}}.
const dariGoogle = {{GOOGLE}};

const kolam = dariTmdb.length ? dariTmdb : dariGoogle;

/**
 * Slide yang menyebut seorang pemain memakai foto ORANGNYA, bukan still acak.
 *
 * Backdrop tidak membawa keterangan isinya, jadi still untuk slide "Sadie Sink sebagai
 * Jean Grey" bisa saja adegan Punisher — itu benar-benar keluar di render uji. TMDB
 * membawa nama asli DAN nama karakter tiap pemain, jadi teks slide bisa dicocokkan ke
 * dua-duanya. "Sadie Sink sebagai Jean Grey" kena lewat nama sekaligus karakter.
 *
 * Cuma 20 nama teratas: di bawah itu isinya pemeran figuran yang namanya justru bikin
 * cocok palsu. Minimal 4 huruf dan harus utuh sebagai kata — tanpa itu "MJ" dan "Ned"
 * kena di kata lain, dan yang tampil malah foto orang yang tidak dibahas.
 */
const cast = (($('Pemain film').first().json || {}).cast || [])
  .slice(0, 20)
  .flatMap((p) =>
    // Karakter TMDB sering ditulis "Frank Castle / Punisher" atau "Peter Parker /
    // Spider-Man". Dicocokkan utuh, tidak akan pernah kena — teks slide menyebut salah
    // satunya saja.
    [p.name, ...String(p.character || '').split('/')]
      .filter((n) => typeof n === 'string' && n.trim().length >= 4)
      .map((n) => ({ nama: n.trim(), foto: p.profile_path }))
  )
  .filter((x) => x.foto)
  // Nama terpanjang diperiksa duluan: "Jean Grey" harus menang atas "Jean" kalau
  // dua-duanya ada di daftar.
  .sort((a, b) => b.nama.length - a.nama.length);

const lolosRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cariOrang = (teks) => {
  const t = String(teks || '');
  for (const c of cast) {
    if (new RegExp(`\\b${lolosRegex(c.nama)}\\b`, 'i').test(t)) return c.foto;
  }
  return null;
};

const CADANGAN = {
  konseptual: 'An abstract minimal still life suggesting an idea taking shape',
  tekstur: 'An extreme close-up of a raw material surface',
  dokumenter: 'A candid over-the-shoulder shot of someone working at a desk',
  tempat: 'A quiet architectural interior with strong directional light',
  properti: 'A single everyday object isolated on a plain surface',
};

return slides.map((s, i) => {
  const mode = CADANGAN[s.image_mode] ? s.image_mode : 'konseptual';
  const inti = String(s.image_prompt || '').trim() || CADANGAN[mode];
  // Slide 2+ diikat ke seri yang sama supaya carousel-nya tidak terbaca sebagai lima
  // gambar acak yang kebetulan bersebelahan. Yang diikat cuma cahaya dan warnanya —
  // dulu baris ini juga mengunci "same location", dan hasilnya lima frame yang nyaris
  // sama persis. Tiap slide punya teksnya sendiri, jadi adegannya harus ikut berbeda.
  const lanjutan = i === 0
    ? ''
    : ' Same visual series, same lighting and colour treatment as the other images in ' +
      'this set, but a clearly different scene, subject and camera angle.';

  // Slide 1 selalu foto artikel, jadi mencocokkan pemain di situ cuma membuang satu
  // nama dari kolam tanpa ada yang melihatnya.
  const orang = i === 0 ? null : cariOrang(`${s.heading || ''} ${s.body || ''}`);

  return {
    json: {
      code: brief.code,
      idx: i,
      total: slides.length,
      name: String(i + 1).padStart(2, '0'),
      heading: String(s.heading || '').trim(),
      body: String(s.body || '').trim(),
      image_prompt: `${c.image_series || ''} ${inti}.${lanjutan} ${SUFIKS}`.trim(),
      // Nilainya SAMA di kelima item. Gerbang `Ada foto asli?` dievaluasi per item, jadi
      // bendera yang berbeda antar item bakal membelah kelimanya ke dua cabang dan
      // menghancurkan pasangan indeks slide↔gambar.
      pakai_foto: kolam.length > 0,
      // Slide yang kehabisan kolam dapat null: node `Ambil foto` gagal untuk item itu,
      // dan slide-nya jatuh ke kartu berpola. Bukan foto slide lain.
      foto_url: orang ? `https://image.tmdb.org/t/p/w780${orang}` : kolam[i] || null,
      // Foto orang itu potret 2:3; dipasang di tengah, wajahnya kepotong. Titik fokusnya
      // dinaikkan supaya kepala tetap masuk frame. Still 16:9 tidak perlu digeser.
      foto_fokus: orang ? '50% 18%' : '50% 50%',
    },
  };
});
