// Fan-out satu item per berkas .md, supaya `Ambil md` melakukan satu GET per berkas.
// Dijalankan SETELAH gambarnya tersimpan: markdown tidak boleh menunjuk URL yang
// masih 404, karena kalau full sync kebetulan jalan di jendela itu,
// `convertSingleImage` gagal dan `image` artikelnya jadi null lagi.
const rencana = $('Susun commit').first().json;
const simpan = $input.first().json;

// Balasan sukses PUT /contents memuat objek `content`. Node HTTP-nya memakai
// onError:continueRegularOutput supaya kegagalan tetap sampai ke e-mail, jadi
// pemeriksaannya harus di sini — bukan diserahkan ke status HTTP.
const sudahAda = simpan && simpan.message && /already exists/i.test(simpan.message);
if (!(simpan && simpan.content && simpan.content.sha) && !sudahAda) {
  throw new Error(
    `hero.jpg gagal di-commit, markdown tidak disentuh: ${JSON.stringify(simpan).slice(0, 300)}`
  );
}

return rencana.berkas.map((nama) => ({
  json: {
    nama,
    path: `articles/${rencana.folder}/${nama}`,
    url_gambar: rencana.url_gambar,
    repo: rencana.repo,
  },
}));
