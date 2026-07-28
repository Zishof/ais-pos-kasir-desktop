> **Tag:** `v1.0.18`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.18`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.18.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.18

## Fitur Baru: Update Otomatis (mirip Windows Update)

Sebelumnya, aplikasi hanya menampilkan badge oranye + toast saat ada versi baru -- kasir harus sendiri membuka "Update Sistem" untuk memprosesnya. Sekarang:

- Begitu versi baru terdeteksi (pengecekan otomatis tetap berjalan seperti biasa: saat aplikasi dibuka + tiap 3 jam), muncul **popup tawaran** langsung menanyakan apakah mau update sekarang, lengkap dengan catatan rilisnya.
- Popup itu punya checkbox **"Update Otomatis"** -- kalau dicentang, aplikasi tidak akan bertanya lagi untuk versi-versi berikutnya: unduhan berjalan sendiri di latar begitu ada versi baru terdeteksi.
- Walau "Update Otomatis" aktif, **pemasangan tetap butuh konfirmasi eksplisit** lewat popup "Pembaruan Siap Dipasang" (Restart & Pasang Sekarang / Nanti Saja) -- aplikasi tidak pernah me-restart dirinya sendiri secara diam-diam, supaya kasir tidak kaget di tengah transaksi.
- Preferensi "Update Otomatis" tersimpan permanen (berkas `update-preferensi.json` terpisah dari konfigurasi server, supaya tidak berisiko merusak pengaturan koneksi).

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.18.exe`.
