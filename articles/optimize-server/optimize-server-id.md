# Diet RAM & Migrasi Awan: Cara Aku Menyelamatkan Server dari Krisis Resource

<img width="1536" height="1024" alt="Infrastruktur Optimasi" src="https://github.com/user-attachments/assets/e768a74e-8e6d-400d-8b02-9946d227a964" />

## **"Ketika Kecepatan Jadi Bencana"**

Awalnya, **aku** bener-bener amaze sama **FrankenPHP**. Stack PHP modern ini kencengnya nggak main-main, apalagi pas aku implementasi di project baru, **Browstime**. Tapi, rasa kagum itu berubah jadi bencana buat ekosistem server aku yang lain.

Karena Browstime yang pake FrankenPHP + MySQL 8.0 ini rakus banget makan resource, project utama aku, **Vinci LMS**, kena imbasnya. Server VPS aku yang cuma 4GB mulai megap-megap. Puncaknya, aku dapet banyak keluhan dari para **Asprak (Asisten Praktikum)** karena Vinci LMS jadi lemot parah.

Aku sadar, kalau dibiarin, seluruh layanan di Daffathan Labs bisa tumbang. Di situlah aku mutusin buat ngelakuin optimasi gila-gilaan.

---

<img width="1920" height="900" alt="Cloudflare Migration" src="https://github.com/user-attachments/assets/6a6d1f1b-2061-470c-86fc-02243272b478" />

# 🔥 Tiga Langkah Krusial Menyelamatkan Resource Server

## **1. Memindahkan Beban Landing Page ke Cloudflare Pages**

Langkah pertama yang aku ambil adalah "membuang" semua beban UI/Frontend dari server utama. Project kyk **Vinci Agent**, **Vinci Gallery**, dan **Vinci LMS UI** yang tadinya jalan di Docker VPS, semuanya aku migrasi ke **Cloudflare Pages**.

Kenapa? Karena kalian nggak perlu buang-buang RAM server cuma buat nge-serve file statis. Dengan Cloudflare Pages:
- Resource RAM di VPS aku berkurang drastis.
- Kecepatan akses landing page jadi lebih kenceng karena pake Edge Network.
- Server aku sekarang cuma fokus buat nanganin API dan logic berat aja.

---

## **2. Resizing Browstime: Migrasi dari MySQL 8 ke MariaDB Alpine**

Masalah terbesar Browstime ada di **MySQL 8.0**. Di environment VPS, MySQL 8 itu ibarat "monster" yang lahap RAM tanpa ampun. Aku sering nemuin log *broken pipe* dan kontainer yang statusnya *unhealthy*.

Akhirnya, aku ngelakuin migrasi total:
- Ganti MySQL 8 ke **MariaDB Alpine**. Kalian harus tau, MariaDB Alpine itu jauh lebih enteng tapi tetep powerfull buat Laravel/FrankenPHP.
- Implementasi **Docker Healthcheck**. Sekarang, kontainer `app` aku nggak bakal jalan sebelum `db` bener-bener siap (healthy).
- Hasilnya? Penggunaan RAM database turun dari 400MB+ jadi cuma **90MB-an** aja!

---

## **3. Penjinakan Monitoring Stack & Implementasi Swap File**

Terakhir, aku audit semua kontainer yang jalan. Ternyata, **cAdvisor** di monitoring stack aku makan RAM sampe **700MB**! Aku langsung tuning interval housekeeping-nya ke 15 detik biar dia nggak terlalu agresif.

Selain itu, aku juga pasang **Swap File 2GB** sebagai "nyawa cadangan".
- **Kelebihannya:** Pas RAM asli 4GB aku penuh, server nggak bakal panik dan matiin kontainer sembarangan (OOM Killer).
- **Hasil Akhir:** RAM server aku sekarang stabil, dan Asprak udah nggak komplain lagi soal Vinci LMS yang lemot.

---

# 🎯 **Kesimpulan**

Pengalaman ini ngajarin aku kalau kenceng aja nggak cukup. Sebagai developer, kita harus pinter ngatur di mana beban resource itu ditaruh. Kalau kalian ngerasa server mulai lemot, coba cek apakah UI kalian masih menumpang di VPS, atau apakah database kalian kegedean buat kapasitas RAM yang ada.

Optimasi yang aku lakukan:
- Migrasi UI ke **Cloudflare Pages**.
- Pakai **MariaDB Alpine** untuk efisiensi RAM.
- Tuning monitoring dan pasang **Swap File**.

Sekarang, server Daffathan Labs bisa napas lega, dan aku bisa lanjut koding tanpa takut dapet notif keluhan lagi!