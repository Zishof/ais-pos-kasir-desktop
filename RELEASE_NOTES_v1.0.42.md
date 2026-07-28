# AIS POS Kasir Desktop v1.0.42

## Fitur baru: Kolom Barcode Produk

Produk sekarang punya field **UPC/Barcode** terpisah dari **Kode Produk** -- untuk toko yang barangnya sudah punya barcode dari pabrik/supplier (EAN/UPC di kemasan) selain kode internal toko sendiri. Opsional, tidak wajib diisi.

- Field "UPC/Barcode" baru di form Tambah/Ubah Produk (JSP, ZKoss, Desktop, Android).
- Pencarian produk (kotak cari di layar Kasir, admin Produk, Cetak Price Tag) sekarang mencocokkan **kode ATAU barcode ATAU nama** -- scan/ketik salah satu tetap ketemu.
- Scan barcode fisik (Kasir, Stok Opname) ikut mencocokkan kolom barcode baru ini, tidak lagi hanya kode internal.
- Unggah/unduh Excel katalog produk (JSP dan aksi server yang dipakai bersama Desktop/Android) sekarang menyertakan kolom Barcode -- termasuk perbaikan bug lama: unduh katalog penuh sebelumnya selalu mengosongkan kolom barcode walau datanya ada.

Perlu server AIS versi terbaru sudah ter-deploy.
