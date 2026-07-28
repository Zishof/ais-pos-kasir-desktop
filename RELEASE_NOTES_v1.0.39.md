# AIS POS Kasir Desktop v1.0.39

## Stok Opname: paritas penuh dengan versi JSP/Web

Layar Stok Opname sekarang punya 3 tab, sejajar dengan JSP "Manajemen Stok Barang":

- **Kartu Mutasi Stok** (dashboard baru) -- KPI Barang Masuk/Barang Keluar/Total Stok/Peringatan Stok < 10, filter periode (Hari Ini/Minggu Ini/Bulan Ini/6 Bulan/Tahun Ini/3 Tahun), chart tren pergerakan barang (masuk vs keluar) dan Top 5 Barang Keluar -- semua dalam tampilan HTML/CSS (bukan Chart.js).
- **Stok Opname** (form manual, tidak berubah).
- **SO by Scan (HP/PDT)** (baru) -- scan barcode berturut-turut (scanner PDT eksternal maupun kamera HP), tiap hasil masuk antrean dengan penghitung otomatis (scan barcode yang sama menambah stok fisik +1), statistik langsung (item discan/lebih/kurang/selisih bersih) dengan indikator bunyi (beep) sukses/gagal, baru dikomit semua sekaligus lewat tombol "Simpan Semua".

## Produk: fungsi baru "Cetak Price Tag"

Tombol baru di layar Produk untuk mencetak label harga (price tag/POP): pilih produk, ukuran kertas (A2/A4/A5), jumlah label per halaman, salinan per produk, label promo opsional, serta checkbox tampilkan barcode/kode produk/nama toko -- lalu pratinjau dengan toolbar cetak sendiri (bukan dialog print bawaan Windows).

## Perubahan Teknis

- Server: aksi baru `stok_dashboard` (KPI + chart, query berparameter aman -- bukan SQL mentah dari klien seperti versi JSP) dan `price_tag_list_produk` (`KantinHelper.java`/`PosApi.java`).
- Barcode CODE128 dibangun di klien via JsBarcode (vendored lokal, bukan CDN -- sesuai kebijakan keamanan aplikasi ini).
- Kamera scan (SO by Scan) memakai html5-qrcode (vendored lokal).
- Seluruh berkas JS lolos `node --check`; server lolos `mvn compile`.

Fitur baru ini memerlukan server AIS versi terbaru (aksi `stok_dashboard`/`price_tag_list_produk`) sudah ter-deploy.
