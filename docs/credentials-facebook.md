# Kredensial Facebook (carousel ke Halaman)

Hasil akhirnya dua field di node **`Kredensial`**:

| Field | Contoh |
|---|---|
| `fb_page_id` | `102938475610111` |
| `fb_page_token` | `EAA...` — **tanpa tanggal kedaluwarsa** |

Sekitar 15 menit. **Tidak perlu App Review** selama app masih Development mode dan kamu
adminnya, dan **tidak perlu app baru** — pakai app Instagram yang sudah ada.

---

## Ini ke Halaman, bukan profil pribadi

Post tayang atas nama **Halaman**, bukan atas nama profil Facebook pribadi. Teman
Facebook pribadi tidak otomatis melihatnya di feed mereka — yang melihat adalah pengikut
Halaman.

Ini bukan pilihan desain, tapi batas platform:

| | Halaman | Profil pribadi |
|---|---|---|
| Posting lewat API | **bisa** | **tidak bisa, sejak 2018** |
| Izin | `pages_manage_posts` | `publish_actions`, sudah dihapus 24 April 2018 |
| App Review | tidak perlu kalau kamu admin | tidak ada level approval yang membukanya |

Toggle **Accounts Center → Sharing across profiles** di aplikasi Instagram hanya berlaku
untuk posting yang dibuat **di dalam aplikasi**. Posting lewat API tidak ikut
ter-crosspost — sudah diuji langsung dengan satu artikel nyata dan tidak muncul.

Kalau ingin sebuah post sampai ke teman pribadi, bagikan sendiri dari Halaman ke profil.
Satu klik, manual, dan tidak ada API yang menggantikannya.

---

## 0. Prasyarat

- **Halaman Facebook** yang kamu jadi **adminnya**. Kalau belum ada, buat dulu.
- App Meta **`1458175346120052`** (Daffahan Labs).
- **App secret** dari app itu — dipakai **sekali** di langkah 3, lalu dilupakan.
  Ambil di **Pengaturan aplikasi → Dasar → Rahasia aplikasi**.

> **App secret TIDAK BOLEH masuk ke n8n.** Dia bisa mencetak token baru kapan saja, jadi
> bocornya jauh lebih parah daripada token biasa. Dia hanya dipakai di terminal, di
> langkah 3, dan tidak pernah disimpan di mana pun. Ada test yang menolak field bernama
> `*_secret` di node `Kredensial`.

## 1. Tambah use case "Kelola semua hal di Halaman Anda"

**Ini langkah yang paling gampang terlewat, dan gejalanya menyesatkan:**
`pages_manage_posts` tidak muncul sama sekali di dropdown Graph API Explorer — bukan
tampil lalu ditolak. Terlihat seperti izinnya dicabut Meta, padahal cuma belum ditawarkan.

Di dashboard Meta yang sekarang, izin yang tampil di Explorer datang dari **use case**
yang terpasang di app, bukan dari daftar izin global. Tanpa use case Halaman, app cuma
menawarkan `pages_show_list`, `pages_read_engagement`, `ads_*`, `business_management`,
dan `whatsapp_*` — nol izin **tulis** Halaman.

1. <https://developers.facebook.com/apps/1458175346120052/dashboard/> → tombol
   **Tambahkan kasus penggunaan** (kanan atas) → pilih
   **Kelola semua hal di Halaman Anda**.
2. **Kasus penggunaan** (menu kiri) → use case yang baru itu → **Sesuaikan** →
   **Tambahkan** di sebelah `pages_manage_posts` **dan** `business_management`.

Instagram tetap jalan seperti biasa. Satu app boleh punya banyak use case, dan jalur
Instagram Login tidak terpengaruh sama sekali.

## 2. Ambil token pendek dari Graph API Explorer

<https://developers.facebook.com/tools/explorer>

1. **Aplikasi Meta** → pilih `1458175346120052`
2. **Pengguna atau Halaman** → *Token Pengguna*
3. **Izin** → centang **empat** ini:
   - `pages_show_list`
   - `pages_read_engagement`
   - **`pages_manage_posts`** ← ini yang dipakai untuk posting
   - **`business_management`** ← lihat kotak di bawah
4. **Generate Access Token** → login → izinkan → **centang semua Halaman** di layar
   pemilihan

Token yang keluar berumur **1–2 jam**. Itu normal; langkah 3 yang memanjangkannya.

> **Dua sebab Halaman kamu tidak muncul di `/me/accounts`, dan dua-duanya senyap:**
>
> 1. **Tidak dicentang** waktu Generate Access Token. Yang tidak dicentang tidak muncul
>    walaupun kamu adminnya — tanpa pesan error apa pun.
> 2. **Halamannya di bawah Business portfolio.** Enumerasinya butuh `business_management`;
>    tanpa itu `/me/businesses` dibalas `(#100) Missing Permission` dan Halamannya
>    seperti tidak ada.
>
> Verifikasi sebelum lanjut: `GET /me/accounts?fields=id,name,tasks` harus memuat Halaman
> yang kamu maksud, dan `tasks`-nya memuat `CREATE_CONTENT`.

> Kalau nanti izinnya ditambah, **token lama tidak otomatis mendapat izin baru**.
> Tambahkan izinnya dulu, buat tokennya belakangan. Ini jebakan yang sama persis dengan
> `instagram_business_content_publish` di jalur Instagram.

## 3. Tukar jadi token Halaman yang tidak kedaluwarsa

### Cara singkat, tanpa menyentuh app secret

1. <https://developers.facebook.com/tools/debug/accesstoken/> → tempel token dari
   langkah 2 → **Debug**
2. Scroll ke bawah → **Extend Access Token** → keluar token user ±60 hari
3. Lanjut ke 3b memakai token panjang itu

### Cara curl, kalau tombol Extend tidak ada

```bash
APP_ID=1458175346120052
APP_SECRET='...'          # dari langkah 0, jangan disimpan
TOKEN_PENDEK='...'        # dari langkah 2

# 3a) token pendek -> token user panjang (±60 hari)
curl -sG 'https://graph.facebook.com/v25.0/oauth/access_token' \
  -d grant_type=fb_exchange_token \
  -d client_id=$APP_ID \
  -d client_secret=$APP_SECRET \
  -d fb_exchange_token=$TOKEN_PENDEK
```

Salin `access_token` dari balikannya, lalu:

```bash
TOKEN_PANJANG='...'       # hasil 3a

# 3b) token user panjang -> token HALAMAN, tanpa tanggal kedaluwarsa
curl -sG 'https://graph.facebook.com/v25.0/me/accounts' \
  -d fields=id,name,access_token \
  -d access_token=$TOKEN_PANJANG
```

Balikannya daftar semua Halaman yang kamu admin:

```json
{ "data": [ { "id": "1029...", "name": "Daffathan Labs", "access_token": "EAA..." } ] }
```

- `id` → **`fb_page_id`**
- `access_token` → **`fb_page_token`**

Token Halaman hasil pertukaran ini **tidak punya tanggal kedaluwarsa** selama kamu tetap
admin Halaman itu. Jadi Facebook nol perawatan — beda dari Instagram (refresh bulanan,
sudah otomatis) dan LinkedIn (manual tiap 60 hari).

## 4. Verifikasi sebelum dipakai workflow

### `expires_at` harus 0

```bash
curl -sG 'https://graph.facebook.com/v25.0/debug_token' \
  -d input_token=$FB_PAGE_TOKEN \
  -d access_token=$TOKEN_PANJANG
```

Token user panjang dipakai sebagai pemanggil, bukan `"$APP_ID|$APP_SECRET"` — hasilnya
sama dan app secret tidak perlu disentuh lagi.

Yang dicari:

```json
{ "data": { "type": "PAGE", "expires_at": 0, "is_valid": true,
            "scopes": ["pages_show_list","pages_read_engagement","pages_manage_posts"] } }
```

**Kalau `expires_at` bukan 0**, yang terambil adalah token *user*, bukan token *Halaman*
— dan dia mati 60 hari lagi tanpa peringatan apa pun. Ulangi langkah 3b dan ambil
`access_token` dari dalam `data[]`, bukan token yang dipakai memanggilnya.

**Kalau `type` bukan `PAGE`**, sama: yang terambil token user.

### Uji posting tanpa mengotori feed

`published=false` bikin post tercipta tapi tidak tayang.

```bash
# unggah satu foto, jangan diterbitkan
curl -s -X POST "https://graph.facebook.com/v25.0/$FB_PAGE_ID/photos" \
  -d url=https://picsum.photos/1080/1350 \
  -d published=false \
  -d access_token=$FB_PAGE_TOKEN
# -> {"id":"1234..."}

# hapus lagi
curl -s -X DELETE "https://graph.facebook.com/v25.0/1234...?access_token=$FB_PAGE_TOKEN"
```

Kalau ini berhasil, kredensialnya sudah benar. Dua langkah terakhir:

1. Isi `fb_page_id` dan `fb_page_token` di `n8n/src/secrets.local.json` (di-gitignore).
2. `node n8n/src/build.mjs n8n/portofolio-publish.json`, lalu pasang ulang
   `n8n/portofolio-publish.local.json` ke n8n.

Tidak ada langkah manual di kanvas n8n. Saklar `FB_AKTIF` di `n8n/src/build.mjs` sudah
`true`; dia cuma perlu disentuh kalau suatu saat cabang Facebook mau dimatikan lagi —
alasannya di [n8n-setup.md § 3c](n8n-setup.md).

> **Nilai yang terpasang sekarang:** `fb_page_id` = `1253134284553922` (Halaman
> **Daffathan Labs**). Terverifikasi `type: PAGE`, `expires_at: 0`, dan `tasks` memuat
> `CREATE_CONTENT`.

---

## Syarat gambar

Sama seperti Instagram, dan lebih longgar:

| | Facebook | Instagram |
|---|---|---|
| Format | JPEG, PNG, GIF, WebP | **JPEG saja** |
| URL | harus publik, bisa di-cURL Meta | sama |
| Rasio | bebas | 0.8–1.91 |
| Ukuran berkas | ≤ 4 MB (rekomendasi) | ≤ 8 MB |

Workflow mengirim JPEG 1080×1350 hasil render-svc, jadi aman di dua-duanya.

Meta mengunduh gambarnya **sekali** saat container dibuat, lalu menyajikannya dari CDN
sendiri. Jadi render-svc cuma perlu hidup di saat publish; post yang sudah tayang tidak
rusak kalau berkasnya hilang belakangan.

---

## Alur yang dipakai workflow

Facebook tidak punya endpoint "carousel". Yang dipakai adalah pola resmi
unggah-lalu-lampirkan:

```
1. tiap slide:  POST /{page-id}/photos   url=..., published=false   -> id
2. sekali:      POST /{page-id}/feed     message=..., attached_media[0..4]
3. permalink diturunkan dari id balikan: {page-id}_{post-id}
```

`published=false` di langkah 1 itu **wajib**. Tanpa itu tiap slide jadi post sendiri dan
Halaman kebanjiran 5 post untuk satu artikel.

Host-nya `graph.facebook.com` — **bukan** `graph.instagram.com`. Token Instagram kita
dari jalur login Instagram, dan kalau ditembakkan ke host Facebook dibalas `#190
Cannot parse access token`. Dua token, dua host, dan ada test yang menguncinya dua arah.

---

## Tabel error

| Kode | Artinya |
|---|---|
| `#190` | token kedaluwarsa/dicabut — **atau** token jalur Instagram dipakai di host Facebook |
| `#200` | izin kurang. Paling sering `pages_manage_posts` belum dicentang, atau token dibuat **sebelum** izinnya ditambah |
| `#100` | parameter salah. Untuk `/feed`: cek bentuk `attached_media[n]` |
| `#10` | app belum punya izin sama sekali untuk aksi itu |
| `#803` | `fb_page_id` salah, atau token itu bukan token Halaman tersebut |
| `#324` | gambar tidak bisa diambil dari URL yang dikirim — cek URL-nya publik |

Kalau `debug_token` menunjukkan `"type": "USER"`, hampir semua error di atas sebenarnya
satu sebab yang sama: token Halamannya tidak pernah terambil.

---

## Yang tidak perlu

- **App Review** — selama app Development mode dan kamu admin Halamannya.
- **Business Manager** — tidak dipakai jalur ini.
- **Token Instagram** — jalur Facebook punya tokennya sendiri, terpisah penuh.
- **Perpanjangan berkala** — token Halaman tidak kedaluwarsa. Satu-satunya cara dia
  berhenti bekerja adalah kalau akses admin kamu atas Halaman itu dicabut, atau password
  akun diganti.
