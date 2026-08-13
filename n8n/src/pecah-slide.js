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
 * Penyaringan dan pengurutannya hidup di `Siapkan kandidat`, bukan di sini — node itu
 * yang harus mengunduh gambarnya untuk diperiksa, jadi dia juga yang memilih. Di sini
 * tinggal membagikannya ke slide.
 */
const kandidat = $('Siapkan kandidat').first().json;
const kolam = Array.isArray(kandidat && kandidat.url) ? kandidat.url : [];

/**
 * Keterangan isi tiap still, dibaca dari gambarnya sendiri oleh `Terangkan still`.
 *
 * Ini yang menutup lubang terakhir: backdrop TMDB tidak membawa keterangan siapa yang ada
 * di dalamnya, jadi slide "Sadie Sink sebagai Jean Grey" pernah dapat adegan Punisher,
 * lalu setelah ditambal daftar pemain dia dapat potret publisitas — bukan adegan filmnya.
 * Padahal still-nya ada di kolam.
 *
 * Balasan model tidak dipercaya mentah-mentah: dia rutin membungkus JSON dengan pagar
 * ```json, dan satu balasan aneh tidak boleh mematikan carousel. Gagal parse = tidak ada
 * keterangan = pembagian jatuh balik ke urutan kolam, persis perilaku sebelum ini ada.
 */
const bacaKeterangan = () => {
  try {
    const teks = ($('Terangkan still').first().json.candidates || [])[0].content.parts
      .map((p) => p.text || '')
      .join('');
    const kurung = teks.slice(teks.indexOf('['), teks.lastIndexOf(']') + 1);
    const arr = JSON.parse(kurung);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
};
// `i` dari model 1-based; disimpan per indeks kolam supaya pasangannya tidak bergeser
// kalau model melewatkan satu nomor atau menukar urutan entri — dua-duanya biasa.
const keterangan = [];
const buang = new Set();
for (const k of bacaKeterangan()) {
  const i = Number(k && k.i) - 1;
  if (i >= 0 && i < kolam.length) {
    // Still yang adegannya sama dengan sampul artikel dibuang dari kolam sama sekali,
    // bukan sekadar diberi nilai rendah. Slide 1 SELALU memakai sampul, jadi kembarannya
    // di slide mana pun terbaca sebagai satu gambar yang diulang — persis keluhan yang
    // menutup dua desain lalu. Berkasnya memang beda, tapi yang menilai mata.
    if (k.sama_sampul === true) buang.add(i);
    keterangan[i] = {
      tokoh: (Array.isArray(k.tokoh) ? k.tokoh : []).filter((n) => typeof n === 'string'),
      utama: typeof k.utama === 'string' ? k.utama : '',
      wajah: k.wajah === true,
    };
  }
}

/**
 * Nama yang boleh dipakai mencocokkan slide ke foto.
 *
 * Minimal 4 huruf dan harus utuh sebagai kata — tanpa itu "MJ" kena di kata lain dan
 * "Grey" kena di "greyscale", dan yang tampil malah orang yang tidak dibahas di slide itu.
 * Karakter TMDB sering ditulis "Frank Castle / Punisher", jadi dipecah di `/`: dicocokkan
 * utuh dia tidak akan pernah kena, karena teks slide menyebut salah satunya saja.
 *
 * Cuma 20 nama teratas: di bawah itu isinya figuran yang namanya justru bikin cocok palsu.
 */
const cast = (($('Pemain film').first().json || {}).cast || [])
  .slice(0, 20)
  .flatMap((p) =>
    [p.name, ...String(p.character || '').split('/')]
      .filter((n) => typeof n === 'string' && n.trim().length >= 4)
      .map((n) => ({ nama: n.trim(), foto: p.profile_path }))
  )
  // Nama terpanjang diperiksa duluan: "Jean Grey" harus menang atas "Jean" kalau
  // dua-duanya ada di daftar.
  .sort((a, b) => b.nama.length - a.nama.length);

const lolosRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sebut = (teks, nama) => new RegExp(`\\b${lolosRegex(nama)}\\b`, 'i').test(String(teks || ''));
/** Nama-nama dari daftar pemain yang disebut di sebuah teks. */
const namaDi = (teks) => cast.filter((c) => sebut(teks, c.nama)).map((c) => c.nama);

/**
 * Bagikan kolam ke slide: yang cocok isinya duluan, sisanya berurutan.
 *
 * Slide 1 sengaja dilewati pencocokan — dia selalu ditimpa foto artikel di `Rakit slide`,
 * jadi memberinya still yang cocok cuma membuang satu still dari kolam tanpa ada yang
 * melihatnya.
 */
// Slide TERAKHIR ikut dilewati, dengan alasan yang sama: teksnya juga dibuang, diganti
// ajakan tetap "Artikel lengkapnya di link bio". Mencocokkan fotonya ke teks yang tidak
// pernah terbit itu mencocokkan ke sesuatu yang tidak ada — dan sekali jalan hasilnya
// potret publisitas Tom Holland sebesar layar di bawah kalimat ajakan.
const namaSlide = slides.map((s, i) =>
  i === 0 || i === slides.length - 1 ? [] : namaDi(`${s.heading || ''} ${s.body || ''}`)
);

/**
 * Nilai sebuah still untuk sebuah slide. Yang pertama cocok BUKAN yang terbaik.
 *
 * Render uji membuktikannya: slide "Sadie Sink sebagai Jean Grey" dapat sosok bertudung
 * yang wajahnya gelap total, cuma karena still itu lebih dulu di kolam daripada adegan
 * yang benar-benar memperlihatkan wajahnya. Modelnya tidak salah — dia memang ada di
 * frame — tapi "ada di frame" dan "kelihatan siapa" itu dua hal berbeda.
 *
 *   3 = subjek utama frame DAN wajahnya kelihatan
 *   2 = subjek utama frame
 *   1 = ada di frame
 */
const nilaiStill = (k, nama) => {
  const ket = keterangan[k];
  if (!ket || buang.has(k)) return 0;
  const kena = (t) => nama.some((n) => sebut(t, n) || sebut(n, t));
  if (ket.utama && kena(ket.utama)) return ket.wajah ? 3 : 2;
  return ket.tokoh.some(kena) ? 1 : 0;
};

/**
 * Foto yang dipilih TANGAN, per artikel. Kuncinya KATA yang disebut slide, bukan nomornya.
 *
 * Ada karena pencocokan otomatis punya satu batas yang tidak bisa ditutup dengan aturan:
 * slide "Dinamika Peter dan MJ" di Brand New Day jatuh ke Spider-Man di atas tank karena
 * `MJ` cuma DUA huruf, dan daftar nama sengaja membuang nama di bawah empat huruf — tanpa
 * batas itu "MJ" dan "Grey" kena di kata lain dan yang tampil justru orang yang tidak
 * dibahas. Menurunkan batasnya menutup kasus ini tapi menggeser foto di slide lain yang
 * sudah benar, jadi yang dipakai daftar ini.
 *
 * Kuncinya KATA, dan itu bukan detail: nomor slide sempat dipakai dan langsung meleset —
 * model menulis ulang topik tiap eksekusi, jadi "slide 4" satu kali berarti MJ dan
 * berikutnya berarti Sadie Sink, dan foto MJ menempel di slide Sadie. Kata yang disebut
 * slide ikut pindah bersama topiknya; nomor slide tidak.
 *
 * Cuma berlaku untuk folder yang namanya disebut, dan satu URL cuma dipakai sekali.
 */
const PILIHAN = {
  'review-spiderman-brand-new-day-2026': [
    // Slide tentang MJ harus menampilkan mereka berdua berhadapan, bukan Spider-Man
    // sendirian. w1280 seperti kolam, bukan `original` — kotaknya cuma 1080 lebar, jadi
    // yang lebih besar cuma menambah berat tanpa menambah satu piksel yang terlihat.
    { sebut: 'MJ', url: 'https://image.tmdb.org/t/p/w1280/2Es8HvjgIoNxYbsQnVa8OJVz2Wk.jpg' },
  ],
};

// Slide 1 dilewati: dia selalu ditimpa sampul artikel di `Rakit slide`, jadi mengunci foto
// di situ cuma membuang satu gambar dari kolam tanpa ada yang melihatnya.
const sudah = new Set();
const pilihanSlide = slides.map((s, i) => {
  if (i === 0 || i === slides.length - 1) return null;
  const teks = `${s.heading || ''} ${s.body || ''}`;
  const p = (PILIHAN[brief.folder] || []).find(
    (x) => !sudah.has(x.url) && sebut(teks, x.sebut)
  );
  if (!p) return null;
  sudah.add(p.url);
  return p.url;
});

const dipakai = new Set();
// Foto pilihan dikunci lebih dulu: kalau tidak, slide lain bisa mengambilnya dari kolam
// lewat pengisian berurutan dan yang terbit jadi satu gambar yang sama di dua slide.
kolam.forEach((u, k) => {
  if (pilihanSlide.indexOf(u) >= 0) dipakai.add(k);
});

const jatah = slides.map((s, i) => {
  if (pilihanSlide[i]) return pilihanSlide[i];
  if (!namaSlide[i].length) return null;
  let terbaik = -1;
  let nilaiTerbaik = 0;
  for (let k = 0; k < kolam.length; k += 1) {
    if (dipakai.has(k)) continue;
    const n = nilaiStill(k, namaSlide[i]);
    // `>` bukan `>=`: seri dimenangkan yang lebih dulu di kolam, dan urutan kolam itu
    // selang berdasarkan vote — jadi seri pun tetap deterministik, bukan acak.
    if (n > nilaiTerbaik) {
      nilaiTerbaik = n;
      terbaik = k;
    }
  }
  if (terbaik < 0) return null;
  dipakai.add(terbaik);
  return kolam[terbaik];
});

/**
 * Slide yang MENYEBUT seorang pemain tapi tidak ketemu still-nya sengaja dibiarkan
 * kosong di sini, supaya dia jatuh ke potret orangnya di bawah.
 *
 * Ini yang menjaga bug pertama tetap tertutup: tanpa keterangan isi still — panggilan
 * visinya gagal, atau memang tidak ada still yang memuat orang itu — mengisi slide
 * "Sadie Sink sebagai Jean Grey" dengan still berikutnya berarti mengundang balik adegan
 * Punisher di bawah namanya. Still yang tidak diketahui isinya cuma boleh dipakai di
 * slide yang memang tidak menyebut siapa-siapa.
 */
let berikut = 0;
for (let i = 0; i < jatah.length; i += 1) {
  if (jatah[i] || namaSlide[i].length) continue;
  while (berikut < kolam.length && (dipakai.has(berikut) || buang.has(berikut))) berikut += 1;
  if (berikut < kolam.length) {
    dipakai.add(berikut);
    jatah[i] = kolam[berikut];
  }
}

/**
 * Potret publisitas — jaring pengaman TERAKHIR, bukan pilihan pertama.
 *
 * Dipakai hanya kalau slide menyebut seorang pemain DAN tidak ada satu pun still yang
 * memuat dia. Adegan filmnya selalu lebih baik: potret 2:3 harus dipasang di kotak yang
 * lebih tinggi dan tetap menyisakan bidang kosong di kiri-kanan.
 */
const cariOrang = (teks) => {
  for (const c of cast) if (c.foto && sebut(teks, c.nama)) return c.foto;
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

  // Potret cuma dipakai kalau slide ini menyebut seorang pemain DAN tidak kebagian still
  // sama sekali. Slide pertama dan terakhir dilewati: teks dua-duanya ditimpa di
  // `Rakit slide`, jadi tidak ada nama yang benar-benar terbit untuk dicocokkan.
  const orang =
    i === 0 || i === slides.length - 1 || jatah[i]
      ? null
      : cariOrang(`${s.heading || ''} ${s.body || ''}`);

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
      //
      // Tidak ada titik fokus yang ikut dikirim. Sempat ada — potret 2:3 digeser ke
      // '50% 18%' supaya wajahnya tidak kepotong waktu di-crop. Itu menambal gejala:
      // foto asli sekarang dipasang `object-fit:contain`, jadi TIDAK ADA yang dipotong
      // dan tidak ada yang perlu digeser.
      foto_url: jatah[i] || (orang ? `https://image.tmdb.org/t/p/w780${orang}` : null),
      // Foto pemain itu potret 2:3, still film 16:9 — beda arah, jadi tidak bisa muat
      // utuh di kotak yang sama. Kotak potret ditinggikan di `Rakit slide`; tanpa itu
      // potretnya cuma jadi persegi panjang kecil mengambang di tengah bidang warna.
      foto_potret: Boolean(orang),
    },
  };
});
