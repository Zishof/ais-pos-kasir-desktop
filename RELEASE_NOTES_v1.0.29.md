> **Tag:** `v1.0.29`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.29`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.29.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.29

## Fitur Baru: Diskon Otomatis Saat Checkout (Fase 4)

Layar Kasir sekarang menerapkan **Aturan Diskon** (yang dibuat lewat menu "Aturan Diskon") secara otomatis, persis seperti yang sudah berjalan di versi web (JSP) dan ZK -- bukan fitur baru, murni porting mesin yang sudah ada:

- Setiap kali keranjang berubah (tambah/kurangi qty/hapus/pilih member), sistem otomatis mengecek aturan yang cocok untuk tiap produk -- target produk, toko, jenis/tipe member, dan masa berlaku -- lalu menghitung potongannya (persentase atau nominal, dengan batas maksimal potongan).
- Baris keranjang yang kena diskon menampilkan badge kecil "-Rp ..." (potong langsung) atau "+Rp ... cashback" (masuk saldo cashback, dihitung terpisah -- tidak mengurangi total yang harus dibayar).
- Ringkasan keranjang menampilkan baris "Diskon Otomatis" dan "Cashback Diperoleh" bila ada, dan Total sudah memperhitungkan potongan tersebut sebelum pajak.
- Struk cetak juga otomatis menampilkan rincian diskon/cashback per item dan totalnya (mesinnya sudah siap sejak sebelumnya, sekarang benar-benar terisi datanya).
- Bila server tidak bisa dihubungi saat mengevaluasi diskon (mis. sedang offline), transaksi TETAP bisa dilanjutkan tanpa diskon -- bukan diblokir.

## Fitur Baru: Tombol "Full Layar" di Panel Keranjang + Pencarian Cepat

- Tombol toggle "Full Layar" / "Tampilan Normal" sekarang juga ada langsung di judul panel Keranjang (selain tombol "Fokus Keranjang" yang sudah ada di topbar) -- klik untuk menyembunyikan grid produk dan fokus penuh ke keranjang.
- Saat mode ini aktif, kotak pencarian (yang pindah ke atas keranjang) sekarang menampilkan **daftar hasil pencarian (dropdown)** saat kasir mengetik nama atau kode produk -- jadi kasir tetap bisa mencari produk lewat nama/kode, bukan cuma scan barcode persis. Klik salah satu hasil untuk langsung menambahkannya ke keranjang.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.29.exe`.

## Catatan

Fitur-fitur ini baru diverifikasi lewat pemeriksaan kode + kompilasi server + pemeriksaan sintaks JS -- belum diuji langsung klik-per-klik. Mohon diuji sebelum diandalkan di lapangan, terutama:
1. Pastikan aturan diskon yang sudah dibuat benar-benar terpotong sesuai aturan (produk/toko/member/tanggal/batas maksimal) saat dites di Kasir.
2. Pastikan angka Total yang dikirim ke server saat checkout sudah benar (sudah dikurangi diskon, belum termasuk cashback).
3. Coba mode "Full Layar" -- pastikan pencarian nama/kode menampilkan hasil yang bisa diklik.
