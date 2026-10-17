// Balasan `Gemini gambar` (generateContent) → binary `data` untuk `Jadi JPEG`.
//
// Gambarnya ada di candidates[0].content.parts[].inlineData sebagai base64. Item yang
// gagal (kuota habis, model menolak, balasan cuma teks) tetap keluar sebagai item TANPA
// binary — jumlah item harus sama dengan jumlah slide, karena `Rakit slide` memasangkan
// slide dan gambar per indeks. Slide tanpa gambar jatuh ke kartu berpola, bukan ke gambar
// milik slide lain.
//
// Binary dibuat lewat helper, bukan dengan menaruh base64 di `binary.data.data`: instance
// ini memakai mode filesystem, dan helper yang menulis berkasnya ke disk.
const masuk = $input.all();
const keluar = [];

for (const it of masuk) {
  const parts = ((((it.json || {}).candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
  if (!img) {
    keluar.push({ json: { gambar_gagal: true, alasan: JSON.stringify(it.json || {}).slice(0, 300) } });
    continue;
  }
  const mime = img.mimeType || img.mime_type || 'image/png';
  const data = await this.helpers.prepareBinaryData(
    Buffer.from(img.data, 'base64'),
    `slide.${mime.split('/')[1] || 'png'}`,
    mime
  );
  keluar.push({ json: {}, binary: { data } });
}

return keluar;
