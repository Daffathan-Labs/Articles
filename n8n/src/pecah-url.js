// Satu item per URL slide, untuk membuat item container IG satu per satu.
// render-svc mengembalikan urls[] urut sesuai images[] yang dikirim, jadi urutan
// carousel-nya mengikuti urutan slide.
//
// Dibaca dari node `Render`, BUKAN dari $input: node ini berjalan setelah `Tunggu
// approval`, jadi $input berisi data request webhook resume (query/body/headers),
// bukan hasil render.
const hasil = $('Render').first().json;
const urls = hasil.urls || [];

if (!urls.length) {
  throw new Error(`render-svc tidak mengembalikan urls[]: ${JSON.stringify(hasil).slice(0, 300)}`);
}
return urls.map((url, i) => ({ json: { url, idx: i } }));
