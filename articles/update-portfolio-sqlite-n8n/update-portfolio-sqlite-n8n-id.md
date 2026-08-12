<!-- title: Evolusi Portofolio: Dari JSON ke SQLite & Automasi AI dengan n8n -->
<!-- excerpt: Bagaimana aku merombak sistem portofolio menjadi lebih simpel dengan SQLite dan membangun sistem automasi publikasi ke LinkedIn & Instagram menggunakan n8n dan AI. -->
<!-- image: https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/update-portfolio-sqlite-n8n/portfolio_automation_architecture.jpg -->
<!-- date: 2026-08-12 -->
<!-- posting_date: 2026-08-12 -->
<!-- tags: Tech, Portfolio, SQLite, n8n, AI, Automation, Architecture -->

# 🚀 Evolusi Portofolio: Dari JSON ke SQLite & Automasi AI dengan n8n

<img width="800" alt="Portfolio Automation Architecture" src="https://raw.githubusercontent.com/Daffathan-Labs/Articles/main/articles/update-portfolio-sqlite-n8n/portfolio_automation_architecture.jpg" />

Seiring berjalannya waktu, mengelola *project* dan artikel di portofolio mulai terasa melelahkan. Awalnya, aku menggunakan *file* JSON statis untuk menyimpan semua data. Sederhana memang di awal, tapi JSON punya kelemahan fatal saat di-*update*. Walau ukuran *file*-nya kecil, setiap kali ada satu artikel baru, sistem harus menimpa (*rewrite*) seluruh isi *file* JSON itu dari awal sampai akhir. Bayangkan kalau nanti sudah ada 400 artikel, apa iya harus di-*rewrite* semua setiap kali *update*? Tentu tidak masuk akal. 

Akhirnya, aku memutuskan untuk melakukan *upgrade* sistem. Tapi bukan *upgrade* yang *over-engineered*. Alih-alih melakukan *setup container* Docker untuk menjalankan *database* besar seperti PostgreSQL atau MySQL, aku memilih jalan ninja yang jauh lebih simpel dan efisien: **SQLite**.

### 🗃️ Mengapa SQLite?
Sederhana: SQLite berjalan langsung di *server* tanpa perlu *setup container* yang berat. Karena wujudnya hanya sebuah *file*, pengelolaannya sangat mudah, namun tetap memberikan kebebasan penuh layaknya *database* relasional. Aku bisa menggunakan *query* SQL standar untuk memanipulasi, menyaring, dan mengatur konten portofolio dengan sangat leluasa. Ini adalah solusi paling *straightforward*—*do the simplest thing that works*.

### 🤖 Sihir Automasi dengan n8n & AI
Bagian paling seru dari *update* kali ini bukan cuma di *database*, melainkan pada **sistem publikasi otomatis**. Aku membangun arsitektur automasi menggunakan **n8n**. 

Alurnya seperti ini:
1. **Trigger:** Aku menulis artikel langsung di *code editor* kesayanganku menggunakan format Markdown (`.md`), lalu mem-*push*-nya ke *repository*.
2. **AI Processing:** Begitu artikel di-*push*, n8n akan mendeteksinya. Teks Markdown tersebut kemudian diolah oleh AI. AI bertugas membaca artikel, memahaminya, lalu men-*generate* gambar ilustrasi yang sesuai (seperti gambar di atas!) dan membuat *caption*.
3. **Manual Approval via n8n:** Sebelum semuanya tayang, sistem n8n akan mengirimkan notifikasi *approval* kepadaku. Semua draf konten—baik *caption* untuk LinkedIn maupun visual edukasi/gambar untuk Instagram—akan ditahan terlebih dahulu. Setelah aku periksa dan klik *approve*, barulah konten tersebut secara otomatis diluncurkan ke LinkedIn dan Instagram.

Dengan begini, aku hanya perlu berfokus menulis di GitHub. Sisanya—desain gambar, optimasi *caption*, dan distribusi ke *social media*—diurus sepenuhnya oleh AI dan n8n. Waktu yang dihemat luar biasa banyak!

### 🔮 Next Step: Konten Statis Edukasi
Untuk ke depannya, aku tidak ingin media sosialku kosong melompong saat aku sedang sibuk dan tidak sempat membuat konten organik. Jadi, misi selanjutnya adalah membuat **konten statis otomatis**. 

Konten organik dari pemikiranku akan tetap menjadi sajian utama, tetapi sistem AI ini akan aku tugaskan untuk secara berkala men-*generate* konten non-organik—berisi ilmu-ilmu, tutorial, atau fakta menarik seputar *tech*—agar *feed* tetap aktif menyebarkan pengetahuan tanpa aku harus terus-menerus turun tangan.

Kerja cerdas, bukan cuma kerja keras, kan?
