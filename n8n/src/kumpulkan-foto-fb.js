// Kumpulkan id foto hasil unggah unpublished jadi satu body post feed.
//
// Facebook tidak punya endpoint carousel. Pola resminya dua langkah: tiap foto
// diunggah dengan published=false (tercipta, tapi tidak tayang sendiri-sendiri),
// lalu SATU post feed melampirkan semuanya lewat attached_media[n].
//
// Sama seperti carousel IG: node FB memakai onError:continueRegularOutput supaya
// satu foto gagal tidak mematikan eksekusi — tapi post dengan lampiran bolong
// jangan diterbitkan. Lebih baik gagal keras di sini daripada tayang cacat.
const items = $input.all();
const ids = items.map((i) => i.json && i.json.id).filter(Boolean);

if (ids.length !== items.length) {
  const gagal = items.filter((i) => !(i.json && i.json.id));
  throw new Error(
    `${ids.length}/${items.length} foto FB berhasil diunggah. Contoh error: ` +
      JSON.stringify(gagal[0] && gagal[0].json).slice(0, 400)
  );
}
if (ids.length < 2) throw new Error(`Post FB butuh minimal 2 foto, dapat ${ids.length}.`);

// Bentuk kunci ber-indeks `attached_media[0]` adalah bentuk yang didokumentasikan
// Meta, dan nilainya JSON string — bukan objek. Dikirim form-urlencoded, jadi tiap
// kunci berdiri sendiri. Urutan lampiran mengikuti urutan slide.
const body = {};
ids.forEach((id, i) => {
  body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: String(id) });
});

return [{ json: { body, jumlah: ids.length } }];
