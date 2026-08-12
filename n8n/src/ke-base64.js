// Ubah binary jadi base64 yang benar-benar bisa dipakai di <img src="data:…">.
//
// Instance ini menyimpan binary di FILESYSTEM (N8N_DEFAULT_BINARY_DATA_MODE=filesystem),
// jadi `binary.data.data` berisi string literal "filesystem-v2" — bukan base64. Berkas
// aslinya ada di disk dan cuma bisa dibaca lewat helper. Dipasang apa adanya ke
// <img src="data:image/webp;base64,…">, yang keluar adalah ikon gambar rusak, di setiap
// slide, tanpa satu pun error di n8n dan dengan render-svc tetap membalas 200.
//
// Ditulis sebagai loop yang mengeluarkan SATU item per item masuk — termasuk yang tanpa
// binary. Node bawaan `Extract From File` tidak bisa dipakai di sini: dia MEMBUANG item
// tanpa binary alih-alih menandainya. Lima slide dengan dua gambar berhasil keluar
// sebagai dua item, dan pasangan per-indeks slide↔gambar hilang tanpa jejak; kalau
// semuanya gagal, keluarannya nol item dan seluruh cabang berhenti diam-diam sambil
// tetap dilaporkan "success".
const masuk = $input.all();
const keluar = [];

for (let i = 0; i < masuk.length; i++) {
  const b = masuk[i].binary && masuk[i].binary.data;
  keluar.push({
    json: {
      b64: b ? Buffer.from(await this.helpers.getBinaryDataBuffer(i, 'data')).toString('base64') : null,
      // Mime ikut dibawa, bukan diasumsikan: API menyajikan cover sebagai WebP, dan
      // menuliskannya sebagai image/jpeg bikin Chromium menolak merender gambarnya.
      mime: (b && b.mimeType) || null,
    },
  });
}

return keluar;
