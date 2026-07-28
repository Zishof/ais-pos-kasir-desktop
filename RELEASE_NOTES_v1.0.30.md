# AIS POS Kasir Desktop v1.0.30

## Perbaikan Kritis (urgent -- dari laporan crash v1.0.29)

- **Fix crash "Cannot access 'elSearchDropdown' before initialization"** -- toggle Full Layar Keranjang
  di v1.0.29 bisa menyebabkan layar Kasir gagal terbuka (window.onerror ReferenceError) karena urutan
  deklarasi variabel salah. Sudah diperbaiki -- layar Kasir kini terbuka normal.

## FASE 5 -- Keranjang Tertahan & Metode Bayar per Anggota

- **Tombol "Tahan"** ditambahkan di layar Kasir (sebelah tombol Bayar) -- simpan keranjang saat ini
  sbg draft belum-lunas, kosongkan layar utk melayani pelanggan berikutnya.
- **Layar "Pesanan" kini juga menampilkan Keranjang Tertahan** (bukan cuma Pesanan Online) dgn badge
  pembeda "Pesanan Online" vs "Keranjang Tertahan". Keranjang tertahan punya tombol baru **"Muat ke
  Keranjang"** -- membuka kembali layar Kasir dgn seluruh isi keranjang (produk, jumlah, diskon,
  member, metode bayar) terpulihkan persis seperti saat ditahan, siap dilanjutkan/diedit.
- **Metode pembayaran kini tersaring otomatis** sesuai jenis keanggotaan member yang dipilih di
  Kasir (sebelumnya daftar metode bayar sama utk semua orang, tidak menghormati pembatasan per
  jenis-anggota seperti di versi web) -- daftar disegarkan tiap kali member dipilih atau dihapus dari
  keranjang.
- Fix kecil: pemulihan member saat "Muat ke Keranjang" dalam kondisi **offline** kini benar-benar
  mencari member yang dimaksud di cache lokal (sebelumnya berisiko salah mengaitkan ke member lain
  yang kebetulan tersimpan lebih dulu di cache) -- bila member tetap tidak ditemukan di cache, kasir
  diberi tahu jelas lewat notifikasi, bukan diam-diam salah pilih.

## Catatan

Fitur "Diskon Otomatis saat Checkout" (Fase 4, dari rilis sebelumnya) tetap berjalan seperti biasa --
diskon/cashback per item tetap ikut dipulihkan dgn benar saat "Muat ke Keranjang".
