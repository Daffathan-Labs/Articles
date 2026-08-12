// Susun brief untuk satu artikel baru. Menghasilkan TEPAT satu item — seluruh
// cabang sosmed di bawah ini (fan-out gambar, render, carousel IG) mengasumsikan
// satu artikel per eksekusi, dan satu approval e-mail memang cuma bisa mewakili satu.
//
// Kalau satu push membawa lebih dari satu artikel baru, sisanya masuk `dilewat` dan
// disebut namanya di e-mail approval. Sengaja tidak dibuang diam-diam.
const body = $('Webhook').first().json.body;
const baru = body.new_folders || [];
if (!baru.length) return [];

// Slug diambil dari respons API, bukan di-slugify sendiri. Server yang membuatnya
// dari `title` (slugify strict), dan hasilnya sering beda dari tebakan.
const slugs = {};
for (const r of $('Publish artikel').all()) {
  const d = r.json && r.json.data;
  if (d && d.id) slugs[`${d.id}|${d.locale}`] = d.slug;
}

const SITE = String($('Kredensial').first().json.site_url || '').replace(/\/+$/, '');
if (!SITE) throw new Error('site_url kosong — isi di node "Kredensial".');

const folder = baru[0];
const arts = (body.articles || []).filter((a) => a.id === folder);
const id = arts.find((a) => a.locale === 'id');
const en = arts.find((a) => a.locale === 'en');
const utama = id || en;
if (!utama) throw new Error(`${folder}: tidak ada artikel di payload untuk folder ini.`);

const url = (a) => {
  const s = a && slugs[`${a.id}|${a.locale}`];
  return s ? `${SITE}/${a.locale}/articles/${s}` : null;
};

// LinkedIn pakai versi EN, Instagram pakai versi ID. Kalau salah satu locale tidak
// ada, dua-duanya jatuh ke yang tersedia — posting dengan bahasa yang kurang pas
// masih jauh lebih baik daripada menautkan URL yang 404.
const urlEn = url(en) || url(id);
const urlId = url(id) || url(en);
if (!urlEn || !urlId) {
  throw new Error(
    `${folder}: slug tidak ada di respons API. Cek keluaran node "Publish artikel" — ` +
      'tanpa slug, tautan yang di-posting pasti salah.'
  );
}

// Teks polos dari HTML: cukup sebagai bahan brief dan jauh lebih hemat token
// daripada mengirim markup Tailwind hasil autoCleanHtml.
const teks = String(utama.content || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 4000);

return [{
  json: {
    folder,
    // Masuk ke path filesystem render-svc, harus lolos /^[A-Za-z0-9_-]{1,64}$/.
    code: folder.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 64),
    title_id: (id && id.title) || null,
    title_en: (en && en.title) || null,
    excerpt: utama.excerpt,
    tags: (utama.tags || []).join(', '),
    teks,
    url_en: urlEn,
    url_id: urlId,
    dilewat: baru.slice(1),
  },
}];
