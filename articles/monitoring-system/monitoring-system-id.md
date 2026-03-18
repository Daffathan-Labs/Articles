<!-- title: Daffathan-Labs — Observability & Monitoring System -->
<!-- excerpt: Perjalanan aku membangun sistem monitoring untuk menghilangkan blind spot dalam arsitektur microservices dan akhirnya benar-benar “melihat” sistem yang berjalan. -->
<!-- image: https://github.com/user-attachments/assets/ca8657a3-4425-4198-9f0a-8870687f7866 -->
<!-- date: 2026-03-18 -->
<!-- posting_date: 2026-03-18 -->
<!-- tags: DevOps, Observability, Grafana, Prometheus, Loki -->

# 🚀 Daffathan-Labs  
## Ketika Sistem Sudah Jalan… Tapi Aku Tidak Bisa Melihatnya

<img width="2752" height="1536" alt="Gemini_Generated_Image_f2ir1ff2ir1ff2ir" src="https://github.com/user-attachments/assets/ca8657a3-4425-4198-9f0a-8870687f7866" />


Awalnya, **aku pikir semuanya sudah cukup.**

- CI/CD sudah otomatis.
- Deployment sudah tanpa downtime.
- Semua service berjalan.

Tapi ternyata ada satu masalah besar yang diam-diam muncul.

> **Aku tidak benar-benar tahu apa yang sedang terjadi di dalam sistemku sendiri.**

---

# 🧠 Titik Sadar

Suatu hari, aku bertanya ke diri sendiri:

> "Kalau tiba-tiba API error… aku cek ke mana?"  
> "Kalau server tiba-tiba lemot… siapa yang salah?"  
> "Kalau database stuck… siapa pelakunya?"

Dan jawaban jujurnya adalah…

👉 **aku tidak tahu.**

---

# 😵 Realita yang Aku Hadapi

Dulu, setiap ada masalah, workflow aku seperti ini:

```bash
docker logs <container>
```

Lalu ulangi… lagi… dan lagi… untuk container lain.

Aku harus buka log satu per satu.  
Scrolling manual.  
Cari error secara "feeling".

👉 Jujur aja, ini capek dan gak scalable.

Selain itu, ada masalah lain yang lebih parah:

- ❌ Aku tidak tahu siapa yang makan RAM paling besar
- ❌ Aku tidak tahu kenapa PostgreSQL kadang lambat
- ❌ Aku tidak punya satu tempat untuk melihat semuanya

Semua tersebar.  
Semua terpisah.  
Semua bikin frustasi.

# 🔥 Di Titik Itu, Aku Sadar

Kalian tidak bisa memperbaiki sesuatu yang tidak bisa kalian lihat.
Dan dari situlah perjalanan observability di Daffathan-Labs dimulai.

## 🛠 Apa yang Aku Bangun

Aku tidak mau lagi debugging dengan "feeling".

Jadi aku bangun 3 hal ini:

1. **Prometheus + cAdvisor**
   <img width="1895" height="825" alt="image" src="https://github.com/user-attachments/assets/db2b652b-7cf3-4f37-9c8d-48d6907accd3" />  

   Untuk melihat:  
   - CPU  
   - RAM  
   - Network  
   - Resource usage  

   👉 Ini jadi "denyut nadi" sistem.

3. **Loki + Promtail**  
   Untuk mengumpulkan semua log dari semua container.  

   👉 Ini jadi "suara" sistem.

4. **Grafana**  
   Satu tempat untuk melihat semuanya.  

   👉 Ini jadi "mata" sistem.

## 💥 Masalah yang Hampir Bikin Nyerah

Jujur ya, ini gak mulus.
Aku sempat kena beberapa masalah yang bikin mikir:

### 😵 Loki Error "empty ring"

Log tidak masuk sama sekali.
Promtail jalan…
Tapi Loki nol respon.
Ternyata config-nya salah.

### 😤 Promtail Tidak Bisa Baca Log

Awalnya tidak ada log yang masuk.
Ternyata masalahnya sederhana tapi ngeselin:

👉 permission & volume

```yaml
volumes:
  - /var/lib/docker/containers:/var/lib/docker/containers:ro
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### 🤯 Bisa Lihat Log… Tapi Tidak Bisa Filter

Ini yang paling bikin pusing.
Log ada.
Tapi ketika difilter per container → kosong.
Ternyata masalahnya di label.

Solusinya:

```yaml
docker_sd_configs:
  - host: unix:///var/run/docker.sock
```

### 😑 "No Data" Padahal Data Ada

Aku sempat mikir semua setup gagal.
Padahal… cuma salah tempat lihat.
👉 Logs itu di Loki, bukan Prometheus.

## 🚀 Setelah Semua Beres…

Ini perubahan yang aku rasakan:

### 🔍 Aku Bisa Lihat Semua

Semua container.
Semua logs.
Semua metrics.

Dalam satu dashboard.

### ⚡ Debug Jadi Cepat Banget

Sekarang aku tinggal pakai:

```
{container="daffathan-labs-api"}
```

Dan boom — error langsung kelihatan.

### 🧠 Database Tidak Lagi Misterius

Sekarang aku bisa lihat:

- Activity
- Connection
- Performa

👉 PostgreSQL bukan lagi black box.

## 🧠 Pelajaran Besar

Dari semua ini, aku belajar satu hal penting:
Sistem tanpa observability = buta

- Logs adalah suara sistem
- Metrics adalah kondisi sistem

Dan yang paling penting:
Kalau kalian tidak bisa melihat sistem kalian, kalian tidak benar-benar mengontrolnya.

## 🏁 Penutup

Daffathan-Labs sekarang sudah berubah.
Bukan cuma sistem yang "jalan"…
Tapi sistem yang bisa:

- Dilihat
- Dipahami
- Dikontrol

Deployment sudah otomatis.
Keamanan sudah default.
Dan sekarang…
Sistem ini akhirnya punya mata. 👁️🔥
