> **Tag:** `v1.0.12`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.12`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.12.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.12

Rilis ini menyempurnakan sistem pelaporan error: **setiap kegagalan tak terduga sekarang langsung tampil sebagai alert**, bukan hanya tercatat diam-diam di menu "Log Error" seperti sebelumnya — dan bisa langsung dilaporkan ke pengembang lewat GitHub.

---

## Perubahan

### Setiap Error Sekarang Tampil sebagai Alert
Sebelumnya, kegagalan JS yang tak terduga (bukan hasil validasi biasa) hanya tercatat diam-diam ke menu "Log Error" — butuh admin membuka menu itu secara aktif untuk tahu ada masalah. Sekarang **setiap kegagalan tak terduga langsung memunculkan modal alert** berisi penjelasan awam + langkah yang perlu dilakukan, persis seperti alert kegagalan checkout yang sudah ada sebelumnya.

### Tombol "Salin Detail" & "Laporkan ke GitHub"
Modal alert error (di seluruh aplikasi — checkout, sinkron, dan sekarang juga error tak terduga) kini punya 2 tombol baru:
- **Salin Detail** — menyalin detail teknis lengkap ke clipboard, siap ditempel ke pesan WhatsApp/email ke admin.
- **Laporkan ke GitHub** — membuka form "Issue baru" GitHub yang **sudah terisi otomatis** (judul + detail teknis), tinggal ditinjau dan dikirim. Tidak ada apa pun yang terkirim otomatis/diam-diam.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.12.exe`.
