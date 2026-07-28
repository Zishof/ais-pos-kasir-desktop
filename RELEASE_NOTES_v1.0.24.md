> **Tag:** `v1.0.24`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.24`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.24.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.24

## Fitur Baru: Layar Tinjau (Review) Impor Excel sebelum disimpan

Alur "Unggah Excel" di layar Produk sekarang **TIDAK langsung menyimpan** ke server. Setelah memilih file, muncul dulu **layar tinjau** berisi tabel semua baris yang akan diproses -- baris ditandai hijau di kiri kalau produknya baru (belum ada di toko ini):

| Kolom | Bisa diubah? |
|---|---|
| No, Kode, Barcode, Nama Produk | Hanya lihat |
| Kategori | Bisa diubah (ketik nama baru atau pilih dari daftar) |
| Pemasok/Penyedia | Bisa diubah (ketik nama baru atau pilih dari daftar) |
| Stok Baru | Bisa diubah |
| Stok Lama, Selisih | Hanya lihat (dihitung otomatis) |
| Satuan | Bisa diubah |
| Harga Jual, Nilai Barang (harga beli) | Bisa diubah |
| Nilai Total | Hanya lihat (Stok Baru × Nilai Barang, dihitung otomatis) |

Di layar ini tersedia 4 tombol:
- **Simpan** -- baru di titik ini data benar-benar dikirim & disimpan ke server (dengan nilai yang sudah ditinjau/diedit).
- **Batal** -- menutup layar tanpa mengubah apa pun di server.
- **Cetak PDF** -- mencetak/menyimpan-sebagai-PDF isi tabel yang sedang ditinjau (lewat dialog cetak Windows).
- **Download Excel** -- mengunduh file `.xlsx` (format sama seperti "Daftar Barang dan Jasa") berisi data PERSIS seperti yang sedang ditampilkan/diedit di layar, bukan data lama dari file asli.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.24.exe`.

## Catatan

Fitur ini baru diverifikasi lewat pemeriksaan kode + kompilasi server + pemuatan halaman tanpa galat -- belum diuji langsung klik-per-klik dengan file Excel sungguhan di aplikasi berjalan. Mohon diuji alur lengkapnya (pilih file → tinjau/edit → Simpan) sebelum benar-benar diandalkan di lapangan.

**Belum tersedia di Android** -- versi Android untuk sementara masih memakai alur unggah langsung (tanpa layar tinjau); tabel edit sebesar ini kurang praktis di layar HP, jadi menyusul dengan desain yang lebih sesuai untuk layar sentuh.
