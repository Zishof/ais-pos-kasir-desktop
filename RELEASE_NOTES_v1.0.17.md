> **Tag:** `v1.0.17`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.17`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.17.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.17

## Perbaikan

### "Gagal menyalin: Document is not focused" di Log Error
Tombol "Salin" (per baris) maupun "Salin Semua Error" bisa gagal dengan pesan ini kalau jendela aplikasi kebetulan tidak sedang fokus saat tombol diklik -- browser modern sengaja menolak akses clipboard tanpa fokus dokumen. Sekarang ada cara cadangan (metode salin klasik) yang otomatis dipakai kalau cara utama gagal, jadi tombol Salin selalu berhasil.

### Logo sidebar tampil raksasa menutupi menu
Kalau logo kustom (menu Konfigurasi > Tampilan Aplikasi) yang diunggah berupa foto beresolusi tinggi/rasio tidak persegi, logo bisa tampil jauh lebih besar dari kotaknya dan menutupi seluruh menu sidebar. Sekarang ukuran logo selalu dipaksa pas ke kotaknya di semua halaman, apa pun ukuran/rasio foto aslinya.

## Perbaikan lanjutan untuk "Kas Belum Dibuka" macet

v1.0.16 menambahkan percobaan-ulang otomatis, tapi laporan lanjutan menunjukkan pada sebagian kasus masalahnya **bukan sekadar jeda sesaat** -- percobaan berulang (bahkan setelah menunggu lama/beberapa kali klik) tetap gagal. Rilis ini menambahkan pencatatan log server yang lebih rinci (`[SESI-KAS-STATUS]`, sejajar dengan `[SESI-KAS-BUKA]` yang sudah ada) supaya kejadian berikutnya bisa langsung dibandingkan by log untuk memastikan penyebab pastinya -- **perbaikan ini perlu di-deploy dulu ke server produksi Anda** (lewat proses SVN+ant yang biasa dipakai) sebelum efeknya terlihat; sisi aplikasi Desktop-nya sendiri sudah menampilkan pesan yang jelas ("Kas sudah tersimpan di server, tapi tampilan belum ikut memperbarui") sambil menunggu itu.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.17.exe`.
