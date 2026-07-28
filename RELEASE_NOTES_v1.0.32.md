# AIS POS Kasir Desktop v1.0.32

## Enhance: Simpan Impor Katalog kini offline-first + laporan hasil lengkap

**Layar Produk (Tinjau Impor Katalog):**

- **Offline-first.** Klik "Simpan" sekarang SELALU menyimpan data ke perangkat ini terlebih dahulu
  (SQLite lokal, sama seperti transaksi Kasir), baru dicoba dikirim ke server. Kalau sedang offline,
  data tetap aman tersimpan dan **otomatis terkirim di latar begitu koneksi internet pulih** (dicek
  berkala tiap 30 detik selama aplikasi terbuka) -- tidak perlu klik ulang apa pun.
- **Laporan hasil impor** langsung terbuka di jendela baru setiap kali "Simpan" diklik -- menunjukkan
  status tiap baris (Berhasil/Gagal/Dilewati), aksi stok (disesuaikan via Opname / tidak berubah),
  perubahan stok lama→baru, kategori/pemasok/satuan yang baru dibuat, dan **penyebab teknis** bila
  ada baris yang gagal. Laporan ini bisa **diunduh sebagai berkas .txt** atau dicetak langsung dari
  jendela tersebut.
- **Stok Opname kini hanya dicatat bila memang ada selisih** -- baris yang stoknya tidak berubah
  (mis. cuma update harga) tidak lagi membuat riwayat opname kosong (selisih 0) yang membanjiri
  riwayat.

> **Catatan:** perbaikan detail laporan per-baris & "opname hanya jika ada selisih" ini butuh
> perubahan di SERVER (`KantinHelper.produkImporExcelKomit`) yang sudah disiapkan terpisah -- pastikan
> server sudah di-deploy dengan perubahan terbaru supaya laporan menampilkan detail lengkap (bukan
> cuma ringkasan lama).
