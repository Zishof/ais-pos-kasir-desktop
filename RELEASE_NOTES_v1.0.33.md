# AIS POS Kasir Desktop v1.0.33

## Enhance: verifikasi otomatis + saran perbaikan + unduh laporan otomatis

Lanjutan dari v1.0.32 (offline-first + laporan hasil impor) -- Katalog Barang (Tinjau Impor Katalog):

- **Verifikasi pasca-simpan.** Server sekarang membaca ULANG setiap baris yang dilaporkan "berhasil"
  langsung dari database (bukan cuma percaya tidak ada error saat proses) untuk memastikan data yang
  diunggah BENAR-BENAR tersimpan sesuai yang diharapkan. Kalau ada yang tidak sesuai (mis. akibat bug
  di jalur lain, atau gangguan saat commit), baris itu diturunkan jadi "gagal" dengan rincian nilai
  yang diharapkan vs yang sungguhan tersimpan di database.
- **Saran perbaikan per baris.** Baris yang gagal disertai saran konkret apa yang bisa dicoba (kode
  duplikat, format angka salah di Excel, kolom wajib kosong, dll) -- bukan cuma pesan error teknis
  mentah.
- **Unduh otomatis.** Laporan .txt sekarang **langsung tersimpan otomatis** ke folder
  `Downloads\AIS POS - Laporan Impor Katalog\` begitu proses impor selesai -- tidak perlu klik apa
  pun. Tombol "Unduh sebagai .txt" di jendela laporan tetap ada untuk menyimpan ulang/pindah lokasi
  secara manual bila perlu.
- **Peringatan eskalasi.** Kalau ada baris yang gagal, laporan menampilkan catatan tegas di bagian
  atas: coba dulu saran perbaikannya dan impor ulang, dan kalau kegagalan terus berlanjut, laporkan
  ke admin/tim pengembang **dengan wajib melampirkan tangkapan layar (screenshot)** laporan tersebut.

> **Catatan:** butuh server (backend) yang sudah di-deploy dengan perubahan terbaru
> (`KantinHelper.produkImporExcelKomit`) supaya verifikasi & saran perbaikan aktif.
