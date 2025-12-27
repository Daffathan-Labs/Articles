<!-- title: Docker ke Kubernetes — Perjalanan Pelan tapi Pasti Menuju DevOps yang Masuk Akal -->
<!-- excerpt: Catatan reflektif dan teknis tentang perjalanan belajar Docker, Kubernetes, dan Cloud dari sudut pandang engineer yang mengalami langsung kebingungan, keterbatasan hardware, sampai akhirnya paham kenapa semuanya saling melengkapi. -->
<!-- image: https://github.com/user-attachments/assets/placeholder-k8s-docker -->
<!-- date: 2025-12-27 -->
<!-- posting_date: 2025-12-27 -->
<!-- tags: Docker, Kubernetes, Cloud Computing, DevOps, Engineering Journey -->

# 🐳 Docker ke ☸️ Kubernetes  
## Perjalanan Pelan tapi Pasti Menuju DevOps yang Masuk Akal

Pertama kali kerja, aku **langsung ditampar realita**.

Bayangkan:
- anak magang  
- baru lulus SMK  
- modal bisa **Laravel saja**  
- tiba-tiba harus berhadapan dengan:
  - Docker  
  - Golang  
  - Vue.js  
  - dan tuntutan waktu yang sangat cepat  

Seharusnya panik.  
Tapi yang aku rasakan justru **excited**.

Karena akhirnya aku menyentuh teknologi yang dulu, saat sekolah, hanya jadi keinginan tanpa tahu kapan bisa benar-benar dicoba.

Dan dari situlah semuanya dimulai.

---

## 🐳 Pertemuan Pertama dengan Docker

Docker adalah teknologi pertama yang membuat aku berpikir:

> *“Oh… ternyata begini cara aplikasi diperlakukan secara serius.”*

Bukan lagi sekadar:
- `php artisan serve`
- upload ke shared hosting
- lalu berharap semuanya aman

Tapi mulai mengenal:
- image  
- container  
- environment yang konsisten  
- deployment yang bisa diulang kapan saja  

Sejak itu, Docker bukan sekadar tools.  
Docker menjadi **cara berpikir**.

---

## 🧠 Mendalami Docker (dan Tanpa Sadar Ketagihan)

Tanpa terasa:
- 1 tahun  
- 2 tahun  
- 3 tahun  

Docker masih terus menemani perjalananku.

Bahkan sampai artikel ini ditulis, aku **masih terus belajar Docker**.

Ada satu momen yang cukup lucu tapi jujur menggambarkan kondisinya:

> Saat kelas di kampus,  
> aku sedang update server,  
> mengatur `docker-compose.yml` lewat terminal.  
>  
> Temanku berkata:  
> **“Lebih seru lihat lu daripada kelas ini.”**

Di situ aku sadar, ini bukan sekadar kerja.  
Ini sudah menjadi **ketertarikan yang serius**.

---

## 🚧 Ingin Naik Level, Tapi Kena Realita Hardware

Dari Docker, keinginanku jelas:
➡️ Kubernetes  
➡️ Cloud Service  

Namun realita tidak selalu sejalan dengan keinginan.

Pernah suatu kali bosku berkata:

> *“Kalau mau main ke sana, harus ganti laptop dulu fa.”*

Maksudnya jelas:
- Kubernetes dan Cloud sangat memang **Linux / macOS** banget
- Laptop yang aku gunakan adalah **laptop gaming Windows**
- Dual boot? Storage sudah penuh
- Full Linux? Hampir mustahil

Akhirnya, selama kurang lebih **3 tahun**, aku tertahan di Docker.

Bukan karena tidak mau lanjut,  
tetapi karena **keterbatasan teknis dan kondisi nyata**.

---

## ☸️ Akhirnya Masuk ke Kubernetes

Setelah melewati fase itu, akhirnya aku memutuskan untuk mencoba Kubernetes dengan WSL pada windows saja, sisanya aku belajar di VPS atau bahkan cloud service langsung.  

satu hal yang pasti, jka ingin belajar kubernetes, maka docker harus mahir dulu. Karena sintaks nya berbeda, namun konsep nya kurang lebih sama.

Saat akhirnya benar-benar belajar Kubernetes, satu hal langsung terasa jelas:

> *Docker adalah pondasi. Kubernetes adalah sistem yang menghidupkan pondasi itu di skala nyata.*

Kubernetes bukan sekadar:
- menjalankan container  
- expose service  

Tetapi tentang:
- auto healing  
- auto scaling  
- rolling update tanpa downtime  
- pemanfaatan resource yang optimal  
- sistem deklaratif  

Di titik ini aku paham:  
**Docker dan Kubernetes bukan saingan.**  
Mereka saling melengkapi.

---

## 🏗️ Kapan Kubernetes Benar-Benar Dibutuhkan?

Ini bagian yang sering disalahpahami.

Kubernetes **bukan** untuk:
- landing page sederhana  
- web statis  
- project kecil tanpa traffic  

Kubernetes **masuk akal** untuk:
- marketplace  
- online shop  
- POS  
- aplikasi kampus  
- sistem dengan ribuan pengguna  
- aplikasi yang *tidak boleh downtime*  

Karena Kubernetes:
- memanfaatkan resource server secara maksimal  
- scaling otomatis  
- update tanpa menghentikan layanan  
- load balancing tanpa konfigurasi manual yang rumit  

---

## 🐳 Lalu Docker Sendiri di Mana Posisinya?

Docker sendiri:
- membuat aplikasi berbasis container  
- memastikan environment konsisten  
- mempermudah CI/CD  

Namun:
- scaling masih manual  
- penggantian versi tetap perlu campur tangan  
- downtime masih mungkin terjadi  

Docker **kuat**, tapi **belum cukup** untuk sistem skala besar.

---

## 🤝 Docker dan Kubernetes: Bukan Pilih Salah Satu

Di sinilah semuanya terasa masuk akal.

Docker:
- membangun image  
- mendefinisikan runtime aplikasi  

Kubernetes:
- mengatur lifecycle  
- scaling  
- healing  
- distribusi traffic  

Cloud:
- infrastruktur elastis  
- managed service  
- observability  
- lingkungan production-ready  

Ketiganya bukan jalur terpisah,  
tetapi **satu perjalanan yang berkesinambungan**.

---

## ☁️ Cloud Service: Tahap yang Datang Paling Akhir

Secara jujur, ada sedikit penyesalan:

> *Kenapa dulu tidak mengambil Cloud Computing saat Studi Independen Bangkit?*

Karena setelah memahami:
- Docker  
- Kubernetes  

Cloud tidak lagi terasa:
- menakutkan  
- terlalu mahal  
- terlalu kompleks  

Justru terasa sebagai:
- langkah berikutnya yang alami  
- tempat semua konsep DevOps bertemu  

---

## ❓ Kesulitan dan Pertanyaan yang Aku Alami

Selama belajar, pertanyaan yang muncul sangat banyak:

- Kenapa HPA tidak jalan walaupun YAML terlihat benar?
- Kenapa metrics server wajib untuk autoscaling?
- Apa bedanya pod, service, deployment, dan ingress?
- Kenapa autoscaling berbasis memory sering jadi jebakan?
- Kenapa Kubernetes terasa ribet di awal tapi sangat rapi setelah dipahami?
- Kapan harus berhenti di Docker, dan kapan harus naik ke Kubernetes?

Semua pertanyaan itu tidak langsung terjawab.  
Sebagian justru baru terasa jelas setelah **mengalami error berulang kali**.

---

## 🌱 Refleksi Akhir

Perjalanan dari Docker ke Kubernetes bukan perjalanan instan.

Ini tentang:
- kesabaran  
- keterbatasan  
- realita hardware  
- dan proses memahami sistem secara menyeluruh  

Namun satu hal yang pasti:

> *Jika Docker, Kubernetes, dan Cloud sudah dipahami bersama, perjalanan DevOps menjadi jauh lebih terang.*

Bukan karena semuanya mudah,  
tetapi karena akhirnya **setiap komponen punya tempat dan alasan**.

Dan bagiku, perjalanan ini masih terus berjalan.
