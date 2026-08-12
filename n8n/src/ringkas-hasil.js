// Satu item ringkasan untuk dikembalikan ke GitHub Actions. Berjalan setelah semua
// POST /articles selesai, jadi kalau ada yang gagal alurnya sudah berhenti sebelum
// sampai sini dan webhook membalas 500.
const body = $('Webhook').first().json.body;
const hasil = $input.all();

return [{
  json: {
    ok: true,
    mode: 'delta',
    sha: body.sha,
    published: hasil.length,
    new_folders: body.new_folders || [],
    slugs: hasil.map((r) => r.json?.data?.slug).filter(Boolean),
  },
}];
