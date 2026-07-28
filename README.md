# AIS POS Kasir Desktop

Aplikasi kasir Kantin/Koperasi berbasis **Electron** yang berjalan sebagai aplikasi desktop native (Windows) — bukan lewat browser. Aplikasi ini terhubung ke server AIS (Enterprise Education) yang sudah ada, tetapi menyimpan seluruh tampilan Kasir secara **lokal di perangkat** (`file://`, bukan dimuat dari server tiap kali dibuka) dan tetap bisa melayani transaksi **saat koneksi internet terputus** — transaksi tersimpan aman di perangkat lalu disinkronkan otomatis ke server begitu koneksi pulih.

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur Singkat](#arsitektur-singkat)
- [Prasyarat Server](#prasyarat-server)
- [Instalasi (Pengguna)](#instalasi-pengguna)
- [Update Aplikasi](#update-aplikasi)
- [Pengembangan](#pengembangan)
- [Struktur Proyek](#struktur-proyek)
- [Cakupan yang Belum Tersedia](#cakupan-yang-belum-tersedia)

## Fitur

### Kasir

- Katalog produk lengkap dengan kategori — kategori yang ditampilkan hanya yang benar-benar punya produk aktif di toko bersangkutan (diturunkan dari daftar produk yang tampil, bukan daftar kategori mentah), jadi setiap kategori yang diklik pasti berisi.
- **Stok realtime** — setiap kartu produk menampilkan badge stok saat ini ("Habis" bila 0, "Stok N" bila menipis), langsung dari server tanpa perlu buka tab terpisah.
- Gambar produk otomatis diunduh & disimpan ke perangkat saat online, sehingga tetap tampil walau sedang offline (fallback ke avatar warna+inisial bila belum pernah berhasil diunduh).
- Pencarian produk cepat, keranjang dengan pengaturan jumlah per item.
- Checkout tunai maupun non-tunai, dengan perhitungan kembalian otomatis.
- **Cek Saldo Member** — begitu member dipilih, saldo terkininya langsung tampil di kartu member (termasuk batas minimal yang wajib mengendap), tanpa harus memulai checkout dulu.
- Pembayaran pakai **Saldo Member** — saldo dihitung ulang secara *real-time* dari server setiap checkout (bukan angka lama hasil pencarian), termasuk pengecekan saldo minimal yang wajib mengendap sesuai jenis keanggotaan member; pesan saldo tidak cukup menyertakan nama member yang bersangkutan.
- **Top Up Saldo lewat Kasir** — kasir yang punya hak akses (sama dengan menu "Manajemen Saldo (Deposit)") bisa langsung mengisi saldo tunai member terpilih dari layar ini, tanpa berpindah menu; saldo di kartu member ikut ter-refresh begitu top up berhasil.
- **Sesi Kasir (Buka/Tutup Kas)** — tombol di topbar menampilkan status kas saat ini (tertutup, atau terbuka + kas berjalan) dan membuka form Buka Kas (modal awal) / Tutup Kas (uang fisik + selisih otomatis dihitung); bila toko mengaktifkan gerbang wajibnya, checkout otomatis ditolak selama kas belum dibuka.
- **Aturan Diskon otomatis** — keranjang dievaluasi ulang setiap berubah (produk/jumlah/member) memakai aturan diskon aktif dari server (per kategori/member/periode dsb.), diskon & cashback langsung terlihat sebelum checkout.
- **Tahan/Simpan Keranjang** — keranjang yang sedang berjalan bisa ditahan sementara (mis. pelanggan lupa dompet) dan dilanjutkan lagi nanti dari menu "Keranjang Tertahan", lengkap dengan member dan metode bayar yang sudah dipilih sebelumnya.
- **Cetak Struk** — pratinjau struk dengan toolbar sendiri (bukan dialog cetak bawaan OS) muncul begitu transaksi selesai; cetak fisik baru terjadi setelah tombol "Cetak" di pratinjau ditekan.
- Transaksi **offline-first**: begitu tombol Bayar ditekan, transaksi langsung tersimpan lokal (SQLite) terlebih dahulu sebelum dikirim ke server — kalau ternyata sedang offline, transaksi tetap aman dan otomatis disinkronkan begitu koneksi kembali, bisa juga dipicu manual lewat tombol "Sinkronkan".

### Ringkasan

Ringkasan performa toko hari berjalan: total omzet, jumlah transaksi, dan daftar produk terlaris. Data ini juga di-cache lokal sehingga tetap bisa dilihat sebentar saat offline (dengan penanda jelas bahwa data yang tampil adalah data tersimpan terakhir).

### Pesanan Online

- Daftar pesanan yang dibuat member lewat kanal online, dipisah antara yang menunggu pembayaran dan yang sudah lunas.
- **Popup otomatis** — layar Kasir memeriksa pesanan online baru setiap ~20 detik; begitu ada pesanan baru dari pembeli (bukan keranjang yang ditahan kasir sendiri), jendela pop-up langsung muncul menampilkan barang yang dipesan, nama pembeli, dan waktu pemesanan, tanpa kasir perlu berpindah tab.
- Verifikasi & penyelesaian pembayaran langsung dari aplikasi kasir (reuse aturan checkout yang sama persis dengan Kasir).
- Pembatalan pesanan yang belum dibayar.

### Layar Pelanggan (Dual Monitor)

- Saat perangkat kasir punya dua layar, jendela terpisah otomatis terbuka & diposisikan penuh di monitor kedua menghadap pembeli, menampilkan mirror keranjang belanja secara *real-time* (nama produk, jumlah, subtotal, pajak, total).
- Untuk member yang jenis keanggotaannya mewajibkan verifikasi PIN sebelum saldo dipotong, pembeli mengetik PIN-nya sendiri langsung di layar ini lewat numpad khusus — **PIN tidak pernah terlihat atau melewati layar kasir sama sekali**, hanya hasil cocok/tidaknya yang dikirim balik ke kasir. Verifikasi PIN dilakukan lewat proses utama aplikasi (yang memegang token API), bukan langsung dari jendela Layar Pelanggan.

### Pesan Error & Sukses yang Informatif

Setiap kejadian penting (saldo tidak cukup, sesi login habis, tidak ada koneksi, transaksi kemungkinan sudah tercatat sebelumnya di server, dll.) ditampilkan dalam jendela detail berisi: **apa yang terjadi**, **kenapa**, **langkah konkret** yang perlu dilakukan saat itu juga, dan **cara mencegahnya terulang** — bukan sekadar notifikasi singkat yang membingungkan kasir.

### Update Sistem

Tombol "Update Sistem" di dalam aplikasi memeriksa, mengunduh, dan memasang versi terbaru langsung dari [Releases](../../releases) repo ini (via [`electron-updater`](https://www.electron.build/auto-update)) — kasir cukup klik beberapa tombol tanpa perlu unduh installer manual atau uninstall versi lama. Unduhan maupun pemasangan **selalu menunggu konfirmasi eksplisit** dari kasir, tidak pernah berjalan otomatis di latar belakang saat perangkat sedang dipakai melayani pelanggan.

## Arsitektur Singkat

- **Shell**: Electron, beberapa `BrowserWindow` terisolasi (Kasir, Layar Pelanggan, Login, Setup, dll.) masing-masing dengan `preload.js` sendiri (prinsip *least privilege* per jendela).
- **Autentikasi**: token khusus perangkat (`Authorization: Bearer <token>`), terpisah total dari sesi cookie web biasa — divalidasi lewat endpoint JSON bertipe `/PosApi` di server, bukan lewat endpoint SQL generik.
- **Penyimpanan lokal**: SQLite (`better-sqlite3`) untuk antrean transaksi offline (tidak pernah dihapus meski sudah tersinkron — berfungsi juga sebagai arsip) dan cache data referensi (katalog, konfigurasi, ringkasan, pesanan).
- **Komunikasi antar-jendela**: seluruhnya lewat IPC direlay proses utama (main process) — tidak ada jendela renderer yang bicara langsung ke jendela renderer lain maupun langsung ke jaringan.

## Prasyarat Server

Migrasi `MIGRASI_POS_DEVICE_TOKEN.sql` (ada di root proyek server AIS) **wajib** sudah dijalankan di database sebelum aplikasi ini bisa login sama sekali — tabel token perangkat belum ada tanpa migrasi itu.

## Instalasi (Pengguna)

1. Unduh installer terbaru (`AIS POS Kasir Setup x.y.z.exe`) dari halaman [Releases](../../releases).
2. Jalankan installer, lalu ikuti wizard pengaturan alamat server AIS saat aplikasi pertama kali dibuka (isi host, context path, pilih HTTP/HTTPS, lalu **Tes Koneksi** sebelum menyimpan).
3. Masuk dengan akun kasir yang sudah terdaftar di server AIS.

## Update Aplikasi

Lihat bagian [Update Sistem](#update-sistem) di atas — cukup klik tombol di dalam aplikasi. Untuk penjelasan cara **menerbitkan** rilis baru (ditujukan untuk pengelola repo), lihat komentar JavaDoc pada blok "Update aplikasi (electron-updater)" di `main.js`.

## Pengembangan

```bash
npm install
npm start          # menjalankan aplikasi tanpa build installer
npm run dist        # build installer NSIS (Windows) ke folder release/
npm run dist:dir    # build folder aplikasi tanpa installer, untuk uji cepat
```

## Struktur Proyek

| Berkas | Peran |
| --- | --- |
| `main.js` | Proses utama Electron — wizard setup, login, IPC, token API, offline-sync, auto-update |
| `preload*.js` | Jembatan aman antara tiap jendela dan proses utama (`contextIsolation: true`) |
| `pos.html` / `pos-renderer.js` | Layar Kasir |
| `ringkasan.html` / `ringkasan-renderer.js` | Layar Ringkasan |
| `pesanan.html` / `pesanan-renderer.js` | Layar Pesanan Online |
| `customer.html` / `customer-renderer.js` | Layar Pelanggan (monitor kedua) |
| `pesan-detail.js` | Modul bersama: modal penjelasan error/sukses detail |
| `local-db.js` | Lapisan SQLite (antrean transaksi offline + cache data) |
| `login.html`, `setup.html`, `error.html` | Layar login, wizard pengaturan server, halaman error |

## Cakupan yang Belum Tersedia

Per rilis saat ini, layar Kasir lokal sudah mencakup seluruh alur checkout inti (termasuk diskon otomatis, tahan/simpan keranjang, dan cetak struk — lihat bagian [Fitur](#fitur) di atas) serta menu Pesanan/Ringkasan/Stok Opname/Produk/Kulakan/Aturan Diskon/Laporan/Customer-Anggota, sejajar dengan versi JSP/web. Menu **"Buka Aplikasi Lengkap (Online)"** tetap tersedia sebagai jalan pintas ke versi web penuh bila suatu saat dibutuhkan fitur admin yang belum diminta untuk diporting ke sini.
