> **Tag:** `v1.0.8`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.8`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.8.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.8

Rilis ini menambahkan **jalan keluar darurat** untuk kasus overlay "Kas Belum Dibuka" yang nyangkut walau kas sudah "berhasil dibuka" — sambil akar masalah aslinya (bug di server) menunggu di-deploy oleh admin.

---

## Fitur Baru

### Tombol "Tutup" Darurat di Overlay "Kas Belum Dibuka"
Sebelumnya, satu-satunya jalan keluar dari overlay "Kas Belum Dibuka" adalah tombol "Buka Kas Sekarang" — kalau proses buka-kas di server gagal diam-diam (mis. bug/gangguan sisi server), kasir benar-benar terkunci total tanpa jalan keluar apa pun, walau butuh segera melayani transaksi.

Sekarang tersedia tombol kecil **"✕ Tutup"** di pojok kanan-atas overlay, terpisah dari tombol utama "Buka Kas Sekarang". Menekannya memunculkan **konfirmasi eksplisit** yang menjelaskan konsekuensinya, lalu (bila dilanjutkan):
- Overlay tertutup dan kasir bisa langsung menambah produk ke keranjang & membayar seperti biasa.
- Muncul **banner peringatan merah permanen** di bagian atas layar Kasir ("MODE DARURAT — gerbang wajib-buka-kas dilewati manual...") selama override ini aktif, supaya kasir/pemilik toko selalu sadar transaksi sedang berjalan di luar sesi kas resmi.
- Banner otomatis hilang sendiri begitu kasir berhasil membuka sesi kas resmi (baik lewat overlay maupun tombol "💰" di topbar).

> **Catatan penting soal cakupan**: ini murni **jalan keluar darurat sementara**, BUKAN pengganti fitur Sesi Kasir. Transaksi yang terjadi selama mode ini aktif **TIDAK ikut dihitung** dalam rekap "Penjualan Tunai/Non Tunai" maupun perhitungan **selisih kasir** saat "Tutup Kas" nanti — karena secara resmi tidak ada sesi kas yang menaunginya. Status override ini **tidak disimpan** (reset setiap aplikasi dibuka ulang), jadi kasir harus menekannya lagi tiap kali perlu, dan sebaiknya SEGERA membuka sesi kas resmi begitu memungkinkan (lihat catatan operasional di bawah soal akar masalahnya).

---

## Catatan Operasional: Kenapa Overlay Bisa Nyangkut

Ditemukan lewat laporan pengguna: tombol "Buka Kas Sekarang" menampilkan toast "Kas berhasil dibuka" TAPI overlay tetap muncul dan tidak ada error tercatat di log server. Root cause SUDAH diperbaiki di source server (`KantinHelper.sesiKasBuka`/`sesiKasTutup` — penyimpanan sesi kas sebelumnya tidak dibungkus transaksi Hibernate, jadi datanya diam-diam batal tersimpan meski server membalas "berhasil"), namun **perbaikan itu perlu di-build ulang & di-deploy ke server produksi** oleh admin sebelum efeknya terasa — bukan sesuatu yang bisa diperbaiki lewat update aplikasi Desktop ini saja. Tombol darurat di atas adalah jembatan sementara sampai deploy tsb selesai.

---

## Perubahan Teknis

- `pos.html`: tombol darurat `#btnTutupOverlayKasDarurat` di dalam `#kasTertutupOverlay`, banner baru `#bannerDaruratKas` (gaya sama dgn banner "MODE OFFLINE" yang sudah ada, warna merah).
- `pos-renderer.js`: flag in-memory `overrideDaruratTanpaSesiKas` (reset tiap aplikasi dibuka ulang) diperiksa di 3 titik yang sebelumnya HANYA memeriksa `sesiKasInfo.terbuka` — overlay produk, guard tambah-ke-keranjang, dan status aktif/nonaktif tombol Bayar — supaya ketiganya konsisten saat override dipakai.
- Tidak ada perubahan server pada rilis ini (fix akar masalah kas-nyangkut sudah ada di source server sesi sebelumnya, menunggu deploy terpisah oleh admin).
- Lolos `node --check`.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.8.exe`.
