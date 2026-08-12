# Setup pipeline publish

`git push` ke `articles/**` → GitHub Action → webhook n8n → website + LinkedIn + Instagram.

```
publish.js  ──POST──▶  n8n /webhook/portofolio
                          ├─ POST api/articles (ID + EN)   ──▶ balas ke GitHub Actions
                          └─ artikel BARU saja:
                               Gemini caption + 5 slide
                               Gemini gambar → JPEG → render-svc
                               e-mail preview + tombol Approve
                               └─ LinkedIn (EN) + Instagram carousel (ID)
```

Kenapa hanya artikel baru: `publish.js` membaca `git diff --name-status` dan hanya
menandai folder yang **semua** file `.md`-nya berstatus `A`. Edit typo di artikel lama
tetap memperbarui website tapi tidak pernah mem-posting ulang ke sosmed. Tidak ada
tabel status yang perlu dijaga — git sudah menyimpan informasi itu.

---

## 1. Secret GitHub

**Settings → Secrets and variables → Actions**

| Secret | Isi |
|---|---|
| `N8N_WEBHOOK_URL` | `https://workflow.daffathan-labs.my.id/webhook/portofolio` |
| `N8N_WEBHOOK_TOKEN` | string acak bikinan sendiri, mis. `openssl rand -hex 32` |

`NESTJS_API_URL` dan `NESTJS_API_KEY` sudah tidak dipakai Action — pindah jadi env var
n8n di langkah 3. Boleh dihapus dari repo setelah pipeline barunya terbukti jalan.

## 2. Import workflow

n8n → **Workflows → Import from File** → **`n8n/portofolio-publish.local.json`**
(bukan yang tanpa `.local` — itu versi placeholder untuk git; lihat langkah 3).

Workflow-nya sudah membawa `webhookId` yang sama dengan webhook yang sudah kamu buat,
jadi path `/webhook/portofolio` tidak berubah.

### Kredensial yang harus diisi

Semua id kredensial di file ini sengaja placeholder (`ISI_ID_CREDENTIAL_*`) supaya
tidak ada rahasia ikut ter-commit. Setelah import, buka tiap node bertanda merah:

| Node | Jenis kredensial | Isi |
|---|---|---|
| `Webhook` | Header Auth | Name: `X-Portofolio-Token`, Value: sama persis dengan `N8N_WEBHOOK_TOKEN` |
| `Gemini Flash`, `Gemini gambar` | Google Gemini (`googlePalmApi`) | API key dari <https://aistudio.google.com/apikey> |
| `Kirim preview`, `Email hasil`, `Lapor render gagal`, `Lapor dilewati` | Gmail OAuth2 | **sudah terisi** — kredensial `Gmail account` |

Keempat node e-mail memakai node Gmail, yang mengirim **dari akun Gmail yang
terautentikasi**. Tidak ada alamat pengirim yang bisa diatur; `NOTIFY_EMAIL` hanya
menentukan penerimanya.

## 3. Node `Kredensial`

**Tidak ada env var.** Semua nilai yang perlu diganti manusia ada di satu node Set
bernama `Kredensial`, tepat setelah Webhook. Token LinkedIn kedaluwarsa tiap 60 hari
dan versi API tiap ~12 bulan, jadi tempat menggantinya harus satu dan gampang dicari —
bukan tersebar di `docker-compose.yml` dan belasan parameter node.

Buka node itu di n8n, isi yang masih `ISI_...`, simpan. Selesai.

| Field | Isi |
|---|---|
| `article_api_url` | `https://api.daffathan-labs.my.id` — sudah terisi |
| `article_api_key` | nilai `ARTICLE_API_KEY` milik daffathan-labs-api |
| `site_url` | `https://daffathan-labs.my.id` — sudah terisi |
| `render_url` | domain publik render-svc, **tanpa** trailing slash |
| `render_token` | sama dengan `RENDER_TOKEN` di render-svc |
| `linkedin_token` | → [credentials-linkedin.md](credentials-linkedin.md). **Ini yang diganti tiap 60 hari** |
| `linkedin_urn` | `urn:li:person:B1oVXChp7v` — sudah terisi dan terverifikasi |
| `linkedin_version` | `202607` — sudah terisi. Ganti hanya saat muncul 426 `NONEXISTENT_VERSION` |
| `ig_user_id` | → [credentials-instagram.md](credentials-instagram.md) |
| `ig_token` | idem |
| `notify_email` | alamat **penerima** e-mail; pengirimnya selalu akun Gmail di kredensial |

### Dua file, satu struktur

Repo ini **publik** — token hidup di file yang ter-commit akan di-scrape bot dalam
hitungan menit dan penerbitnya mencabutnya. Jadi build menghasilkan dua file:

| File | Isi | Git |
|---|---|---|
| `n8n/portofolio-publish.json` | placeholder `ISI_...` | ter-commit |
| `n8n/portofolio-publish.local.json` | nilai asli — **ini yang di-import** | di-gitignore |

Node dan koneksinya identik; yang berbeda hanya nilai di dalam `Kredensial`. Jadi hasil
edit di n8n tetap bisa di-diff terhadap versi ter-commit.

Satu test mengunci ini: `file ter-commit tidak membawa kredensial hidup` gagal kalau ada
nilai asli yang bocor ke file yang ter-commit.

## 4. render-svc

Sudah ter-deploy. Workflow memakainya dengan `brand: "portofolio"`, dan service-nya
memang multi-brand lewat path `/a/:brand/:code/` — tidak ada perubahan kode yang perlu.
Diverifikasi 2026-08-12: render brand `portofolio` balas 200, JPEG-nya asli
(`FF D8 FF`), dan Meta berhasil mengambilnya lewat `http://` biasa di IP mentah —
TLS ternyata tidak diwajibkan untuk `image_url`.

**`render_url` harus base URL saja** — `http://34.128.95.69:8080`, **tanpa** `/render`.
Workflow yang menambahkan `/render`; kalau field-nya sudah memuatnya, hasilnya
`/render/render` dan balasannya 404 tanpa menyebut sebabnya. Ada test yang menjaga ini.

Satu hal yang gampang terlewat: `urls[]` yang dikembalikan render-svc disusun dari
env `PUBLIC_URL` **milik container itu**, bukan dari `render_url` yang kita kirim.
Kalau nanti service-nya dipindah ke domain ber-TLS, `PUBLIC_URL` di container harus
ikut diubah — mengubah `render_url` saja membuat gambar tetap disajikan di alamat lama.

Dua hal yang harus dipastikan sebelum posting pertama:

```bash
curl https://<render>/health          # "font" harus menyebut Inter, bukan fallback
curl -I https://<render>/a/portofolio/uji/01.jpg
```

Font salah tidak memunculkan error apa pun — teksnya cuma jatuh ke metrik lain dan
layout 1080×1350 bergeser diam-diam. Route `/a/` juga tidak boleh punya redirect:
Meta meng-cURL URL itu apa adanya, satu `Location:` saja membuat posting gagal.

---

## Ketahanan terhadap gagal

Tiga lapis, dari yang paling murah:

**1. Retry di dalam node** — `Gemini copy` dan `Gemini gambar` di-set `maxTries: 5`
(maksimum n8n) dengan jeda 5 detik. Ini yang menangani error transien API.

**2. Gambar tidak pernah memblokir** — slide yang tetap gagal setelah 5 percobaan
meminjam latar slide tetangga. Kalau **semua** gambar gagal, slide tetap terbit dengan
latar polos gelap. Latar itu tampil di opacity 42% di balik veil gelap — teksnya yang
jadi isi, gambarnya dekorasi. Jumlah yang gagal disebut di e-mail preview.

**3. Loop render 8 ronde** — `Render` yang gagal kembali ke `Rakit slide`, sampai 8×.

Yang penting di lapis ketiga: **tiap ronde teksnya diperkecil.** 422 `overflow` itu
deterministik — kirim HTML yang sama ke render-svc, dapat 422 yang sama. Mengulang
input identik 8 kali cuma menghabiskan waktu. Jadi tiap ronde `Rakit slide` memakai
`$runIndex` untuk menskala font (100% → 70%, lantai di ronde 5) dan memangkas kata
(heading 8→5, body 25→10). Ronde 8 praktis mustahil meluber.

Loop-nya kembali ke `Rakit slide`, **bukan** ke `Gemini gambar`: penyebab overflow
adalah teks, bukan gambar, jadi gambar yang sudah jadi dipakai ulang. Regenerasi lima
gambar tiap ronde cuma membakar kuota Gemini tanpa mengubah apa pun.

Kalau render akhirnya berhasil di ronde >1, e-mail preview menyebutkannya — kalau itu
sering terjadi, perpendek batas kata di `Skema copy` supaya ronde pertama sudah muat.

---

## Verifikasi bertahap

Tiap langkah berdiri sendiri — jangan lompat ke akhir.

### a. Parser dan workflow

```bash
node --test .github/scripts/publish.test.mjs      # 12 test
node --test n8n/portofolio-publish.test.mjs       # 26 test
```

Yang kedua membaca `portofolio-publish.json` langsung: referensi `$('Nama Node')` yang
menggantung, Code node yang tidak lolos parse, dan node yang tidak terjangkau dari
Webhook semuanya ketahuan di sini, bukan saat produksi.

### b. Kredensial sosmed, sebelum menyentuh workflow

Jalankan blok verifikasi di masing-masing dokumen:
[LinkedIn §5](credentials-linkedin.md), [Instagram §6](credentials-instagram.md).

### c. Jalur website saja

Kirim payload palsu tanpa artikel baru — cabang sosmed harus diam:

```bash
curl -X POST https://workflow.daffathan-labs.my.id/webhook/portofolio \
  -H "X-Portofolio-Token: $N8N_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"delta","sha":"uji","repo":"uji","new_folders":[],
       "articles":[{"id":"artikel-uji","locale":"id","title":"Artikel Uji",
       "excerpt":"Ringkasan uji.","date":"2026-08-12","posting_date":"2026-08-12",
       "content":"<p>Isi uji.</p>","tags":["Uji"]}]}'
```

Harus balas `{"ok":true,"mode":"delta","published":1,...}` dan **tidak** ada e-mail
yang masuk. Hapus artikel ujinya lewat `workflow_dispatch` (full sync akan
mem-prune apa pun yang tidak ada di repo).

Cek token juga benar-benar menjaga: request yang sama tanpa header harus `403`.

### d. End-to-end

1. Bikin `articles/<slug-baru>/` isi `<slug-baru>-id.md` dan `<slug-baru>-en.md`, push ke `main`
2. Action hijau; log step `Publish updated articles` menampilkan balasan n8n
3. `https://daffathan-labs.my.id/id/articles/<slug>` langsung hidup
   (halaman daftar artikel dan sitemap menyusul sampai 1 jam — ISR, itu normal)
4. E-mail preview masuk; buka `previewUrl` di HP, periksa kelima slide
5. Klik **Approve** → e-mail hasil berisi permalink LinkedIn dan Instagram

### e. Uji anti-double

Edit satu typo di artikel yang sama, push lagi. Website ikut ter-update, **tidak ada
e-mail preview**. Ini yang menahan artikel lama dari ter-posting berulang kali.

---

## Kalau ada yang salah

| Gejala | Sebabnya |
|---|---|
| Action merah, `HTTP 403` | `N8N_WEBHOOK_TOKEN` beda dengan value di kredensial Header Auth |
| Action merah, `HTTP 400 property ... should not exist` | ada field asing di payload artikel; `/articles` memakai `forbidNonWhitelisted` |
| Action hijau tapi tidak ada e-mail | `new_folders` kosong — folder tidak semua `.md`-nya berstatus `A`. Cek `git diff --name-status HEAD~1 HEAD -- articles/` |
| E-mail `RENDER GAGAL 8x` | render gagal 8 ronde berturut-turut. Kalau errornya `overflow` padahal font sudah menyusut ke 70%, masalahnya di template `Rakit slide`, bukan di isi artikel. Kalau bukan 422, cek `GET /health` render-svc |
| Tombol Approve tidak melakukan apa-apa | eksekusi sudah lewat 48 jam dan Wait node kedaluwarsa |
| LinkedIn gagal, Instagram terbit | token LinkedIn kedaluwarsa (60 hari). Kedua cabang memang sengaja tidak saling menjatuhkan |
| Semua slide berlatar sama | sebagian panggilan Gemini gambar gagal dan slide yang gagal meminjam raster tetangga; jumlahnya disebut di e-mail preview |

## Batasan yang disengaja

- **Satu artikel per eksekusi.** Kalau satu push membawa dua artikel baru, yang kedua
  disebut namanya di e-mail preview dan tidak diproses. Push ulang atau jalankan
  workflow manual untuk sisanya.
- **Tidak ada backlog cron.** 44 artikel lama tidak akan pernah ter-posting otomatis.
- **`workflow_dispatch` tidak pernah mem-posting ke sosmed.** Mode itu memakai
  `/articles/sync` yang destruktif (menghapus artikel yang tidak ada di payload) dan
  hanya untuk memperbaiki keadaan website.
- **Push di luar `main` tidak mem-publish sama sekali.**

## Mengubah workflow

`n8n/portofolio-publish.json` adalah **hasil build**, bukan sumber. Sumbernya di
`n8n/src/`: `build.mjs` plus tiap Code node sebagai berkas `.js` sendiri, prompt, dan
badan e-mail. Menyunting JSON-nya langsung akan tertimpa pada build berikutnya.

```bash
node n8n/src/build.mjs n8n/portofolio-publish.json
node --test n8n/portofolio-publish.test.mjs
```

Build menghasilkan dua berkas (versi placeholder dan `.local.json`) dan menyisipkan dua
hal dari luar `n8n/src/`:

| Disisipkan | Dari | Ke |
|---|---|---|
| Profil voice | `docs/voice.md` | placeholder `{{VOICE}}` di `prompt-copy.txt` |
| Logo hexagon | `icons/icon-192.png` | placeholder `{{LOGO}}` di `rakit-slide.js`, sebagai data URI |

Keduanya disisipkan saat build supaya tidak ada salinan kedua yang diam-diam berbeda.
Ubah `docs/voice.md`, jalankan build, prompt ikut berubah.

Catatan soal `docs/voice.md`: **seluruh isinya** dikirim ke model. Tulis sebagai aturan
yang bisa diikuti, jangan sebagai catatan tentang berkasnya sendiri — dan jangan menulis
literal `{{VOICE}}` di dalamnya, karena itu menyisipkan ulang placeholder-nya.

Kalau workflow diubah lewat UI n8n, salin balik perubahannya ke `n8n/src/` — jangan cuma
men-download JSON-nya.
