> **Tag:** `v1.0.22`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.22`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.22.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.22

## Fitur Baru: Katalog Barang (khusus Supervisor)

Kasir dengan status **Supervisor** (dicentang admin lewat menu pengguna di POS Online) sekarang bisa menambah dan mengubah produk langsung dari Desktop, tanpa perlu buka POS Online -- menu baru **"Produk"** muncul di sidebar.

- Tambah produk baru: kode, nama, kategori, keterangan, harga beli/jual, stok, status aktif, dan boleh-dijual-walau-stok-minus.
- Ubah produk yang sudah ada, termasuk pindah kategori.
- Kasir biasa (bukan supervisor) tetap bisa membuka menu "Produk" tapi hanya melihat pesan "tidak punya akses" -- tidak bisa mengubah apa pun.
- **Catatan cakupan:** resep bahan baku, unggah foto produk, dan penautan aset tetap dikelola lewat POS Online (JSP) -- menu ini khusus untuk tambah/ubah cepat data inti produk saja.

## Perbaikan: Kotak nominal Sesi Kasir kini pasti bisa diketik manual

Ada laporan lapangan kotak "Modal Awal (Rp)" / "Uang Fisik (Rp)" di modal Sesi Kasir kadang tidak bisa diketik manual (hanya tombol panah naik/turun yang berfungsi). Kotak nominal itu sekarang tidak lagi memakai jenis input bawaan browser yang berpotensi bermasalah di sebagian lingkungan Windows -- diganti dengan kotak teks biasa yang hanya menerima digit, dan kursor otomatis langsung siap ketik begitu modal dibuka.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.22.exe`.
