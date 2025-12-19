<!-- title: Real-Time Spinach Detector — Pelajaran Mahal dari Deploy YOLO di Server Kecil -->
<!-- excerpt: Catatan teknis dan reflektif dari membangun aplikasi deteksi bayam berbasis YOLO (YOLOv9 & YOLOv11) — mulai dari Docker image yang terlalu besar, server overload, eksperimen ONNX yang gagal, hingga keputusan realistis untuk tetap berjalan secara lokal. -->
<!-- image: https://github.com/user-attachments/assets/1b008abf-73c5-4235-ac01-d63ad44c886e -->
<!-- date: 2025-12-17 -->
<!-- posting_date: 2025-12-17 -->
<!-- tags: Computer Vision, YOLO, Object Detection, ONNX, PyTorch, Docker, Deployment, Machine Learning, Web AI -->

# 🥬 Real-Time Spinach Detector  
## Pelajaran Mahal dari Membangun YOLO untuk Deteksi Realtime di Web

<img width="1383" height="899" alt="image" src="https://github.com/user-attachments/assets/1b008abf-73c5-4235-ac01-d63ad44c886e" />

Project **Spinach Detector** ini awalnya terlihat sederhana:  
👉 *“Deteksi apakah gambar atau kamera berisi bayam atau bukan.”*

Namun dalam praktiknya, project ini berubah menjadi **pelajaran nyata tentang batasan resource, deployment ML, dan realitas object detection realtime di web**.

Repo ini **tidak berakhir dengan deployment cloud yang sempurna**,  
tapi justru **berakhir dengan pemahaman yang jauh lebih matang**.

---

## 🎯 Tujuan Awal Project

Tujuan utama project ini sebenarnya **bukan production**:

- demonstrasi object detection berbasis YOLO
- realtime detection via kamera (web)
- keperluan demo dan presentasi di kampus
- eksplorasi YOLOv9 dan YOLOv11

Secara fungsional:
- backend: Flask + YOLO
- frontend: Web camera + canvas overlay
- model: YOLOv9 & YOLOv11 (custom dataset bayam)

---

## 🧱 Masalah Pertama: Docker Image Terlalu Besar

Saat mencoba membungkus aplikasi ke dalam Docker, masalah pertama langsung muncul.

### ❌ Docker Image = ±4GB

Penyebab utamanya:
- model `.pt` YOLO
- PyTorch + CUDA dependency
- OpenCV, numpy, pillow
- dependency ML yang **sangat berat**

Dampaknya:
- `docker pull` **lama sekali**
- tidak realistis untuk server kecil
- deployment jadi tidak efisien

Untuk aplikasi web biasa, ini mungkin masih bisa ditoleransi.  
Tapi untuk **ML inference realtime**, ini sudah red flag.

---

## 🖥️ Masalah Kedua: Server Kecil Tidak Kuat Menangani Realtime Detection

Server yang digunakan:
- CPU kecil
- RAM terbatas
- tanpa GPU

Ketika aplikasi mulai dijalankan dan:
- kamera aktif
- inference YOLO berjalan terus-menerus
- request datang tiap beberapa ratus milidetik

➡️ **Server langsung overload**  
➡️ CPU spike  
➡️ RAM penuh  
➡️ proses mati  
➡️ server harus reboot berulang kali  

Pada titik ini, jelas bahwa:
> **Realtime object detection + server kecil = kombinasi yang buruk**

---

## 🔄 Eksperimen: Migrasi dari `.pt` ke ONNX

Untuk mengurangi beban server, dicoba pendekatan lain:

### 🎯 Ide:
- konversi YOLO `.pt` → `.onnx`
- harapan: runtime lebih ringan
- dependency lebih sedikit
- Docker image lebih kecil

### ❌ Realita:
- hasil deteksi **aneh**
- bounding box tidak akurat
- multiple detection untuk satu objek
- koordinat kacau
- perbedaan besar antara PyTorch vs ONNX output

Masalah utama:
- ONNX **tidak auto-NMS**
- format output YOLO ONNX berbeda
- preprocessing & postprocessing harus ditulis manual
- satu kesalahan kecil → hasil langsung rusak

Alih-alih menyederhanakan, ONNX justru:
> **menambah kompleksitas dan risiko bug**

---

## 🔙 Kembali ke Awal: Tetap Pakai `.pt`, Jalan Lokal

Setelah beberapa iterasi dan eksperimen, keputusan akhirnya diambil:

- ❌ tidak pakai Docker
- ❌ tidak deploy ke server
- ❌ tidak realtime via cloud
- ✅ pakai YOLO `.pt`
- ✅ jalan **secara lokal**
- ✅ cukup untuk demo dan pembelajaran

Dan untuk konteks project ini,  
**keputusan itu adalah keputusan yang paling masuk akal.**

---

## 🧠 Pelajaran Penting dari Project Ini

### 1️⃣ Realtime Object Detection Itu Mahal

Deteksi realtime via kamera:
- bukan cuma soal model
- tapi soal:
  - CPU
  - RAM
  - IO
  - concurrency
  - frame rate
  - request frequency

Ini **bukan workload ringan**.

---

### 2️⃣ ML di Server ≠ ML di Device

Perbedaan besar:
- **server inference realtime** → resource heavy
- **model di device (mobile / edge)** → jauh lebih efisien

Makanya:
- aplikasi kamera di HP terasa ringan
- tapi server inference cepat overload

Karena:
> **model ditanam langsung di device, bukan dipanggil via HTTP terus-menerus**

---

### 3️⃣ ONNX Bukan Obat Mujarab

ONNX itu powerful, tapi:
- tidak plug-and-play
- butuh pemahaman format output
- NMS harus manual
- preprocessing harus presisi

Tanpa itu:
> hasil bisa “jalan”, tapi **secara logika salah**

---

### 4️⃣ Web + Realtime AI = Banyak Layer Mahal

Realtime AI di web bukan cuma soal backend:
- kamera di browser
- canvas rendering
- request loop
- latency
- bandwidth
- resource server

Semua itu **numpuk biayanya**.

---

## 🧾 Kesimpulan

Project **Spinach Detector** ini mungkin tidak berakhir dengan deployment cloud yang stabil,  
tapi justru menghasilkan sesuatu yang lebih berharga:

> **pemahaman realistis tentang batasan object detection realtime di web.**

Tidak semua project harus:
- scalable
- cloud-ready
- production-grade

Kadang:
- **cukup jalan lokal**
- **cukup untuk demo**
- **cukup untuk belajar**

Dan knowing **kapan harus berhenti optimasi**  
adalah bagian penting dari menjadi engineer yang matang.

---

## 🔗 Resource & Link

- **GitHub Repo**  
  https://github.com/daffa09/spinach-detector

- **Google Colab — YOLOv9 Training**  
  https://colab.research.google.com/drive/1F43i2TkWXIefNw2KuiO1pMnAmc4pKmuZ?usp=sharing

- **Google Colab — YOLOv11 Training**  
  https://colab.research.google.com/drive/1ahSpgDHbQJqJuPKEcyajPbtrDvT1P-3I?usp=sharing

---

## 🧠 Penutup

Project ini bukan tentang “deteksi bayam”.  
Project ini tentang **belajar batasan sistem nyata**.

Dan itu pelajaran yang jauh lebih mahal daripada sekadar model yang akurat.
