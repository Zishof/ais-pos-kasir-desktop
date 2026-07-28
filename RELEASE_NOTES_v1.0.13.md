> **Tag:** `v1.0.13`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.13`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.13.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.13

Rilis ini menjawab keluhan "loading lama tanpa keterangan apa pun" saat membuka layar Kasir — sekarang selalu jelas sedang apa: menghubungi server, membaca cache lokal, atau mengunduh gambar produk (dengan progress bar).

---

## Perubahan

### Progress Bar Layar Muat Awal
Layar "Memuat katalog & gambar produk..." sekarang menampilkan tahapan SECARA REAL-TIME:
- **"Menghubungi server..."** — saat mengambil daftar produk terbaru.
- **"Offline -- memuat data tersimpan terakhir..."** — bila tidak ada koneksi, otomatis pakai cache lokal.
- **"Semua gambar produk sudah tersimpan di perangkat ini."** — kasus paling umum sehari-hari, langsung lewat cepat.
- **Progress bar + hitungan "X / Y gambar diunduh"** — HANYA muncul saat benar-benar ada gambar produk baru yang perlu diunduh (mis. setelah admin menambah produk baru dengan foto). Inilah penyebab loading "kadang lama" yang dilaporkan — kalau banyak produk baru sekaligus tanpa cache, unduhannya butuh waktu; sekarang progresnya terlihat jelas, bukan diam tanpa keterangan.

## ⚠️ Soal "Kas Tidak Mau Menutup Menu"

Ini **bukan bug baru** — sudah terinstrumentasi sejak beberapa rilis lalu (lihat menu **Log Error**, cari entri bersumber `pos.html:anomali-sesi-kas-buka`). Gejalanya: server membalas "berhasil buka kas", tapi pengecekan status segera setelahnya tetap melaporkan kas tertutup, sehingga overlay/modal "Buka Kas" tidak pernah tertutup. Ini terjadi identik di versi Android karena kedua aplikasi memanggil endpoint server yang SAMA persis.

**Kemungkinan besar penyebabnya**: server produksi Anda belum menjalankan kode terbaru `KantinHelper.sesiKasBuka` (perbaikan transaksi Hibernate yang memastikan data benar-benar tersimpan permanen sebelum membalas "berhasil"). Mohon cek dengan admin/IT apakah source terbaru sudah di-deploy (SVN update + ant build + restart Tomcat) ke server produksi.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.13.exe`.
