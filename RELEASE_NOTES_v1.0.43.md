# AIS POS Kasir Desktop v1.0.43

## Perbaikan kritis

1. **Aplikasi Kasir tiba-tiba tertutup sendiri saat transaksi** -- akar masalah: proses tampilan (renderer) bisa berhenti secara native (crash/OOM) tanpa lewat jalur penangkap error JS biasa, dan bila itu satu-satunya jendela terbuka, seluruh aplikasi ikut tertutup. Sekarang kejadian ini terdeteksi dan jendela Kasir dimuat ulang OTOMATIS -- kasir tidak perlu membuka ulang aplikasi secara manual, dan detail teknisnya tercatat ke Log Error.
2. **Nama kasir di Laporan Transaksi selalu "external_update"** -- kolom itu ternyata metadata audit generik yang tidak pernah terisi benar untuk transaksi dari Desktop/Android/Stok Opname. Sekarang nama kasir yang benar-benar login dicatat di kolom terpisah dan ditampilkan dengan benar (transaksi baru -- data lama tetap "external_update" krn belum ada info aslinya).
3. **"Buka Laci" -- kadang perintah "terkirim" tapi laci fisik tidak terbuka** -- beberapa printer memakai kabel pin berbeda (pin 2 vs pin 5). Ditambahkan tombol kedua &#128295; di sebelah "Buka Laci" untuk mencoba pin alternatif tanpa perlu bantuan developer, dan setiap percobaan (berhasil/gagal) sekarang tercatat detail teknisnya (nama printer, byte perintah, respons Windows) ke Log Error.

## Fitur baru

4. **Sinkronisasi Log Error ke server** -- seluruh error yang tercatat di menu "Log Error" perangkat ini sekarang otomatis dikirim ke server (setiap 60 detik bila online) sehingga admin pusat bisa memantau error dari SEMUA mesin POS (Desktop/Android) dari satu tempat, tanpa perlu akses fisik ke tiap perangkat.
5. **Identitas Mesin POS** -- layar Konfigurasi punya bagian baru "Identitas Mesin POS" untuk memberi nama perangkat ini (mis. "Kasir Depan"). Berguna untuk toko dengan lebih dari satu mesin POS: transaksi dan pesanan sekarang mencatat mesin asalnya, dan Laporan Transaksi menampilkan badge "Mesin Ini" vs nama mesin lain.
6. **Kolom Barcode Produk** (lanjutan dari rilis sebelumnya) -- pencarian/scan produk kini juga mencocokkan barcode, bukan cuma kode.

## Catatan

- Metode pembayaran baru (QRIS/BMT/E-Money Santri/Reward Santri/Voucher BMT dll) sudah bisa ditambahkan sendiri lewat menu admin "Cara Pembayaran" tanpa perlu update aplikasi.
- Perlu server AIS versi terbaru sudah ter-deploy.
