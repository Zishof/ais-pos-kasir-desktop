> **Tag:** `v1.0.6`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.6`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.6.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.6

Rilis ini menuntaskan seluruh 12 butir spesifikasi "Dashboard Kasir" yang diminta klien (item 1–3, 5–6, 9 sudah lebih dulu ada di rilis sebelumnya; rilis ini menambahkan item 4, 7, 8, 10, 11, 12 secara penuh) — mencakup Top Up mandiri, verifikasi PIN cadangan, alur isi-saldo yang lebih cepat, penguncian penjualan saat kas tertutup, kendali stok per-produk, notifikasi stok menipis, manajemen akun berbasis peran, dan layar baru Customer/Anggota.

Rilis ini dibangun di atas **v1.0.5** (Login Mode Offline + Cetak Struk), yang catatannya turut disertakan di bagian bawah karena belum pernah dipublikasikan.

---

## Fitur Baru — v1.0.6

### 1. Top Up Saldo — Tombol Mandiri di Topbar
Sebelumnya, mengisi saldo member hanya bisa dilakukan lewat member yang *sedang dipilih* di keranjang belanja (bagian dari alur checkout). Sekarang tersedia tombol **"Top Up"** tersendiri di topbar layar Kasir (tampil otomatis bila hak akses topup toko diaktifkan) yang membuka pencarian member independen — kasir bisa mencari member mana pun, melihat saldonya, dan mengisi saldo kapan saja **tanpa harus memulai transaksi checkout terlebih dahulu**.

### 2. Verifikasi PIN — Cadangan di Layar Utama
Sebelumnya, pembayaran memakai metode Saldo untuk member yang wajib-PIN **hanya** bisa diverifikasi lewat Layar Pelanggan (monitor kedua). Jika perangkat hanya punya satu layar atau Layar Pelanggan belum dibuka, transaksi langsung gagal.

Sekarang: jika Layar Pelanggan tidak terbuka, sistem otomatis menawarkan input PIN **langsung di layar utama Kasir** — pelanggan cukup mendiktekan PIN ke kasir (atau mengetiknya sendiri di layar kasir jika diizinkan toko), transaksi tetap bisa dilanjutkan tanpa memerlukan monitor kedua.

### 3. Popup "Saldo Tidak Mencukupi" — Tombol Isi Saldo Langsung
Sebelumnya, saat saldo member tidak cukup, kasir hanya melihat pesan penjelasan dan harus menutup popup lalu mencari sendiri menu top-up. Sekarang popup tersebut menampilkan tombol tambahan **"Isi Saldo [Nama Member]"** yang langsung membuka form pengisian saldo untuk member yang sama — mempercepat alur "saldo kurang → isi saldo → lanjut bayar" jadi satu-dua klik saja.

### 4. Penguncian Layar Jualan Saat Kas Tertutup
Sebelumnya, kasir tetap bisa memilih produk dan menekan Bayar meskipun sesi kas belum dibuka atau sudah ditutup — hanya indikator status kas yang berubah, tanpa penguncian sungguhan.

Sekarang: begitu sesi kas berstatus **tertutup**, seluruh area kartu produk tertutup layar peringatan penuh ("Kas Belum Dibuka") lengkap dengan tombol pintas **"Buka Kas Sekarang"**, dan tombol Bayar otomatis nonaktif. Kasir **wajib** membuka sesi kas (mengisi modal awal) sebelum bisa melayani transaksi apa pun — sesuai kebijakan "wajib buka sesi kas dulu" yang diminta.

### 5. Kontrol Stok Per-Produk — Boleh/Wajib Blokir Saat Stok Kurang
Sebelumnya, kebijakan "boleh dijual meski stok minus" hanya bisa diatur **satu kali untuk seluruh toko** (gerbang global), dan bahkan saat diaktifkan pun sifatnya hanya pencatatan (tidak benar-benar memblokir).

Sekarang, setiap produk punya pengaturan sendiri di form Produk (**"Aturan Jual Saat Stok Kurang"**), dengan 3 pilihan:
- **Ikut Pengaturan Toko (default)** — perilaku lama, tidak berubah.
- **Selalu Boleh Dijual Walau Stok Minus** — override eksplisit "boleh", terlepas dari pengaturan toko.
- **Wajib Diblokir Jika Stok Tidak Cukup** — produk ini akan **benar-benar menolak transaksi** (bukan cuma dicatat) begitu stoknya kurang, cocok untuk barang mahal atau mudah rusak yang memang tidak boleh dijual di bawah stok fisik.

Produk tanpa pengaturan khusus (mayoritas) tetap berperilaku persis seperti sebelumnya — tidak ada perubahan performa maupun perilaku untuk toko yang tidak memakai fitur ini.

### 6. Notifikasi Stok Menipis — Otomatis Setelah Tutup Kas
Setiap kali kasir menutup sesi kas, sistem sekarang otomatis memeriksa seluruh produk toko terhadap ambang **Stok Minimum** (dikonfigurasi lewat menu "Stok Minimum & Kadaluarsa" yang sudah ada) dan langsung menampilkan daftar produk yang stoknya sudah turun ke/di bawah ambang tersebut — lengkap dengan sisa stok dan angka ambangnya — supaya kasir/pemilik toko langsung tahu barang apa saja yang perlu dipesan ulang, tepat di momen tutup kas.

> **Catatan desain**: notifikasi ini murni informatif (tidak otomatis membuat dokumen pemesanan ke Gudang Pusat) — ini keputusan eksplisit untuk menjaga sistem stok POS Kantin tetap terpisah dari ledger stok Gudang Pusat/Cabang, sesuai arahan sebelumnya bahwa penyatuan kedua sistem stok tersebut ditunda.

### 7. Manajemen Akun — Ganti Kata Sandi & Tambah Akun Kasir
Tombol baru **"Akun Saya"** di topbar layar Kasir membuka panel dengan dua bagian:
- **Ganti Kata Sandi** — tersedia untuk siapa pun yang login, kasir bisa mengganti kata sandi akunnya sendiri kapan saja (memerlukan kata sandi lama sebagai verifikasi, kata sandi baru minimal 6 karakter).
- **Tambah Akun Kasir Baru** — **hanya tampil dan hanya berhasil untuk akun admin/manager** (bukan akun kasir toko biasa). Admin dapat langsung membuat akun kasir baru (userid, nama, kata sandi, toko tujuan) dari Desktop tanpa perlu membuka aplikasi web.

Pembatasan "hanya admin yang boleh menambah akun" ditegakkan **di server**, bukan hanya disembunyikan di tampilan — mencegah kasir biasa membuat akun baru meski mencoba memanggil fitur ini secara langsung.

### 8. Layar Baru — Customer/Anggota
Menu baru **"Customer/Anggota"** di sidebar (semua layar Desktop) membuka layar manajemen anggota koperasi lengkap: pencarian, daftar berpaginasi, serta form tambah/ubah anggota (nama, kode identitas, jenis keanggotaan, nomor HP/telepon/email, keterangan, status aktif). Kode member otomatis dibuatkan sistem mengikuti format yang sama dengan aplikasi web.

Fungsinya setara dengan menu "Manajemen Anggota" di aplikasi web untuk kebutuhan kasir sehari-hari (mendaftarkan pelanggan/anggota baru dengan cepat) — versi Desktop ini fokus pada data inti yang relevan untuk transaksi kantin, sementara penautan data kampus (NIM/NIS/NIP mahasiswa-siswa-guru-dosen-pegawai) tetap dikelola lewat aplikasi web seperti biasa. Keduanya menulis ke data anggota yang sama, jadi tidak ada duplikasi atau konflik data.

---

## Perubahan Teknis (Server)

- `PosApi.java` — 8 aksi baru: `akun_ganti_password`, `akun_tambah`, `anggota_list`, `anggota_simpan`, `jenis_anggota_list`.
- `KantinHelper.java`:
  - `validasiStokCukupDenganLock` diperluas mendukung override stok per-produk (hard-block selektif), tetap fail-open utk produk tanpa override (tidak mengubah perilaku existing).
  - Method baru: `gantiPasswordSendiri`, `tambahAkunKasir` (gerbang admin-only server-side), `daftarProdukStokMenipis` (dipanggil otomatis dari `sesiKasTutup`), `anggotaList`/`anggotaSimpan`/`jenisAnggotaList`.
- `Produk.java` (entity) — field baru `izinkanJualMinusStok` (Boolean, nullable — tri-state: null/true/false).
- `ProdukAction.java` (ZK) + `barang/index.jsp` (JSP) — form Produk di kedua platform (ZK dan JSP) mendapat kontrol baru "Aturan Jual Saat Stok Kurang", saling konsisten.

## Perubahan Teknis (Desktop)

- Halaman baru: `anggota.html` + `anggota-renderer.js`.
- `pos.html` / `pos-renderer.js`: tombol+modal Top Up mandiri, modal PIN cadangan layar utama, overlay kunci "Kas Belum Dibuka", tombol+modal "Akun Saya".
- `pesan-detail.js`: modal detail error/sukses kini mendukung tombol aksi tambahan (dipakai utk "Isi Saldo" dari popup saldo kurang).
- `preload.js` / `main.js`: bridge IPC baru untuk seluruh aksi server di atas.
- Seluruh berkas JS baru/diubah lolos pemeriksaan sintaks (`node --check`); seluruh berkas Java terkait dikompilasi bersih (`javac --release 8`).

---

## v1.0.5 — Login Mode Offline & Cetak Struk *(belum pernah dipublikasikan — disertakan di sini)*

### Login Mode Offline
Sebelumnya, jika server tidak terjangkau saat aplikasi dibuka, kasir benar-benar terkunci di luar — bahkan kredensial "Ingat Saya" yang tersimpan justru ikut terhapus otomatis.

Sekarang: saat server tak terjangkau, kredensial "Ingat Saya" **tidak dihapus**, dan kasir yang perangkatnya pernah login online dengan "Ingat Saya" dapat memilih **"Masuk Mode Offline"** — memasukkan kata sandi yang diverifikasi **secara lokal** di perangkat (tidak dikirim ke server, memakai hash tersimpan aman), lalu langsung masuk ke layar Kasir dengan indikator **"MODE OFFLINE"** yang jelas. Transaksi selama mode ini tetap tersimpan aman di perangkat dan otomatis tersinkronkan begitu koneksi pulih — memakai infrastruktur antrean offline yang sudah ada.

### Cetak Struk (2 lokasi)
Tombol **"Cetak Struk"** kini tersedia di:
- Modal "Transaksi Berhasil & Tersinkron" tepat setelah checkout selesai (di layar Kasir), dan
- Setiap baris riwayat transaksi di layar Ringkasan.

Struk dicetak dalam format thermal (lebar 300px, monospace) yang sama persis dengan struk versi web, lengkap dengan rincian item, diskon, cashback, dan info pembayaran.

---

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.6.exe`. Pembaruan otomatis (bila fitur "Update Sistem" sudah dipakai) akan mendeteksi versi ini begitu dipublikasikan sebagai GitHub Release.
