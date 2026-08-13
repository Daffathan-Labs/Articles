// Gerbang cabang commit balik. Mengembalikan [] kalau tidak ada yang perlu di-commit —
// dan nol item berarti seluruh rantai di bawahnya tidak dieksekusi sama sekali, jadi
// tidak perlu node IF terpisah. Pola yang sama dipakai `siapkan-brief.js`.
//
// Yang memicu: artikel tidak punya gambar sama sekali, sehingga `Rakit slide`
// mempromosikan latar Gemini slide 1 jadi hero. Artikel yang sudah punya cover
// menghasilkan hero null dan berhenti di sini.
//
// Dibaca lewat referensi node, bukan $input: masukan node ini adalah balasan
// render-svc (`{urls, previewUrl}`), bukan keluaran `Rakit slide`.
const b = $('Rakit slide').first().json;
const urls = $('Render').first().json.urls || [];

if (!b.hero) return [];

// URL hero di render-svc, sumber byte yang akan di-commit. Dicari berdasarkan nama
// berkasnya, bukan indeks: `urls` juga memuat 5 slide dan urutannya bisa berubah.
const mentah = urls.find((u) => u.includes('/hero.jpg'));
// Origin disamakan dengan `render_url`, alasannya di `pecah-url.js`: alamat di `urls[]`
// datang dari PUBLIC_URL container, dan yang bisa menjangkau render-svc adalah alamat
// yang baru saja dipakai node `Render`.
const asal = String($('Kredensial').first().json.render_url).replace(/\/+$/, '');
// `?v=` ikut dibawa: itu pembatal cache dari render-svc, dan hero baru saja ditulis ulang.
// Regex, bukan `new URL()` — sandbox Code node n8n tidak punya global `URL`.
const sisa = mentah && String(mentah).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
const sumber = sisa && asal + (sisa.charAt(0) === '/' ? sisa : `/${sisa}`);
if (!sumber) {
  throw new Error(
    `hero disusun tapi tidak ada di balasan render-svc. urls = ${JSON.stringify(urls).slice(0, 300)}`
  );
}

const repo = String(b.repo || '').trim();
const folder = String(b.folder || '').trim();
const berkas = (b.berkas_md || []).filter((n) => typeof n === 'string' && n.endsWith('.md'));

// Gagal keras, bukan diam: kalau salah satu tidak masuk akal, PUT-nya akan menulis ke
// path yang salah di repo publik. Lebih baik cabang ini mati daripada mengarang path.
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  throw new Error(`repo tidak berbentuk owner/nama: ${JSON.stringify(repo)}`);
}
if (!/^[\w.-]+$/.test(folder)) {
  throw new Error(`folder artikel tidak aman untuk path: ${JSON.stringify(folder)}`);
}
if (!berkas.length) {
  throw new Error('berkas_md kosong — publish.js tidak mengirim md_files untuk folder ini.');
}

// Cabang `main` dikunci karena Action-nya sendiri hanya jalan di main
// (.github/workflows/publish-articles.yml: `if: github.ref == 'refs/heads/main'`).
return [{
  json: {
    repo,
    folder,
    berkas,
    sumber,
    path_gambar: `articles/${folder}/hero.jpg`,
    url_gambar: `https://raw.githubusercontent.com/${repo}/main/articles/${folder}/hero.jpg`,
    judul: b.folder,
  },
}];
