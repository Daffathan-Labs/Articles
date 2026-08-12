// Ambil ig_token yang sedang dipakai dari node Kredensial workflow publish.
//
// Tokennya sengaja dibaca dari sana, bukan disalin ke workflow ini: kalau ada dua
// salinan, yang satu pasti basi dan refresh-nya memperpanjang token yang sudah tidak
// dipakai siapa-siapa. Satu tempat penyimpanan, dan tetap yang itu juga yang bisa
// diedit tangan.
const wf = $input.first().json;
const nodes = wf.nodes || [];

if (!nodes.length) {
  throw new Error(
    `Balasan API tidak memuat nodes[]. Cek workflow_id dan n8n_api_key. ` +
      `Dapat: ${JSON.stringify(wf).slice(0, 300)}`
  );
}

const kred = nodes.find((n) => n.name === 'Kredensial');
if (!kred) {
  throw new Error(
    `Workflow "${wf.name || '?'}" tidak punya node bernama "Kredensial" — ` +
      'kemungkinan workflow_id menunjuk workflow lain.'
  );
}

const daftar = (kred.parameters && kred.parameters.assignments && kred.parameters.assignments.assignments) || [];
const field = daftar.find((a) => a.name === 'ig_token');
if (!field || !field.value) {
  throw new Error('Node "Kredensial" tidak punya field ig_token yang terisi.');
}
// Placeholder hasil build yang belum diisi. Meneruskannya bikin refresh dibalas 400
// dengan pesan Meta yang tidak menyebut sebab aslinya.
if (/^ISI_[A-Z0-9_]+$/.test(field.value)) {
  throw new Error(`ig_token masih placeholder (${field.value}) — isi dulu di workflow publish.`);
}

return [{ json: { token_lama: field.value, nama_workflow: wf.name || '' } }];
