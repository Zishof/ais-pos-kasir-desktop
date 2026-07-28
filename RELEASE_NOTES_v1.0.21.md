> **Tag:** `v1.0.21`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.21`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.21.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.21

## Perbaikan: Kotak pencarian barcode kini otomatis kosong setelah scan

Sebelumnya, setelah scan barcode dan barang berhasil ketemu, kotak "Cari" masih menampilkan kode barang yang baru saja discan -- kasir harus menghapusnya manual dulu sebelum bisa scan barang berikutnya. Sekarang:

- Begitu scanner mengirim Enter dan kode barang **cocok persis** dengan salah satu produk, barang otomatis ditambahkan ke keranjang **dan kotak pencarian langsung dikosongkan** -- siap scan barang berikutnya tanpa jeda.
- Kalau kode yang di-scan/diketik **tidak cocok persis** dengan produk manapun (mis. sedang mengetik pencarian manual), kotak dibiarkan apa adanya -- hasil filter pencarian tetap tampil seperti biasa.

## Catatan

Rilis ini juga menyertakan kode Sesi Kasir Offline-First dari v1.0.20 (belum ada perubahan lanjutan pada fitur itu di rilis ini).

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.21.exe`.
