> **Tag:** `v1.0.20`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.20`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.20.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.20

## Perubahan Besar: Sesi Kasir kini Offline-First

Setelah rangkaian laporan lapangan "Kas Belum Dibuka/Tertutup tak mau hilang" (akar masalahnya sudah diperbaiki di sisi server terpisah), Sesi Kasir sekarang dibangun ulang total supaya **tidak pernah lagi bergantung pada respons server secara langsung**:

- **Buka Kas / Tutup Kas kini instan** -- tersimpan ke database lokal perangkat ini SEKETIKA, kasir langsung bisa lanjut jualan tanpa menunggu jaringan sama sekali.
- **Berfungsi penuh saat offline** -- kasir tetap bisa membuka kas, berjualan, dan menutup kas walau tidak ada koneksi internet sama sekali.
- **Sinkronisasi otomatis di latar** -- begitu ada koneksi (baik segera maupun beberapa jam kemudian), sesi kas yang tersimpan lokal otomatis dikirim ke server tanpa perlu tindakan apa pun dari kasir (dicoba tiap 30 detik selama aplikasi terbuka).
- **Aman dari duplikat** -- setiap sesi kas punya kode unik yang dibuat perangkat ini sendiri; percobaan sinkron berulang (mis. sempat gagal lalu dicoba lagi) tidak akan pernah membuat sesi kas dobel di server.
- Selisih kas akhir tetap dihitung **server** (akurat dari seluruh riwayat transaksi toko) -- selama sesi belum sempat tersinkron, aplikasi menampilkan tanda "⏳ belum sinkron" yang jelas alih-alih angka yang seolah final.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.20.exe`.

## Catatan penting

Fitur ini baru diverifikasi lewat pemeriksaan sintaks/logika kode -- **belum diuji langsung di aplikasi berjalan** (buka kas offline, tutup kas offline, pastikan sinkron berhasil begitu online kembali). Mohon diuji dengan skenario itu sebelum benar-benar diandalkan di lapangan.
