> **Tag:** `v1.0.16`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.16`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.16.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.16 (Perbaikan Penting)

## Perbaikan: Overlay "Kas Belum Dibuka" bisa macet walau server sudah berhasil

**Gejala yang dilaporkan:** setelah menekan "Buka Kas & Mulai", overlay besar "Kas Belum Dibuka" tetap tampil menutupi layar produk — padahal log server (`catalina.out`) jelas menunjukkan permintaan buka kas SUKSES dan sudah ter-commit permanen ke database.

**Penyebab:** aplikasi hanya mengecek status kas **satu kali** langsung setelah server membalas "berhasil". Di lapangan ditemukan kasus di mana pengecekan status itu (permintaan terpisah ke server) sempat membalas kondisi LAMA sesaat sebelum benar-benar konsisten dengan data yang baru saja tersimpan — bukan karena data gagal tersimpan (memang sudah tersimpan, terbukti dari log server), tapi soal jeda singkat di sisi infrastruktur server sebelum permintaan berikutnya ikut melihat perubahan itu. Sebelumnya, begitu pengecekan pertama ini "kurang beruntung", aplikasi langsung menyerah dan overlay macet sampai kasir menutup-buka aplikasi secara manual.

**Perbaikan:** kalau pengecekan status pertama belum mencerminkan status baru, aplikasi sekarang otomatis mencoba lagi beberapa kali dengan jeda singkat (total sekitar 5 detik) sebelum benar-benar menganggap ada masalah. Pola yang sama juga diterapkan ke Tutup Kas. Kalau setelah semua percobaan tetap tidak sesuai, baru dicatat ke Log Error dan kasir diberi tahu jelas bahwa data sudah tersimpan di server, hanya tampilannya yang perlu disegarkan (coba tekan tombol sekali lagi atau muat ulang aplikasi).

**Bila Anda mengalami gejala ini SEBELUM update ke versi ini:** kas Anda kemungkinan besar SUDAH berhasil terbuka di server (seperti terlihat di log) — cukup tutup dan buka ulang aplikasi untuk menyegarkan tampilan, tidak perlu menekan "Buka Kas" berulang kali.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.16.exe`.
