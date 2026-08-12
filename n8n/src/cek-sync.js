// Mempertahankan perilaku publish.js yang lama: 504 dari /articles/sync dianggap
// sukses karena server masih mengunduh gambar di latar dan sync-nya tetap selesai.
// Error lain tetap gagal keras — jangan sampai sync yang benar-benar ditolak
// terlihat hijau di GitHub Actions.
const j = $input.first().json;
if (!j.error) return [{ json: { ok: true, mode: 'sync' } }];

const status = j.error.status ?? j.error.httpCode ?? j.error.code ?? null;
if (String(status) === '504') {
  return [{ json: { ok: true, mode: 'sync', note: '504 dari API — dianggap sukses' } }];
}
throw new Error(`Sync gagal (${status}): ${JSON.stringify(j.error).slice(0, 500)}`);
