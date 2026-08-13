/**
 * Kumpulkan still calon, lalu susun SATU permintaan Gemini yang meminta keterangan
 * isinya.
 *
 * Ini menutup satu-satunya lubang yang tersisa di jalur foto film: backdrop TMDB tidak
 * membawa keterangan siapa yang ada di dalamnya. Akibatnya slide "Sadie Sink sebagai
 * Jean Grey" pernah dapat adegan Punisher, dan setelah ditambal dengan daftar pemain dia
 * dapat potret publisitas — bukan adegan filmnya. Padahal still-nya ADA di kolam:
 * /aJbVw1OdpuM8kVbnrROJxg5wn3O.jpg, Sadie Sink bertudung di dalam kereta.
 *
 * Yang hilang cuma keterangannya, dan itu bisa dibaca dari gambarnya sendiri. Model
 * diberi daftar pemain + karakter, lalu diminta menyebut siapa yang terlihat di tiap
 * gambar. Diverifikasi sekali dengan 8 still: kedelapannya benar, termasuk memisahkan
 * Punisher dari Spider-Man dan mengenali Peter Parker tanpa topeng.
 *
 * Gambarnya dikirim BARENGAN dalam satu panggilan, bukan satu-satu: modelnya perlu
 * membandingkan, dan satu artikel jadi satu panggilan alih-alih sepuluh.
 */
const still = $('Still film').first().json;
const cast = (($('Pemain film').first().json || {}).cast || []).slice(0, 12);
const backdrops = Array.isArray(still && still.backdrops) ? still.backdrops : [];

/**
 * HANYA backdrop tanpa bahasa. TMDB memakai `iso_639_1` untuk menandai gambar yang sudah
 * ditempeli JUDUL FILM cetak: null berarti polos. Brand New Day punya 85 backdrop dan 31
 * di antaranya bertuliskan judul — salah satunya persis kena selang yang dipakai carousel.
 * Seluruh desain ini berdiri di atas aturan sebaliknya: semua kata hidup di HTML.
 */
const polos = backdrops
  .filter((b) => b && b.iso_639_1 == null)
  .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

/**
 * Diambil SELANG, bukan berurutan dari yang tertinggi: puluhan backdrop dari satu film
 * hampir selalu memuat beberapa frame dari adegan yang sama, dan yang teratas gampang
 * jadi potongan adegan yang itu-itu juga. Urutan hasilnya juga yang menentukan slide
 * tanpa nama pemain dapat still yang mana, jadi kepalanya harus tersebar.
 *
 * 40, bukan 10. Angka 10 sempat dipakai dan hasilnya fitur ini setengah jalan: still
 * Sadie Sink ADA di antara 54 backdrop polos Brand New Day, tapi tidak masuk sepuluh
 * kandidat, jadi slide-nya tetap jatuh ke potret publisitas. Cakupan yang bolong bikin
 * pencocokan isi kelihatan gagal padahal yang salah cuma daftar yang diperiksa.
 * 40 gambar w500 ≈ 4,8 MB dan ~10 ribu token — sekali per artikel film, praktis gratis.
 */
const MAKS = 40;
const LANGKAH = 3;
const pilih = [];
for (let i = 0; i < polos.length && pilih.length < MAKS; i += LANGKAH) pilih.push(polos[i]);
for (let i = 0; i < polos.length && pilih.length < MAKS; i += 1) {
  if (!pilih.includes(polos[i])) pilih.push(polos[i]);
}

// Dua ukuran, dan bedanya penting. `url` w1280 yang nanti benar-benar dipasang di slide;
// yang dikirim ke model w500. Sepuluh gambar w1280 jadi ~5 MB base64 dalam satu badan
// permintaan, sementara w500 sudah lebih dari cukup untuk mengenali kostum dan warna
// rambut — yang ditanyakan "siapa yang terlihat", bukan detail sehelai rambut.
const url = pilih.map((b) => `https://image.tmdb.org/t/p/w1280${b.file_path}`);
const kecil = pilih.map((b) => `https://image.tmdb.org/t/p/w500${b.file_path}`);

// Artikel bukan film berhenti di sini: nol kandidat, nol unduhan, dan `body` null bikin
// `Terangkan still` dibalas 400 lalu diteruskan onError. Itu jalur normalnya — 45 dari 46
// artikel lewat sini, dan tidak ada satu token pun yang terbakar.
if (!url.length) return [{ json: { url: [], body: null } }];

const roster = cast
  .map((p) => `${p.name} sebagai ${String(p.character || '').trim() || 'tidak disebut'}`)
  .join('; ');

/**
 * Foto acuan wajah tiap pemain, ikut dikirim dan diberi nomor.
 *
 * Tanpa ini modelnya cuma punya daftar NAMA — dia tidak tahu Sadie Sink itu yang mana,
 * jadi dia menebak dari konteks. Hasilnya benar-benar meleset: satu render memberi slide
 * "Sadie Sink sebagai Jean Grey" sebuah still berisi perempuan berambut cokelat yang
 * sebetulnya MJ. Dengan foto acuan, "rambut merah" berhenti jadi tebakan.
 *
 * Delapan teratas saja, ukuran w185: ini cuma untuk mencocokkan wajah, bukan untuk
 * dipajang, dan pemain di bawah urutan itu praktis tidak pernah jadi subjek still.
 */
const acuan = cast.filter((p) => p.profile_path).slice(0, 8);

/*
 * Tiga field, bukan satu, dan dua yang terakhir yang menentukan mutunya.
 *
 * `tokoh` saja pernah menghasilkan slide "Sadie Sink sebagai Jean Grey" berisi sosok
 * bertudung yang wajahnya gelap total — modelnya benar bahwa dia ada di frame, tapi tidak
 * ada yang bisa mengenalinya. `utama` memisahkan "dia yang jadi subjek" dari "dia lewat di
 * latar", dan `wajah` memisahkan "kelihatan" dari "cuma siluet".
 */
/*
 * Sampul artikel ikut dikirim, DI URUTAN TERAKHIR.
 *
 * Slide 1 selalu memakai sampul artikel, dan untuk ulasan film sampulnya sering diambil
 * dari still film yang sama — di render uji slide 1 dan slide 5 keluar sebagai adegan
 * rooftop yang sama persis. Berkasnya beda, jadi aturan "satu slide satu gambar" tidak
 * dilanggar, tapi yang dilihat orang tetap satu gambar diulang.
 *
 * Ditaruh di belakang, bukan di depan, supaya penomoran still tetap 1..N dan tidak ada
 * pergeseran indeks yang harus diingat waktu sampulnya kebetulan tidak ada.
 */
const sampul = ($('Cover base64').first().json || {}).b64 || null;

const prompt = [
  `Ini ${url.length} still resmi dari satu film, urut 1 sampai ${url.length}.`,
  acuan.length
    ? `Gambar ke-${url.length + 1} sampai ke-${url.length + acuan.length} BUKAN still: itu ` +
      `foto acuan wajah pemain, berurutan ${acuan.map((p) => p.name).join(', ')}. ` +
      'Pakai foto-foto itu untuk memastikan siapa yang ada di tiap still, jangan menebak.'
    : '',
  sampul
    ? `Gambar ke-${url.length + acuan.length + 1} BUKAN still: itu sampul artikelnya, ` +
      'sebagai pembanding adegan.'
    : '',
  `Pemainnya: ${roster}.`,
  'Untuk SETIAP still jawab hal berikut. Pakai kostum, warna rambut, dan ciri tokoh sebagai',
  'dasar; kalau tidak ada yang jelas, kembalikan daftar kosong dan utama "".',
  '- tokoh: semua tokoh dari daftar yang terlihat.',
  '- utama: SATU tokoh yang jadi subjek utama frame, "" kalau tidak ada yang menonjol.',
  '- wajah: true HANYA kalau wajah tokoh utama terlihat jelas dan bisa dikenali.',
  '  Bertudung, membelakangi kamera, gelap, atau bertopeng penuh berarti false.',
  sampul
    ? `- sama_sampul: true kalau adegannya sama dengan gambar ke-${url.length + acuan.length + 1}.`
    : '',
  'Balas HANYA JSON, tanpa penjelasan, satu entri per still:',
  '[{"i":1,"tokoh":["nama pemain","nama karakter"],"utama":"nama","wajah":true,' +
    (sampul ? '"sama_sampul":false,' : '') +
    '"adegan":"maks 8 kata"}]',
].filter(Boolean).join('\n');

// Diunduh berombongan, bukan satu per satu: empat puluh unduhan berurutan menahan
// eksekusi hampir satu menit tanpa alasan. Urutan hasilnya tetap urutan `kecil` —
// Promise.all mempertahankannya, dan pasangan gambar↔nomor bergantung pada itu.
// URUTANNYA ADALAH KONTRAKNYA: still dulu 1..N, lalu foto acuan pemain, lalu sampul.
// Prompt di atas menyebut nomor-nomor itu apa adanya, jadi menukar urutan di sini
// membuat modelnya menilai gambar yang salah tanpa satu pun error muncul.
const semua = kecil
  .concat(acuan.map((p) => `https://image.tmdb.org/t/p/w185${p.profile_path}`));

const ROMBONGAN = 8;
const gambar = [];
for (let i = 0; i < semua.length; i += ROMBONGAN) {
  const sepotong = await Promise.all(
    semua.slice(i, i + ROMBONGAN).map((u) =>
      this.helpers.httpRequest({ url: u, encoding: 'arraybuffer' })
    )
  );
  for (const buf of sepotong) gambar.push(Buffer.from(buf).toString('base64'));
}

const parts = [{ text: prompt }];
for (const data of gambar) parts.push({ inline_data: { mime_type: 'image/jpeg', data } });
// Sampulnya paling belakang. Mime-nya sengaja tidak ikut dibaca: sampul kita WebP maupun
// JPEG dua-duanya diterima endpoint ini sebagai image/jpeg.
if (sampul) parts.push({ inline_data: { mime_type: 'image/jpeg', data: sampul } });

return [{ json: { url, body: { contents: [{ parts }] } } }];
