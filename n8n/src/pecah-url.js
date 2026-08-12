// Satu item per URL slide, untuk membuat item container IG satu per satu.
// render-svc mengembalikan urls[] urut sesuai images[] yang dikirim, jadi urutan
// carousel-nya mengikuti urutan slide.
//
// Dibaca dari node `Render`, BUKAN dari $input: node ini berjalan setelah `Tunggu
// approval`, jadi $input berisi data request webhook resume (query/body/headers),
// bukan hasil render.
const hasil = $('Render').first().json;

// hero.jpg menumpang panggilan Render yang sama, tapi dia gambar artikel 1200x630 —
// bukan slide. Tanpa saringan ini dia jadi slide terakhir carousel: lanskap, di-crop
// jadi potret, dan tidak pernah diminta siapa pun.
const urls = (hasil.urls || []).filter((u) => !u.includes('/hero.jpg'));

if (!urls.length) {
  throw new Error(`render-svc tidak mengembalikan urls[]: ${JSON.stringify(hasil).slice(0, 300)}`);
}
return urls.map((url, i) => ({ json: { url, idx: i } }));
