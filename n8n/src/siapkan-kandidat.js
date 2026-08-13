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

/**
 * Dua ukuran: `url` w1280 yang dipasang di slide, w780 yang dikirim ke model.
 *
 * Sempat w500, dan itu yang menerbitkan orang yang salah. Wajah di still 16:9 tingginya
 * sekitar 16% frame, jadi di w500 dia cuma ~45 piksel — cukup untuk melihat ADA orang,
 * tidak cukup untuk membedakan dua perempuan berambut kemerahan di bawah cahaya tungsten.
 * Modelnya menyebut Zendaya sebagai Sadie Sink, dan itu yang terbit.
 *
 * Anehnya w500 BENAR kalau cuma dua still yang dikirim — ukurannya baru menggigit waktu
 * kolamnya besar. Jadi jangan pernah menguji ini dengan dua gambar lalu menyimpulkan
 * ukurannya cukup: diuji dengan 40 still yang sama persis dengan produksi, w500 salah
 * orang dan w780 benar.
 *
 * w780, bukan w1280: w1280 juga benar tapi badannya jadi ~10 MB base64, dan tidak ada
 * bukti dia lebih benar dari w780.
 */
const url = pilih.map((b) => `https://image.tmdb.org/t/p/w1280${b.file_path}`);
const kecil = pilih.map((b) => `https://image.tmdb.org/t/p/w780${b.file_path}`);

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
 * Delapan teratas saja, ukuran w500. Sempat w185 — potret 185x278, wajahnya ~120 piksel —
 * dan acuan sekecil itu tidak menjaga apa pun: yang dibandingkan dua-duanya kabur.
 * Delapan gambar w500 cuma ~0,4 MB, jadi menghematnya di sini tidak membeli apa-apa.
 */
const acuan = cast.filter((p) => p.profile_path).slice(0, 8);

/*
 * Tiga field, bukan satu, dan `wajah` yang paling gampang ditulis salah.
 *
 * `tokoh` saja pernah menghasilkan slide "Sadie Sink sebagai Jean Grey" berisi sosok yang
 * cuma lewat di latar. `utama` memisahkan "dia yang jadi subjek" dari "dia lewat".
 *
 * `wajah` versi pertama berbunyi "bertudung berarti false", dan itu SALAH sampai merusak
 * hasilnya: still Sadie Sink terbaik di kolam justru dia bertudung di dalam kereta —
 * wajahnya besar, terang, menghadap kamera, tidak bisa keliru. Aturan itu menurunkan
 * nilainya ke 2, lalu still lain yang tokohnya salah kenal menang dengan 3, dan yang
 * terbit adalah perempuan yang bukan Sadie Sink. Tudung bukan ukurannya; yang jadi
 * ukuran cuma satu — bisa atau tidak orang mengenalinya dari frame itu saja.
 *
 * Pengenalannya juga diikat ke foto acuan, bukan ke konteks adegan. "Perempuan berambut
 * kemerahan di bengkel Peter, berarti Jean Grey" adalah tebakan yang terdengar masuk akal
 * dan tetap salah orang.
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
  'Untuk SETIAP still jawab hal berikut. Dasarnya COCOKKAN WAJAH dengan foto acuan di atas,',
  'bukan menebak dari konteks adegan atau dari siapa yang "masuk akal" ada di situ.',
  'Ragu sedikit pun = jangan sebut namanya. Daftar kosong dan utama "" itu jawaban yang sah,',
  'dan jauh lebih baik daripada nama yang meleset.',
  '- tokoh: semua tokoh dari daftar yang wajahnya benar-benar cocok dengan foto acuannya.',
  '- utama: SATU tokoh yang jadi subjek utama frame, "" kalau tidak ada yang menonjol.',
  '- wajah: true kalau wajah tokoh utama cukup BESAR, cukup TERANG, dan cukup MENGHADAP',
  '  kamera untuk dikenali dari frame ini saja. Tudung, topi, dan kostum TIDAK membuatnya',
  '  false — yang membuatnya false cuma wajah yang membelakangi kamera, gelap total,',
  '  tertutup topeng penuh, menunduk, atau terlalu jauh/kecil untuk dikenali.',
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
  .concat(acuan.map((p) => `https://image.tmdb.org/t/p/w500${p.profile_path}`));

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
