> **Tag:** `v1.0.26`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.26`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.26.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.26

## Menu baru: "Laporan Transaksi" (Report Order / Report Sesi / Report Payment)

Sesuai spesifikasi "Flow Kasir" yang diberikan klien, ada menu baru di sidebar bernama **Laporan Transaksi** dengan 3 tab:

**Tab Order** -- daftar semua order penjualan, tiap baris menampilkan Nomor ID Order & Sesi (format `toko3/0001`), Nomor Nota (format `Order toko3 - 0001 - 001`), tanggal/jam, nama kasir, nama pembeli, metode bayar, dan total. Tombol **"Detail Penjualan"** membuka rincian posisi fiskal per item (nama produk, qty, harga jual, diskon, pajak, subtotal).

**Tab Sesi** -- daftar sesi buka/tutup kas tiap kasir: nama kasir, nama POS, waktu mulai & selesai, saldo awal, dan saldo akhir. Sesi yang masih berjalan (belum ditutup) ditandai "Proyeksi" karena saldo akhirnya dihitung real-time, bukan angka final yang sudah dikonfirmasi kasir.

**Tab Payment** -- daftar pembayaran: tanggal/jam, metode bayar, referensi order, dan jumlah transaksi.

Semua data direkonstruksi dari transaksi & sesi kas yang sudah ada -- tidak ada tabel database baru.

## Perbaikan: Unggah Excel Katalog di Android

Fitur unggah Excel Produk (khusus supervisor) sempat berhenti berfungsi di Android sejak perubahan server versi sebelumnya (Desktop dipindah ke alur "tinjau dulu sebelum simpan", tapi aksi lama yang dipakai Android ikut terhapus). Sudah diperbaiki di sisi server -- **Android tidak perlu update apa pun**, cukup server yang di-deploy ulang.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.26.exe`.

## Catatan

Fitur Laporan Transaksi baru diverifikasi lewat pemeriksaan kode + kompilasi server + pemeriksaan sintaks JS -- belum diuji langsung klik-per-klik dengan data transaksi sungguhan di aplikasi berjalan. Mohon diuji sebelum benar-benar diandalkan di lapangan.

**Android**: layar "Laporan Transaksi" versi ringkas (kartu, bukan tabel) turut dirilis di Android v1.9.0 secara terpisah.
