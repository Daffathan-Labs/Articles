// Fan-out satu item per slide. Node `Gemini gambar` memproses satu item per
// panggilan, jadi ini yang membuat carousel 5 slide menghasilkan 5 gambar;
// `Rakit slide` menggabungnya kembali jadi satu item.
const brief = $('Siapkan brief').first().json;
const c = $input.first().json.output;

if (!c || !Array.isArray(c.slides) || !c.slides.length) {
  throw new Error(
    'Gemini copy tidak mengembalikan slides[]. Ini beda dari "model menolak": ' +
      `output yang diterima = ${JSON.stringify(c).slice(0, 300)}`
  );
}

// Rentang aman IG carousel adalah 2-10 item. Prompt meminta 5; potong di 10 kalau
// model kebablasan, dan gagal keras kalau cuma 1 supaya tidak diam-diam jadi post biasa.
const slides = c.slides.slice(0, 10);
if (slides.length < 2) {
  throw new Error(`Cuma ${slides.length} slide — IG carousel butuh minimal 2.`);
}

// Sufiks dikunci di kode, bukan di prompt: ini syarat teknis yang tidak boleh
// dinegosiasikan model. Semua teks hidup di HTML, nol di raster.
const SUFIKS =
  'Photographic, natural available light, shallow depth of field, muted desaturated ' +
  'palette, dark moody background suitable as a full-bleed backdrop behind white text. ' +
  'Absolutely no text, letters, numbers, watermarks, logos or user interface anywhere.';

const CADANGAN = {
  konseptual: 'An abstract minimal still life suggesting an idea taking shape',
  tekstur: 'An extreme close-up of a raw material surface',
  dokumenter: 'A candid over-the-shoulder shot of someone working at a desk',
  tempat: 'A quiet architectural interior with strong directional light',
  properti: 'A single everyday object isolated on a plain surface',
};

return slides.map((s, i) => {
  const mode = CADANGAN[s.image_mode] ? s.image_mode : 'konseptual';
  const inti = String(s.image_prompt || '').trim() || CADANGAN[mode];
  // Slide 2+ diikat ke slide pertama supaya carousel-nya terbaca satu seri,
  // bukan lima gambar acak yang kebetulan bersebelahan.
  const lanjutan = i === 0
    ? ''
    : ' Same visual series, same location and lighting as the first image in this set.';

  return {
    json: {
      code: brief.code,
      idx: i,
      total: slides.length,
      name: String(i + 1).padStart(2, '0'),
      heading: String(s.heading || '').trim(),
      body: String(s.body || '').trim(),
      image_prompt: `${c.image_series || ''} ${inti}.${lanjutan} ${SUFIKS}`.trim(),
    },
  };
});
