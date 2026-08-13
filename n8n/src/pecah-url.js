// Satu item per URL slide, untuk membuat item container IG satu per satu.
// render-svc mengembalikan urls[] urut sesuai images[] yang dikirim, jadi urutan
// carousel-nya mengikuti urutan slide.
//
// Dibaca dari node `Render`, BUKAN dari $input: node ini berjalan setelah `Tunggu
// approval`, jadi $input berisi data request webhook resume (query/body/headers),
// bukan hasil render.
const hasil = $('Render').first().json;

/*
 * Origin URL-nya DITULIS ULANG dari `render_url`, tidak dipakai apa adanya.
 *
 * `urls[]` disusun render-svc dari env `PUBLIC_URL` MILIKNYA SENDIRI — nilai kedua yang
 * harus diingat cocok dengan `render_url`. Dua kali dalam satu jam dia meleset: sekali
 * host-nya (`http://render-svc:8080`, nama internal Docker yang cuma bisa di-resolve
 * dari dalam jaringan n8n), sekali portnya (`:8080` padahal container terbit di port lain).
 *
 * Dua-duanya gagal SENYAP: render balas 200, workflow sukses, tapi Halaman-nya kosong.
 * Sebabnya `urls[]` ini bukan kita yang mengunduh — server Instagram (`image_url`) dan
 * Facebook (`url`) yang mengambil sendiri berkasnya dari internet, dan mereka cuma bisa
 * lapor gagal lewat pesan error Meta yang tidak menyebut-nyebut PUBLIC_URL.
 *
 * `render_url` sudah pasti hidup dan publik: node `Render` baru saja berhasil memakainya,
 * dan ada test yang menolak host tanpa titik. Jadi PUBLIC_URL berhenti jadi nilai yang
 * harus benar untuk urusan posting.
 */
// Dipotong dengan regex, BUKAN `new URL()`: sandbox Code node n8n tidak punya global
// `URL` — dia dibalas `ReferenceError: URL is not defined` dan mematikan node ini.
// Test biasa tidak menangkapnya karena Node punya `URL`; yang menjaga sekarang test
// `Code node cuma memakai global yang benar-benar ada di sandbox n8n`.
const asal = String($('Kredensial').first().json.render_url).replace(/\/+$/, '');
const samakan = (u) => {
  const sisa = String(u).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return asal + (sisa.charAt(0) === '/' ? sisa : `/${sisa}`);
};

// hero.jpg menumpang panggilan Render yang sama, tapi dia gambar artikel 1200x630 —
// bukan slide. Tanpa saringan ini dia jadi slide terakhir carousel: lanskap, di-crop
// jadi potret, dan tidak pernah diminta siapa pun.
const urls = (hasil.urls || []).filter((u) => !u.includes('/hero.jpg')).map(samakan);

if (!urls.length) {
  throw new Error(`render-svc tidak mengembalikan urls[]: ${JSON.stringify(hasil).slice(0, 300)}`);
}
return urls.map((url, i) => ({ json: { url, idx: i } }));
