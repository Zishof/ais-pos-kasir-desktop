> **Tag:** `v1.0.19`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.19`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.19.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.19

## Perbaikan

### Sinkronisasi data anggota/member gagal "Waktu tunggu habis"
Tombol "Sinkronkan" di picker member selalu gagal dengan pesan "Waktu tunggu habis -- server tidak merespons" pada basis data anggota yang besar (ribuan anggota). Penyebabnya: batas waktu tunggu 15 detik yang dipakai untuk SEMUA permintaan ke server ternyata terlalu ketat khusus untuk sinkronisasi anggota -- server memproses foto tiap anggota satu per satu sehingga satu batch (500 anggota) bisa memakan waktu lebih dari 15 detik pada percobaan pertama. Sekarang khusus permintaan ini diberi batas waktu 60 detik dan ukuran batch dikecilkan (200 anggota per permintaan) supaya tiap permintaan tuntas lebih cepat dan tidak lagi kehabisan waktu.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.19.exe`.
