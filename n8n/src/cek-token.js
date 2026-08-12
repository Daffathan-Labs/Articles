// Periksa balasan PUT, bukan sekadar percaya HTTP 200.
//
// Node HTTP di atas memakai onError:continueRegularOutput supaya kegagalan tetap
// sampai ke e-mail — tanpa ini pekerjaan terjadwal yang gagal cuma jadi eksekusi merah
// di dasbor yang tidak pernah dibuka siapa pun, dan tokennya mati dua bulan kemudian.
const refresh = $('Refresh token').first().json;
const simpan = $input.first().json;
const lama = $('Ambil token lama').first().json.token_lama;
const baru = refresh.access_token || '';

const masalah = [];

if (refresh.error || !baru) {
  masalah.push(`refresh gagal: ${JSON.stringify(refresh).slice(0, 300)}`);
}

const kred = (simpan.nodes || []).find((n) => n.name === 'Kredensial');
const tersimpan =
  kred && (kred.parameters.assignments.assignments || []).find((a) => a.name === 'ig_token');

if (!tersimpan) {
  masalah.push(`balasan PUT tidak memuat node Kredensial: ${JSON.stringify(simpan).slice(0, 300)}`);
} else if (tersimpan.value !== baru) {
  masalah.push('token di workflow publish tidak berubah — yang tersimpan masih yang lama.');
}

// PUT mengganti seluruh workflow. Kalau prosesnya sampai menonaktifkannya, webhook
// publish ikut mati dan push berikutnya gagal tanpa sebab yang kelihatan.
if (simpan.active === false) {
  masalah.push('Workflow publish jadi NONAKTIF setelah disimpan — aktifkan lagi di n8n sekarang juga.');
}

const detik = Number(refresh.expires_in || 0);

return [{
  json: {
    ok: masalah.length === 0,
    hari: Math.round(detik / 86400),
    // Tanggal, bukan cuma jumlah hari: yang berguna saat membaca e-mail sebulan lagi.
    kedaluwarsa: new Date(Date.now() + detik * 1000).toISOString().slice(0, 10),
    // Hanya ekornya. E-mail itu penyimpanan jangka panjang yang tidak dienkripsi —
    // enam karakter sudah cukup untuk memastikan tokennya benar-benar berganti.
    ekor_lama: String(lama).slice(-6),
    ekor_baru: baru.slice(-6),
    masalah,
  },
}];
