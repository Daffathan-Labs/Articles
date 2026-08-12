// Sisipkan gambar ke markdown: satu baris metadata dan satu <img> di isi.
//
// Dua-duanya perlu, dan gunanya beda. `<!-- image: -->` jadi thumbnail kartu dan
// og:image. `<img>` di isi jadi gambar besar di halaman detail — halaman itu merender
// `content`, jadi tanpa <img> tidak ada gambar yang terlihat saat artikel dibuka.
//
// Selain dua baris itu, berkasnya tidak boleh berubah sedikit pun. Ini menulis ke repo
// tulisan orang; diff yang mengandung perubahan lain adalah bug, bukan kerapian.

/** Sisip satu baris SETELAH baris pertama yang cocok, tanpa menyentuh yang lain. */
const sisipSetelah = (baris, cocok, isi) => {
  const i = baris.findIndex(cocok);
  if (i < 0) return null;
  return [...baris.slice(0, i + 1), isi, ...baris.slice(i + 1)];
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

const keluar = [];

for (const item of $input.all()) {
  const g = item.json;
  const rencana = $('Pecah md').all().find((x) => x.json.path === g.path);
  if (!rencana) throw new Error(`tidak ketemu rencana untuk ${g.path}`);
  const url = rencana.json.url_gambar;

  if (typeof g.content !== 'string' || !g.sha) {
    throw new Error(
      `balasan GET /contents tidak lengkap untuk ${g.path}: ${JSON.stringify(g).slice(0, 200)}`
    );
  }

  // GitHub mengembalikan base64 ber-baris-baru; atob/Buffer sama-sama tidak masalah,
  // tapi barisnya harus dibuang dulu di sebagian runtime.
  const asli = Buffer.from(String(g.content).replace(/\s/g, ''), 'base64').toString('utf8');

  // Sudah punya gambar berarti ada yang menambahkannya di antara publish dan sekarang.
  // Menimpanya berarti membuang gambar pilihan manusia demi gambar mesin.
  if (/<!--\s*image:\s*\S/i.test(asli)) {
    keluar.push({ json: { path: g.path, lewati: true, alasan: 'sudah punya <!-- image: -->' } });
    continue;
  }

  const baris = asli.split('\n');
  const judul = (/<!--\s*title:\s*(.*?)\s*-->/i.exec(asli) || [])[1] || 'Gambar artikel';

  // 1) baris metadata. Ditaruh setelah `excerpt` supaya urutannya sama dengan 45
  //    artikel yang sudah ada; kalau tidak ada excerpt, setelah komentar terakhir.
  let hasil =
    sisipSetelah(baris, (b) => /^<!--\s*excerpt:/i.test(b), `<!-- image: ${url} -->`) ||
    sisipSetelah(baris, (b) => /^<!--[\s\S]*-->\s*$/.test(b), `<!-- image: ${url} -->`);
  if (!hasil) throw new Error(`${g.path}: tidak ada blok metadata <!-- ... --> di atas berkas`);

  // 2) <img> di isi, setelah judul H1 — persis pola 45 artikel yang sudah ada.
  //    Kalau tidak ada H1, ditaruh sebelum paragraf pertama.
  const img = `<img width="800" alt="${esc(judul)}" src="${url}" />`;
  const iJudul = hasil.findIndex((b) => /^#\s+\S/.test(b));
  if (iJudul >= 0) {
    // Deretan baris kosong setelah judul diganti pola baku `kosong, img, kosong`,
    // bukan disisipi. Menyisipi bikin artikel yang sudah punya baris kosong di situ
    // berakhir dengan dua baris kosong berturut-turut — jejak yang tidak perlu ada
    // di diff artikel orang.
    let j = iJudul + 1;
    while (j < hasil.length && hasil[j].trim() === '') j++;
    hasil = [...hasil.slice(0, iJudul + 1), '', img, '', ...hasil.slice(j)];
  } else {
    const i = hasil.findIndex((b) => b.trim() && !/^<!--/.test(b));
    if (i < 0) throw new Error(`${g.path}: tidak ada isi setelah blok metadata`);
    hasil = [...hasil.slice(0, i), img, '', ...hasil.slice(i)];
  }

  keluar.push({
    json: {
      path: g.path,
      sha: g.sha,
      lewati: false,
      isi_b64: Buffer.from(hasil.join('\n'), 'utf8').toString('base64'),
    },
  });
}

return keluar;
