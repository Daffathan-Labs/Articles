// Susun badan PUT /api/v1/workflows/{id}: workflow yang sama persis, satu nilai diganti.
//
// Dibangun dari salinan utuh hasil GET, bukan dari potongan: PUT itu mengganti seluruh
// workflow, jadi field apa pun yang tidak ikut dikirim akan HILANG. Bukan sekadar
// "tidak diperbarui" — hilang.
const wf = $('Ambil workflow').first().json;
const refresh = $input.first().json;
const baru = refresh.access_token;

if (!baru) {
  throw new Error(
    `refresh_access_token tidak mengembalikan access_token: ${JSON.stringify(refresh).slice(0, 300)}`
  );
}

const nodes = JSON.parse(JSON.stringify(wf.nodes));
const kred = nodes.find((n) => n.name === 'Kredensial');
const field = kred.parameters.assignments.assignments.find((a) => a.name === 'ig_token');
const lama = field.value;
field.value = baru;

// Token baru identik dengan yang lama berarti Meta memantulkan balik permintaannya.
// Menyimpannya tidak merusak apa pun, tapi diam-diam tidak memperpanjang apa pun juga
// — dan bulan depan tokennya mati tanpa ada yang pernah memberi tahu.
if (lama === baru) {
  throw new Error('Token baru identik dengan yang lama — refresh tidak menghasilkan masa berlaku baru.');
}

// PUT hanya menerima empat properti ini. Menyertakan id/active/tags/pinData/versionId
// atau meta dibalas 400 "must NOT have additional properties", dan pesannya tidak
// menyebut properti mana yang jadi masalah.
return [{
  json: {
    body: {
      name: wf.name,
      nodes,
      connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    },
  },
}];
