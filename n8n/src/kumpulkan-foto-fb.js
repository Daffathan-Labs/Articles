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

/**
 * SATU field `attached_media` berisi array JSON, bukan kunci ber-indeks per foto.
 *
 * Bentuk `attached_media[0]`, `attached_media[1]`, … jumlah kuncinya ikut jumlah slide,
 * jadi dia tidak muat di daftar bodyParameters n8n yang panjangnya tetap saat build.
 * Jalan keluar sebelumnya `specifyBody:'json'` di atas `contentType:'form-urlencoded'` —
 * dan itu kombinasi yang TIDAK didukung n8n: node-nya membalas "JSON parameter needs to
 * be valid JSON" dan Facebook tidak pernah sekali pun kebagian post.
 *
 * Graph API menentukan parameter bertipe list dalam sintaksis JSON, jadi satu field
 * `attached_media=[{"media_fbid":"1"},{"media_fbid":"2"}]` adalah bentuk yang sah dan
 * panjangnya tetap satu kunci berapa pun jumlah fotonya. Dengan itu node-nya bisa memakai
 * keypair biasa — pola yang sama persis dengan `FB unggah foto` dan `IG carousel
 * container`, dua node yang memang sudah terbukti jalan.
 *
 * Urutan lampiran mengikuti urutan slide.
 */
const attached_media = JSON.stringify(ids.map((id) => ({ media_fbid: String(id) })));

return [{ json: { attached_media, jumlah: ids.length } }];
