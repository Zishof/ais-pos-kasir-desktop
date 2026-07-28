> **Tag:** `v1.0.14`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.14`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.14.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.14

Rilis ini menambahkan **picker member yang bisa dipakai offline**, lengkap dengan foto member tersimpan lokal, serta memperluas data yang aman disimpan lokal supaya layar-layar lain tetap berguna saat koneksi terputus.

---

## Perubahan

### Picker Member Offline + Cache Foto
- Kotak "Cari member" di layar Kasir sekarang jadi **picker bergaya kartu**: foto bulat (atau inisial bila belum ada foto), nama, kode/ID, dan lencana "🔒 PIN" bila member itu wajib verifikasi PIN.
- Tombol **"Sinkronkan"** di dalam picker mengunduh seluruh data member + foto dari server ke database lokal (SQLite), dengan progress bar bertahap (data dulu, lalu foto). Foto HANYA diunduh lewat tombol ini secara manual — data teks anggota tetap bisa disegarkan otomatis saat online seperti biasa.
- Foto dibandingkan nama+ukuran berkas sebelum diunduh ulang — foto yang belum berubah di server tidak diunduh dua kali, jadi sinkron ulang cepat.
- **Saat offline**, pencarian member otomatis jatuh ke data tersimpan lokal, dengan penanda jelas "⚠️ Offline -- hasil dari data tersimpan (saldo tidak bisa diperiksa sampai online kembali)" — saldo TETAP tidak pernah diambil dari cache (data finansial wajib real-time).

### Cache Data Umum Lainnya (offline-aware)
Diperluas mengikuti pola yang sama dengan katalog produk/konfigurasi toko:
- **Profil Toko** (nama/alamat/kontak) — sekarang tersimpan lokal, tetap tampil walau offline (mis. untuk kop struk).
- **Katalog Laporan** (daftar menu laporan yang tersedia) — tersimpan lokal, sehingga layar Laporan tidak kosong total saat offline (menjalankan laporan itu sendiri tetap butuh koneksi).

**Yang SENGAJA tetap wajib online** (tidak diberi cache, demi keamanan data): Aturan Diskon, daftar/tambah Anggota, daftar Akun Pedagang, dan seluruh angka Dasbor Analitik — karena data ini bisa memengaruhi harga, akses, atau keputusan bisnis kalau sampai basi.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.14.exe`.
