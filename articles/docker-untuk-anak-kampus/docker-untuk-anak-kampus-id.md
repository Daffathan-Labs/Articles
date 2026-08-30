<!-- title: Docker untuk Anak Kampus — Satu PC Lab, 40 Mahasiswa, Nol Bentrok -->
<!-- excerpt: Panduan langkah demi langkah memakai Docker buat mahasiswa SE, DS, dan AI yang harus install skripsi di satu PC lab bersama. Lengkap dengan studi kasus dari repo yang benar-benar jalan, plus jalur GitHub Actions buat yang tidak mau install Docker di laptop sendiri. -->
<!-- image: https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/docker-untuk-anak-kampus/hero.jpg -->
<!-- date: 2026-08-31 -->
<!-- posting_date: 2026-08-31 -->
<!-- tags: Docker, Docker Compose, GitHub Actions, DevOps, Tutorial -->

# 🐳 Docker untuk Anak Kampus
## Satu PC Lab, 40 Mahasiswa, Nol Bentrok

<img width="800" alt="Docker untuk Anak Kampus — Satu PC Lab, 40 Mahasiswa, Nol Bentrok" src="https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/docker-untuk-anak-kampus/hero.jpg" />

Ada satu PC lab. Ada 40-an mahasiswa yang harus install skripsi di situ.

Coba bayangkan kalau semuanya install manual. Kamu butuh PHP 8.3, teman sebelah butuh PHP 7.4. Kamu butuh Python 3.11, teman kamu butuh Python 3.9 karena library-nya belum support. Ada yang butuh MySQL 8, ada yang butuh PostgreSQL 18. Satu orang install ulang PHP, tiga skripsi lain langsung mati.

Belum lagi waktunya. Install PHP, install Composer, install Node, install MySQL, bikin database, import SQL, atur `.env`, benerin permission folder `storage`. Satu orang habis 45 menit kalau lancar. Kali 40. Itu 30 jam, dan itu skenario optimis.

Docker menyelesaikan dua-duanya sekaligus. Artikel ini menjelaskan caranya dari nol, dengan contoh dari repo yang memang jalan, bukan contoh karangan.

---

## ⚡ Buru-buru? Lima perintah ini dulu

Kalau proyeknya sudah punya `Dockerfile`, kamu tidak perlu membaca seluruh artikel ini sekarang. Jalankan lima baris di bawah, lalu balik lagi ke sini waktu ada yang aneh.

```bash
git clone <url-repo> && cd <nama-folder>    # 1. ambil kodenya
docker compose pull                         # 2. tarik image jadi
docker compose -p namamu up -d              # 3. nyalakan
docker compose -p namamu logs -f            # 4. lihat apa yang terjadi
docker compose -p namamu down               # 5. matikan kalau sudah selesai
```

Ganti `namamu` dengan namamu sendiri, dan ubah nomor port di `docker-compose.yml` kalau ada teman yang sudah memakainya. Dua hal itu penyebab gagal paling sering di komputer bersama, dan keduanya dibahas di [Aturan main di PC lab](#lab).

### Isi artikel

1. [Docker itu apa sih](#konsep), analogi, beda image dan container dan volume, kenapa industri memakainya
2. [Cara kerjanya](#cara-kerja), isi `Dockerfile` dan `docker-compose.yml` baris per baris
3. [Yang harus disiapkan](#persiapan), di PC lab dan di laptop sendiri
4. [Bangun di laptop, jalankan di lab](#build), termasuk jalur GitHub Actions kalau tidak mau install Docker
5. [Aturan main di PC lab bersama](#lab), soal port, nama container, dan `-p`
6. [Studi kasus SE](#se), Laravel dengan MySQL, dan stack empat container
7. [Studi kasus DS dan AI](#ds), Flask dengan React, dan cara memperlakukan model besar
8. [Perintah harian](#perintah)
9. [Kalau error](#error), tabel pesan error beserta sebabnya

---

<a id="konsep"></a>

# 🍱 Docker itu apa sih

Bayangkan kamu pesan makanan lewat aplikasi.

Kamu tidak perlu tahu dapurnya pakai kompor merek apa, gasnya berapa kilo, atau wajannya seberapa besar. Makanannya datang dalam wadah tertutup, siap makan, dan rasanya sama persis dengan yang dimakan orang lain di kota lain.

Docker melakukan hal yang sama untuk aplikasi. Aplikasi kamu dibungkus bersama semua yang dia butuhkan (versi PHP-nya, versi Python-nya, library-nya, konfigurasinya) ke dalam satu wadah tertutup. Wadah itu jalan sama persis di laptop kamu, di PC lab, dan di server.

Kalimat "di laptop aku jalan kok, Pak" berhenti jadi alasan, karena sekarang kamu mengirim laptopnya sekalian.

## Tiga kata yang wajib kamu bedakan

Banyak yang bingung karena tiga kata ini kelihatan mirip. Padahal beda jauh.

| Kata | Analoginya | Sifatnya |
|---|---|---|
| **Image** | Resep + bahan yang sudah dibelanjain | Diam, tidak berubah, bisa dibagi |
| **Container** | Masakan yang lagi disajikan di meja | Hidup, jalan, bisa dimatikan |
| **Volume** | Kulkas | Isinya tetap ada walau masakannya dibuang |

Satu image bisa dipakai untuk menjalankan sepuluh container sekaligus. Container dihapus, image-nya tetap ada. Data di volume juga tetap ada, itu sebabnya database kamu tidak hilang tiap kali container di-restart.

Kalau kamu anak DS atau AI dan pernah pakai `venv` atau `conda`, cara pikirnya mirip. Bedanya Docker mengisolasi lebih dalam: bukan cuma paket Python-nya, tapi juga versi Python-nya, library sistem seperti `libgl` yang sering diminta OpenCV, sampai versi database-nya.

## Kenapa industri sudah tidak menawar soal ini

Empat alasan, dan semuanya terasa langsung di kampus:

**Versi tidak saling tabrak.** Satu mesin bisa menjalankan PHP 8.3, Python 3.11, dan Node 22 bersamaan tanpa satu pun saling ganggu. Persis masalah PC lab kamu.

**Onboarding jadi hitungan menit.** Anak baru masuk tim, `git clone`, `docker compose up -d`, sudah jalan. Tanpa dokumen setup 12 halaman yang selalu ketinggalan zaman.

**Yang diuji sama dengan yang dipakai.** Image yang lolos testing adalah image yang sama persis yang naik ke production. Bukan versi yang mirip, tapi yang sama.

**Deploy bisa dibalik.** Versi baru bermasalah? Tarik image versi sebelumnya, jalankan, selesai. Tidak ada acara install ulang server jam dua pagi.

Sekarang hampir semua lowongan backend, data engineer, dan ML engineer menulis Docker di syaratnya. Bukan karena keren, tapi karena tim tidak punya waktu mengurus laptop yang beda-beda.

---

<a id="cara-kerja"></a>

# ⚙️ Cara kerjanya: dua berkas, dua tugas

Cuma ada dua berkas yang perlu kamu pahami.

## 1. `Dockerfile` — resep untuk membangun satu image

`Dockerfile` menjawab satu pertanyaan: **"aplikasi ini butuh apa saja supaya bisa jalan?"**

Dibaca dari atas ke bawah, satu baris satu langkah. Setiap baris menghasilkan satu lapisan yang disimpan Docker. Lapisan yang tidak berubah dipakai ulang, itu sebabnya build kedua jauh lebih cepat daripada build pertama.

| Perintah | Artinya |
|---|---|
| `FROM` | Mulai dari image orang lain. Selalu baris pertama. |
| `WORKDIR` | Pindah ke folder kerja di dalam container |
| `COPY` | Salin berkas dari komputer kamu ke dalam image |
| `RUN` | Jalankan perintah **saat membangun** image |
| `ENV` | Pasang environment variable |
| `EXPOSE` | Catatan port yang dipakai aplikasi |
| `CMD` | Perintah yang jalan **saat container dinyalakan** |

Beda `RUN` dan `CMD` sering bikin orang tersandung. `RUN npm install` jalan sekali waktu membangun image. `CMD ["node", "server.js"]` jalan tiap kali container dinyalakan. Salah menaruh, aplikasi kamu tidak akan pernah hidup.

Urutannya juga bukan selera. Perhatikan pola ini, hampir semua Dockerfile bagus memakainya:

```dockerfile
COPY package*.json ./     # salin daftar belanja dulu
RUN npm install           # belanja
COPY . .                  # baru salin kode
```

Kalau `COPY . .` ditaruh duluan, setiap kali kamu mengubah satu huruf di kode, Docker menganggap semuanya berubah dan mengulang `npm install` dari nol. Dengan urutan di atas, `npm install` cuma diulang kalau `package.json` benar-benar berubah. Selisihnya bisa 5 menit lawan 5 detik.

## 2. `docker-compose.yml` — daftar pesanan untuk beberapa container

Satu `Dockerfile` mengurus satu aplikasi. Tapi skripsi kamu jarang cuma satu aplikasi. Biasanya ada backend, ada frontend, ada database, kadang ada nginx di depannya.

`docker-compose.yml` menjawab pertanyaan kedua: **"container apa saja yang harus hidup bareng, dan bagaimana mereka saling kenal?"**

Isinya kira-kira begini:

```yaml
services:          # daftar container yang mau dijalankan
  nama_service:
    image: ...     # pakai image jadi dari Docker Hub
    build: .       # ATAU bangun sendiri dari Dockerfile di folder ini
    ports:         # "port_di_komputermu:port_di_dalam_container"
      - "8080:80"
    environment:   # setelan yang dibaca aplikasi
      KEY: value
    volumes:       # folder yang isinya diawetkan
      - data:/var/lib/mysql
    depends_on:    # tunggu service lain nyala duluan
      - db
    networks:      # jaringan privat antar container
      - jaringanku
```

Satu hal yang bikin compose enak: **container saling memanggil pakai nama service**, bukan pakai IP. Kalau service database kamu bernama `db`, maka dari backend cukup tulis `db:3306`. Tidak ada IP yang berubah-ubah, tidak ada `localhost` yang salah sasaran.

Dan `localhost` di dalam container itu **container itu sendiri**, bukan komputer kamu. Ini kesalahan nomor satu pemula: backend disuruh connect ke `localhost:5432`, padahal database-nya ada di container tetangga. Yang benar `postgres:5432`, mengikuti nama service-nya.

---

<a id="persiapan"></a>

# 🧰 Yang harus kamu siapkan

## Kalau kamu pakai PC lab

PC lab sudah punya Docker Desktop dan WSL. Kamu tidak perlu install apa pun. Yang kamu bawa cuma:

1. **Folder atas namamu sendiri**, isinya program, database, dan instruksi instalasi. Aturan ini lazim di lab yang dipakai bersama, dan alasannya masuk akal: kalau semua numpuk di satu folder, tidak ada yang tahu punya siapa.
2. **Akun Docker Hub** kalau kamu mau menarik image buatanmu dari internet.
3. **Nomor port yang tidak dipakai orang lain.** Bagian ini dibahas khusus di bawah, jangan dilewat.

## Kalau kamu mau coba di laptop sendiri

**Windows:** install Docker Desktop, lalu aktifkan WSL 2 waktu diminta. Docker Desktop yang mengurus WSL-nya, kamu tinggal klik. Butuh Windows 10 versi 2004 ke atas dan virtualisasi yang menyala di BIOS. RAM 8 GB masih cukup, 16 GB baru lega.

**macOS:** install Docker Desktop. Perhatikan chip kamu, ada installer untuk Apple Silicon dan ada untuk Intel.

**Linux:** install Docker Engine plus plugin Compose. Jangan lupa `sudo usermod -aG docker $USER` lalu logout, supaya kamu tidak perlu `sudo` tiap perintah.

Cek berhasil atau tidak dengan dua perintah:

```bash
docker --version
docker compose version
```

Perhatikan `docker compose` ditulis tanpa strip. Tutorial lama menulis `docker-compose` pakai strip, itu versi lawas yang sudah pensiun. Kalau contoh yang kamu ikuti masih pakai strip dan errornya aneh, kemungkinan besar tutorialnya sudah kedaluwarsa.

---

<a id="build"></a>

# 🏗️ Alurnya: bangun di laptop, jalankan di lab

Build di PC lab itu ide buruk. Build berarti mengunduh base image, install dependency, dan compile. Untuk Laravel dengan `composer install` plus `npm run build`, itu 5 sampai 15 menit. Kalau 40 mahasiswa membangun bergantian di satu PC, satu hari habis dan tidak ada yang selesai.

Jadi pisahkan: **bangun sekali di tempat lain, jalankan berkali-kali di lab.**

```
[ Laptop kamu ]                    [ Docker Hub ]              [ PC Lab ]
docker build          ──push──>    image tersimpan   ──pull──>  docker compose up
(5-15 menit, sekali)                                            (30 detik, tinggal jalan)
```

## Jalur A: build di laptop sendiri

Empat perintah, sekali seumur skripsi (diulang cuma kalau kode berubah).

```bash
# 1. Login sekali saja
docker login

# 2. Bangun image, kasih nama sesuai akun Docker Hub kamu
docker build -t namakamu/skripsi-app:1.0 .

# 3. Kirim ke Docker Hub
docker push namakamu/skripsi-app:1.0

# 4. Di PC lab, tinggal tarik dan jalankan
docker compose pull
docker compose up -d
```

Format namanya wajib `namaakun/namaimage:tag`. Salah format, `docker push` menolak dengan pesan soal repository yang tidak ditemukan, dan pesannya tidak menyebut bahwa masalahnya ada di penamaan.

Soal tag: **jangan cuma pakai `latest`.** Beri nomor versi seperti `1.0`, `1.1`, `1.2`. Waktu versi 1.2 rusak di depan dosen, kamu tinggal ganti satu angka jadi `1.1` dan hidup kembali. Dengan `latest` saja, kamu tidak punya jalan pulang.

## Jalur B: tidak mau install Docker di laptop, pakai GitHub Actions

Laptop kamu berat, RAM 4 GB, atau kamu memang malas install Docker Desktop. Tidak masalah. **GitHub yang membangunkan image-nya untukmu, gratis.**

Kamu cuma perlu push kode. Server GitHub yang mengunduh base image, install dependency, membangun, lalu mengirim hasilnya ke Docker Hub. Laptop kamu tidak melakukan apa-apa selain `git push`.

Buat berkas `.github/workflows/docker-build.yml`:

```yaml
name: Build & Push Image

on:
  push:
    branches:
      - master        # ganti kalau branch utamamu bernama main

env:
  IMAGE_NAME: namakamu/skripsi-app
  IMAGE_VERSION: 1.0.0

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Ambil kode
        uses: actions/checkout@v4

      - name: Siapkan Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login ke Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Bangun dan kirim
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ env.IMAGE_VERSION }}
            ${{ env.IMAGE_NAME }}:latest
```

Sebelum jalan, daftarkan dua secret di repo GitHub kamu lewat **Settings → Secrets and variables → Actions → New repository secret**:

| Nama secret | Isinya |
|---|---|
| `DOCKERHUB_USERNAME` | username Docker Hub kamu |
| `DOCKERHUB_TOKEN` | Access Token dari Docker Hub, **bukan password akun** |

Ambil token-nya di Docker Hub lewat **Account Settings → Personal access tokens → Generate new token**, kasih izin Read & Write. Token bisa dicabut kapan saja tanpa mengganggu akunmu, password tidak bisa. Dan jangan pernah menulis token itu langsung di dalam berkas YAML, karena berkas itu ikut ter-commit dan bisa dibaca siapa pun.

Setelah `git push`, buka tab **Actions** di repo kamu. Kalau centangnya hijau, image kamu sudah ada di Docker Hub. Di PC lab tinggal `docker compose pull` dan `up -d`.

Skripsi aku memakai pola yang sama, cuma lebih panjang karena ada pemindaian keamanan dan deploy otomatis. Kalau mau lihat versi lengkapnya, ada di [`.github/workflows/main.yml`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/.github/workflows/main.yml). Lima tahap berurutan: Trivy memindai kode, image dibangun dan dikirim, Trivy memindai image jadinya, hasilnya di-deploy lewat SSH tanpa downtime, lalu OWASP ZAP menembaki aplikasi yang sudah hidup. Untuk keperluan kampus kamu cukup pakai tahap kedua saja.

---

<a id="lab"></a>

# 🚦 Aturan main di PC lab yang dipakai bareng

Bagian ini yang paling sering dilewat, dan paling sering bikin ribut.

## Port tidak boleh sama

Dua container tidak bisa memakai port yang sama di satu mesin. Kalau punyamu `8080:80` dan teman kamu juga `8080:80`, yang kedua langsung gagal dengan pesan `port is already allocated`.

Pakai NIM kamu sebagai penentu. Ambil dua digit terakhir, tambahkan ke 8000:

```yaml
ports:
  - "8042:80"     # NIM berakhiran 42
```

Angka di **kiri** yang harus unik antar mahasiswa. Angka di kanan adalah port di dalam container, dan itu urusan aplikasimu sendiri, biarkan apa adanya.

## Nama container juga tidak boleh sama

Perhatikan baris ini, sering ada di contoh yang kamu salin:

```yaml
container_name: laravel_app
```

Kalau dua orang menjalankan compose yang sama, yang kedua gagal karena namanya sudah dipakai. Solusinya pilih salah satu: hapus baris `container_name`, atau tempelkan namamu.

```yaml
container_name: laravel_app_daffa
```

## Cara paling rapi: pakai nama proyek

Docker Compose bisa memberi ruang sendiri untuk tiap orang lewat `-p`:

```bash
docker compose -p daffa up -d
docker compose -p daffa down
```

Semua container, jaringan, dan volume kamu otomatis diberi awalan `daffa_`, jadi tidak bertabrakan dengan siapa pun. Syaratnya cuma satu: **hapus dulu baris `container_name`**, karena nama yang dipatok manual mengalahkan penamaan otomatis ini.

Yang perlu diingat, `-p` harus ditulis tiap kali. Lupa menulisnya waktu `down`, yang kamu matikan bisa jadi punya orang lain.

## Beresin setelah selesai

PC lab dipakai bergantian. Kalau sudah selesai, matikan punyamu:

```bash
docker compose -p daffa down          # matikan, data di volume tetap aman
docker compose -p daffa down -v       # matikan sekalian buang datanya
```

Hati-hati dengan `-v`. Dia menghapus volume, artinya isi database kamu hilang. Pakai itu cuma kalau kamu memang mau mulai dari database kosong.

---

<a id="se"></a>

# 💻 Studi kasus SE

## Kasus 1: Laravel + MySQL (Browstime)

Repo: [`daffa09/E-Commerce-Browstime`](https://github.com/daffa09/E-Commerce-Browstime/tree/dev) (branch `dev`)
Berkasnya: [`Dockerfile`](https://github.com/daffa09/E-Commerce-Browstime/blob/dev/Dockerfile) dan [`docker-compose.yml`](https://github.com/daffa09/E-Commerce-Browstime/blob/dev/docker-compose.yml)

Ini contoh paling pas buat anak SE yang skripsinya Laravel. Dua container: aplikasinya sendiri dan MySQL.

Mari bedah `Dockerfile`-nya:

```dockerfile
FROM dunglas/frankenphp:php8.3-alpine
```
Mulai dari image yang sudah berisi PHP 8.3 dan web server FrankenPHP. Kamu tidak perlu install PHP, tidak perlu install Nginx, tidak perlu mengatur PHP-FPM. `alpine` berarti versi Linux yang kecil, ukurannya jauh lebih hemat.

```dockerfile
WORKDIR /app
```
Semua perintah berikutnya jalan di folder `/app` di dalam container.

```dockerfile
RUN install-php-extensions \
    pdo_mysql mbstring exif pcntl bcmath gd intl zip \
    && apk add --no-cache unzip git curl nodejs npm
```
Pasang ekstensi PHP yang diminta Laravel. `pdo_mysql` untuk nyambung ke MySQL, `gd` untuk olah gambar, `intl` untuk format tanggal dan mata uang. Lalu `apk add` memasang perkakas level sistem, termasuk Node dan npm karena aset frontend-nya perlu di-build. `--no-cache` mencegah sisa unduhan menumpuk di dalam image.

```dockerfile
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
```
Ambil Composer dari image resminya, tidak usah install manual. Satu baris, selesai.

```dockerfile
COPY . /app
RUN composer install --no-dev --optimize-autoloader
RUN npm ci && npm run build
```
Salin kode, pasang dependency PHP, bangun aset frontend. `--no-dev` membuang paket yang cuma dipakai waktu development seperti PHPUnit, jadi image-nya lebih ramping. `npm ci` mengikuti `package-lock.json` persis, beda dengan `npm install` yang masih boleh menaikkan versi.

```dockerfile
RUN chown -R www-data:www-data /app/storage /app/bootstrap/cache
```
Laravel menulis log dan cache ke dua folder itu. Tanpa baris ini kamu akan bertemu `Permission denied` yang legendaris itu.

Sekarang `docker-compose.yml`-nya:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
```
`build` berarti bangun sendiri dari Dockerfile di folder ini. Bandingkan dengan `image:` yang berarti tarik jadi dari Docker Hub. **Untuk PC lab, ganti bagian ini jadi `image:`** supaya tidak perlu build di sana.

```yaml
    ports:
      - "8080:80"
```
Buka `localhost:8080` di browser, sampai ke port 80 di dalam container. **Ini angka yang harus kamu ubah** kalau dipakai bareng orang lain.

```yaml
    volumes:
      - ./.env:/app/.env
```
Sisipkan berkas `.env` dari luar ke dalam container. Gunanya supaya kamu bisa mengubah konfigurasi tanpa membangun ulang image.

```yaml
    depends_on:
      - db
```
Nyalakan `db` dulu baru `app`. Perlu dicatat, ini cuma mengatur urutan menyalakan, bukan menunggu MySQL benar-benar siap menerima koneksi. Contoh yang menunggu beneran ada di kasus berikutnya.

```yaml
  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: ${DB_DATABASE:-browstime_ecommerce}
      MYSQL_ALLOW_EMPTY_PASSWORD: 1
```
MySQL 8.0 jadi dari Docker Hub. Tanda `${DB_DATABASE:-browstime_ecommerce}` artinya "pakai `DB_DATABASE` kalau ada, kalau tidak ada pakai `browstime_ecommerce`". Password kosong aman selama container ini cuma dipakai lokal, dan jangan pernah bawa setelan itu ke server yang menghadap internet.

```yaml
    volumes:
      - dbdata:/var/lib/mysql
```
Ini kulkasnya. Data MySQL disimpan di volume bernama `dbdata`, jadi container boleh dimatikan dan dibuat ulang tanpa kehilangan isi database.

Cara pakainya:

```bash
git clone -b dev https://github.com/daffa09/E-Commerce-Browstime.git
cd E-Commerce-Browstime
cp .env.example .env
docker compose -p namamu up -d
```

Lalu buka `localhost:8080`. Kalau Laravel mengeluh soal application key, jalankan sekali:

```bash
docker compose -p namamu exec app php artisan key:generate
docker compose -p namamu exec app php artisan migrate --seed
```

`exec` berarti "jalankan perintah ini di dalam container yang sedang hidup". Kamu tidak perlu install PHP atau Artisan di komputermu.

## Kasus 2: empat container sekaligus (skripsi Node + Next.js)

Repo: [`daffa09/emobo-ecommerce-api`](https://github.com/daffa09/emobo-ecommerce-api)
Berkasnya: [`Dockerfile`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/Dockerfile) dan [`deployments/docker-compose.local.yml`](https://github.com/daffa09/emobo-ecommerce-api/blob/master/deployments/docker-compose.local.yml)

Kasus pertama punya dua container. Yang ini punya empat: database, API, tampilan, dan nginx sebagai pintu depan. Skripsi yang backend dan frontend-nya terpisah bentuknya kira-kira begini.

Dockerfile-nya memakai **multi-stage build**, dan ini teknik yang layak kamu tiru:

```dockerfile
# Tahap 1: dapur
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

# Tahap 2: meja saji
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
```

Perhatikan ada **dua** `FROM`. Tahap pertama adalah dapur: semua alat build, TypeScript compiler, dan dependency development ada di sini. Tahap kedua adalah meja saji: cuma hasil masakannya yang dipindahkan, lewat `COPY --from=builder`.

Alat-alat dapurnya ditinggal. Image akhirnya bisa berkurang ratusan megabyte, dan yang lebih penting, compiler tidak ikut naik ke server. Semakin sedikit yang ada di dalam image, semakin sedikit yang bisa dieksploitasi.

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```
Tiap container nyala, migrasi database dijalankan dulu, baru servernya hidup. Skema database selalu cocok dengan kode yang berjalan, tanpa kamu perlu ingat menjalankannya manual.

Compose-nya punya bagian yang layak dicontek. Pertama, **menunggu database benar-benar siap**, bukan sekadar menyala:

```yaml
  postgres:
    image: pgvector/pgvector:pg18
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d emobo_ecommerce -h 127.0.0.1"]
      interval: 5s
      retries: 30

  api:
    depends_on:
      postgres:
        condition: service_healthy
```

`healthcheck` menyuruh Docker memeriksa Postgres tiap 5 detik sampai benar-benar bisa melayani. Lalu `condition: service_healthy` menahan API sampai pemeriksaan itu lulus. Tanpa ini, API sering nyala lebih dulu, gagal connect, lalu mati, dan kamu bingung karena "sudah pakai `depends_on` kok".

Soal image-nya: `pgvector/pgvector:pg18` adalah Postgres 18 yang sudah membawa ekstensi vector. Kalau skripsimu menyimpan embedding untuk pencarian semantik atau fitur AI, kamu butuh ini dan bukan Postgres polos. Aktifkan sekali dengan `CREATE EXTENSION vector;`.

Kedua, **port yang dikunci ke localhost**:

```yaml
  gateway:
    ports:
      - "127.0.0.1:3006:80"
      - "127.0.0.1:5006:81"
```

Awalan `127.0.0.1:` membuat port itu cuma bisa dibuka dari mesin itu sendiri. Tanpa awalan itu, Docker membukanya ke seluruh jaringan, dan siapa pun yang satu WiFi dengan PC lab bisa mengakses aplikasimu. Di lab kampus yang ramai, kebiasaan ini murah dan menyelamatkan.

Cara pakainya:

```bash
git clone https://github.com/daffa09/emobo-ecommerce-api.git
cd emobo-ecommerce-api/deployments
docker compose -f docker-compose.local.yml -p namamu up -d
```

`-f` menunjuk berkas compose yang mana, karena repo ini punya dua. Buka `localhost:3006` untuk tampilannya, `localhost:5006/api/v1` untuk API-nya.

Skema dan data contoh ikut masuk otomatis, lewat bagian ini:

```yaml
    volumes:
      - ../db_schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ../dummy_data.sql:/docker-entrypoint-initdb.d/02-dummy.sql:ro
```

Image Postgres menjalankan semua berkas `.sql` di folder `docker-entrypoint-initdb.d` waktu database dibuat pertama kali, urut sesuai nama. Itu sebabnya berkasnya diberi awalan `01-` dan `02-`. Penanda `:ro` berarti read-only, jadi container tidak bisa mengubah berkas aslimu.

Ini jawaban untuk permintaan "database harus ikut di dalam folder". Tidak perlu ekspor-impor manual, cukup taruh berkas SQL-nya dan biarkan compose yang mengurus.

---

<a id="ds"></a>

# 🤖 Studi kasus DS dan AI

## Flask + React dalam satu compose (EduLaptop Advisor)

Repo: [`daffa09/edulaptop-advisor`](https://github.com/daffa09/edulaptop-advisor)
Berkasnya: [`docker-compose.yml`](https://github.com/daffa09/edulaptop-advisor/blob/master/docker-compose.yml), [`backend/Dockerfile`](https://github.com/daffa09/edulaptop-advisor/blob/master/backend/Dockerfile), [`frontend/Dockerfile`](https://github.com/daffa09/edulaptop-advisor/blob/master/frontend/Dockerfile)

Proyek sistem cerdas: backend Flask yang memuat model, frontend React untuk tampilannya. Bentuk yang sama bisa kamu pakai untuk klasifikasi gambar, rekomendasi, atau chatbot.

Backend-nya sederhana dan itu justru bagus:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
CMD ["flask", "run"]
```

Yang penting buat anak DS:

`python:3.11-slim` mengunci versi Python. Teman kamu boleh pakai 3.9 di container-nya sendiri, dan tidak ada yang bentrok. Inilah yang tadi aku sebut mirip `venv`, tapi lebih dalam.

`COPY requirements.txt` duluan, baru `COPY . .`, mengikuti pola caching yang tadi dibahas. Model dan notebook kamu berubah tiap hari, `requirements.txt` jarang. Dengan urutan ini, `pip install` yang lama itu tidak diulang tiap kali kamu mengubah kode.

`ENV FLASK_RUN_HOST=0.0.0.0` adalah baris yang paling sering ketinggalan. Secara bawaan Flask cuma mendengar `127.0.0.1`, dan di dalam container itu berarti "cuma bisa diakses dari dalam container itu sendiri". Hasilnya container hidup normal, log bersih, tapi browser kamu tidak bisa masuk. Jangan buang waktu menebak, langsung tulis `0.0.0.0`.

Kalau library kamu butuh perkakas sistem, tambahkan sebelum `pip install`. OpenCV misalnya sering minta ini:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
```

Frontend-nya memakai multi-stage juga, dengan pola yang lazim untuk React:

```dockerfile
FROM node:22-alpine AS build
...
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
```

React di-build jadi berkas HTML, CSS, dan JS statis. Setelah itu Node tidak dibutuhkan lagi, cukup nginx yang menyajikan berkas. Image akhirnya kecil sekali, dan tidak ada Node yang ikut nangkring di server.

Compose-nya menyatukan keduanya:

```yaml
services:
  backend:
    image: daffa09/edulaptop-backend:latest
    ports:
      - "5000:5000"
    networks:
      - edulaptop_net

  frontend:
    image: daffa09/edulaptop-frontend:latest
    ports:
      - "8200:80"
    depends_on:
      - backend
    networks:
      - edulaptop_net
```

Dua-duanya memakai `image:`, bukan `build:`. Artinya image sudah dibangun lebih dulu dan tinggal ditarik. **Ini persis pola yang kamu mau di PC lab.**

Jalankan dengan:

```bash
docker compose -p namamu up -d
```

Buka `localhost:8200`. Ingat mengganti `8200` dan `5000` kalau ada teman yang sudah memakainya.

## Model besar jangan dimasukkan ke dalam image

Satu peringatan khusus untuk anak DS dan AI.

Kalau model kamu berukuran ratusan megabyte atau lebih, jangan `COPY` ke dalam image. Image jadi bengkak, push ke Docker Hub jadi lama, dan tiap ganti satu baris kode kamu mengirim ulang model yang sama.

Pasang lewat volume:

```yaml
  backend:
    volumes:
      - ./models:/app/models
```

Model tetap di folder `models` milikmu, container tinggal membacanya. Image kamu ramping, model kamu tetap sampai.

## Latihan: bikin compose sendiri

[`daffa09/chaldea-ai`](https://github.com/daffa09/chaldea-ai) sudah punya dua Dockerfile ([backend Flask](https://github.com/daffa09/chaldea-ai/blob/master/backend/Dockerfile) dan [frontend React](https://github.com/daffa09/chaldea-ai/blob/master/frontend/Dockerfile)) tapi belum punya `docker-compose.yml`.

Coba tulis sendiri. Perhatikan backend-nya `EXPOSE 5005`, bukan 5000, jadi pemetaan port-nya ikut berubah. Bandingkan hasilmu dengan compose milik EduLaptop di atas.

Kalau hasil buatanmu bisa jalan, kamu sudah paham Docker Compose. Kalau macet, baca pesan errornya sampai selesai, karena hampir selalu di situ jawabannya.

---

<a id="perintah"></a>

# 📋 Perintah yang dipakai sehari-hari

```bash
docker compose up -d           # nyalakan semua, -d artinya jalan di belakang
docker compose ps              # lihat mana yang hidup dan mana yang mati
docker compose logs -f api     # baca log service "api" terus-menerus
docker compose down            # matikan semua, data tetap aman
docker compose pull            # tarik image versi terbaru
docker compose restart api     # nyalakan ulang satu service saja

docker ps                      # semua container yang hidup di mesin ini
docker exec -it skripsi-api sh # masuk ke dalam container, keluar dengan exit
docker system df               # cek Docker makan berapa disk
docker system prune -a         # bersih-bersih besar, HATI-HATI
```

Perintah yang paling sering kamu butuhkan adalah `logs`. Container mati sendiri hampir selalu meninggalkan alasannya di log. Baca dulu sebelum menebak.

<a id="error"></a>

# 🔧 Kalau error

| Pesannya | Sebabnya | Yang kamu lakukan |
|---|---|---|
| `port is already allocated` | Port dipakai orang lain | Ganti angka sebelah kiri di `ports` |
| `Cannot connect to the Docker daemon` | Docker Desktop belum jalan | Buka Docker Desktop, tunggu ikonnya hijau |
| Container nyala lalu langsung mati | Aplikasinya crash | `docker compose logs nama_service` |
| Web tidak bisa dibuka padahal container hidup | Aplikasi mendengar di `127.0.0.1` | Ubah jadi `0.0.0.0` di dalam container |
| `connection refused` ke database | Alamatnya salah atau DB belum siap | Pakai nama service, bukan `localhost`. Tambahkan `healthcheck` |
| `denied: requested access to the resource is denied` | Nama image tidak sesuai akunmu | Pastikan formatnya `namaakun/namaimage:tag`, dan sudah `docker login` |
| Build lambat sekali tiap kali | `COPY . .` ditaruh sebelum install | Salin berkas dependency dulu, baru kodenya |
| Disk penuh | Image dan volume lama menumpuk | `docker system df` lalu `docker system prune` |

---

# 🏁 Penutup

Buat teman-teman yang mau install skripsi di lab, ringkasannya begini:

1. Bikin `Dockerfile` untuk aplikasimu, dan `docker-compose.yml` kalau butuh lebih dari satu container.
2. Bangun image-nya di laptop sendiri, atau serahkan ke GitHub Actions kalau laptopmu tidak kuat.
3. Kirim ke Docker Hub dengan nomor versi yang jelas.
4. Di PC lab, `docker compose pull` lalu `up -d`. Selesai dalam hitungan detik.
5. Pakai port dan nama proyek sendiri, dan matikan container kamu setelah selesai.

Satu hal yang layak kamu pegang: jalankan sendiri, jangan menitip ke teman yang sudah bisa. Docker justru membuat itu masuk akal. Yang perlu kamu hafal cuma tiga perintah, sisanya sudah tertulis di dalam repo masing-masing.

Kalau ada yang macet, bawa **pesan errornya**, jangan bawa kalimat "punya aku error". Pesan error Docker biasanya sudah menyebut sebabnya di baris pertama, dan setengah dari pekerjaan memperbaikinya adalah membacanya sampai habis.

Selamat mencoba. Sekali kamu terbiasa, kamu tidak akan mau balik install manual lagi.

---

### Bacaan lanjutan

- [Docker ke Kubernetes: Perjalanan Pelan tapi Pasti Menuju DevOps yang Masuk Akal](https://daffathan-labs.my.id/id/articles/docker-ke-kubernetes-perjalanan-pelan-tapi-pasti-menuju-devops-yang-masuk-akal), buat yang penasaran kelanjutan setelah Docker.
- [Daffathan-Labs: Arsitektur DevOps Production-Grade](https://daffathan-labs.my.id/id/articles/daffathan-labs-arsitektur-devops-production-grade), contoh Docker yang dipakai serius di server beneran.
- [Dokumentasi resmi Docker](https://docs.docker.com/), rujukan utama waktu contoh di internet saling bertentangan.
