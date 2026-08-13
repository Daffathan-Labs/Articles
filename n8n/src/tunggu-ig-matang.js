/**
 * Tunggu carousel container Instagram matang sebelum diterbitkan.
 *
 * `media_publish` yang dipanggil langsung setelah container dibuat dibalas 400
 * `Media ID is not available` (code 9007, subcode 2207027, "Media belum siap untuk
 * menerbitkan, tunggu beberapa saat lagi"). Instagram masih MENGUNDUH sendiri kelima
 * gambarnya dari render-svc, jadi lamanya ikut kecepatan server kita — bukan kecepatan
 * n8n. Ini balapan, bukan bug tetap: dia menang berkali-kali waktu render-svc masih di
 * host lama, lalu kalah begitu servicenya pindah.
 *
 * Sinyal matangnya ada dan resmi: `status_code` di container itu sendiri. IN_PROGRESS
 * berarti tunggu; FINISHED, ERROR, EXPIRED, atau PUBLISHED berarti tidak ada gunanya
 * menunggu lagi.
 *
 * TIDAK PERNAH melempar, sengaja. Kalau menyerah, `id`-nya tetap diteruskan supaya yang
 * gagal adalah `IG publish` dengan pesan Meta apa adanya — jauh lebih informatif daripada
 * error karangan node ini. Melempar di sini mematikan cabang IG, dan barrier `Tunggu N
 * cabang` menunggu cabang yang tidak akan pernah datang: e-mail hasilnya hilang sama
 * sekali, persis jenis gagal-senyap yang sudah menyembunyikan Facebook mati berminggu.
 */
const id = $json.id;
const token = $('Kredensial').first().json.ig_token;

// 20 x 3 detik = 60 detik. Gambar carousel biasanya matang di bawah 10 detik; batas ini
// untuk hari waktu render-svc lagi lambat, bukan untuk video yang memang bisa bermenit.
const RONDE = 20;
const JEDA = 3000;

let status = null;
for (let ronde = 0; id && ronde < RONDE; ronde += 1) {
  try {
    const r = await this.helpers.httpRequest({
      url: `https://graph.instagram.com/v23.0/${id}`,
      qs: { fields: 'status_code', access_token: token },
      json: true,
    });
    status = r.status_code;
  } catch (e) {
    // Satu balasan jelek di tengah penantian bukan alasan mematikan cabangnya.
    status = `gagal-cek: ${String(e.message).slice(0, 120)}`;
    break;
  }
  if (status !== 'IN_PROGRESS') break;
  await new Promise((lanjut) => setTimeout(lanjut, JEDA));
}

return [{ json: { id, status } }];
