> **Tag:** `v1.0.9`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.9`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.9.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.9

Rilis ini menambahkan menu baru **"Log Error"** — permintaan langsung untuk mendiagnosis kasus "server sudah versi terbaru tapi Desktop masih berperilaku aneh" tanpa perlu mengandalkan DevTools atau akses file log di server.

---

## Fitur Baru

### Menu "Log Error"
Menu baru di sidebar (tersedia di semua 8 layar Desktop) menampilkan **seluruh error/exception yang tertangkap di aplikasi ini**, tersimpan permanen di database lokal (SQLite) perangkat — bukan sekadar console DevTools yang hilang begitu jendela ditutup:

- **Error proses utama** — kegagalan memanggil server (`/PosApi`: jaringan putus, timeout, sesi kedaluwarsa, respons tak terduga, ditolak server) dan crash tak tertangkap di proses utama Electron.
- **Error tiap jendela (renderer)** — exception JavaScript yang tak tertangkap di layar mana pun (Kasir, Ringkasan, Pesanan, Customer/Anggota, Aturan Diskon, Laporan-Laporan, Riwayat Sinkronisasi), ditangkap otomatis oleh skrip baru yang dimuat di setiap halaman.
- **Kartu ringkasan** jumlah Total/Error/Peringatan sesuai filter aktif.
- **Filter**: tingkat (Error/Peringatan), sumber, rentang tanggal, kata kunci pada pesan/detail.
- **Per baris**: tombol "Detail" (stack trace/konteks lengkap), "Salin" (siap ditempel ke chat/tiket dukungan), dan "Hapus".
- **"Bersihkan Semua"** untuk mengosongkan log.
- Tabel dijaga otomatis maksimal 5.000 baris terbaru (baris terlama dibuang) supaya tidak membengkak tanpa batas.

> **Kata sandi TIDAK PERNAH ikut tercatat** — payload permintaan yang memuat field bernuansa kata sandi (`password`, `password_lama`, `password_baru`, dst) disamarkan sebelum ditulis ke log, termasuk untuk aksi Ganti Kata Sandi/Tambah Akun Kasir.

### Deteksi Anomali Sesi Kas (langsung menyasar kasus "Kas Belum Dibuka" yang nyangkut)
Ditambahkan pengecekan eksplisit: bila tombol "Buka Kas Sekarang" dibalas **sukses** oleh server, tapi pengecekan status segera setelahnya **masih melaporkan kas tertutup** — kondisi yang murni server-side dan sebelumnya tidak meninggalkan jejak apa pun di sisi Desktop — sekarang otomatis tercatat ke Log Error dengan pesan jelas, supaya kasir/admin punya bukti konkret saat melapor, bukan cuma "kok gak kebuka".

---

## Perubahan Teknis

- `local-db.js`: tabel baru `error_log` + `catatErrorLog`/`listErrorLog`/`hapusErrorLog`/`bersihkanErrorLog`.
- `main.js`: `panggilPosApi` (titik pusat SEMUA panggilan `/PosApi`) dan handler `uncaughtException`/`unhandledRejection` sekarang juga mencatat ke `error_log`; 4 aksi IPC baru `pos:error-log-*`; helper `payloadUntukLogAman` menyamarkan field kata sandi sebelum logging.
- `preload.js`: bridge `posAPI.errorLog.{list,catat,hapus,bersihkan}`.
- `error-capture.js` (baru): penangkap `window.onerror`/`unhandledrejection` global, dimuat di 8 halaman.
- `log-error.html` + `log-error-renderer.js` (baru): layar Log Error lengkap.
- `pos-renderer.js`: pengecekan anomali sesi kas dicatat ke Log Error.
- Seluruh berkas JS lolos `node --check`.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.9.exe`.
