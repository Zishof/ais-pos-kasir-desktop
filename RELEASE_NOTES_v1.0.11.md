> **Tag:** `v1.0.11`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.11`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.11.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.11

Rilis ini menghadirkan menu **Konfigurasi** baru: tampilan aplikasi (judul + logo lokal), Profil Toko yang tersinkron ke server, dan manajemen **Akun Pedagang** dengan peran baru "Supervisor" untuk kasir toko yang boleh mengelola akun rekan kerjanya sendiri.

---

## Fitur Baru

### Menu "Konfigurasi"
Item navigasi baru di sidebar (semua layar), terbagi 3 bagian:

- **Tampilan Aplikasi** — atur judul jendela & logo sidebar. Tersimpan **lokal di perangkat ini saja**, tidak pernah dikirim ke server. Logo yang dipilih otomatis disalin ke folder aplikasi supaya tidak tergantung berkas sumber aslinya.
- **Profil Toko** — kelola data lengkap toko (Nama, Alamat, Kota, Kode Pos, Telp, Email, Nama & HP PIC, NPWP, Jam Operasional, Keterangan) langsung tersinkron ke server — data yang sama dipakai layar Manajemen Pedagang di web.
- **Akun Pedagang** — daftar akun kasir yang bisa login ke toko ini, lengkap status Aktif/Non-Aktif dan lencana peran (Kasir/Supervisor).

### Peran Baru: Supervisor Pedagang
Sebelumnya, hanya admin/manager global (login lewat akun kantor) yang bisa menambah/mengubah akun kasir dari Desktop. Sekarang, **kasir toko yang ditandai "Supervisor"** juga bisa:
- Melihat & mengelola (tambah/ubah/nonaktifkan) akun pedagang **lain di toko yang sama** — tanpa perlu login admin.
- Mengubah Profil Toko miliknya sendiri.

Kasir non-supervisor tetap bisa **melihat** daftar akun pedagang tokonya (transparansi), tapi tombol tambah/ubah otomatis disembunyikan. Penegakan hak akses sebenarnya ada di server — bukan sekadar disembunyikan di tampilan.

> **Catatan migrasi:** seluruh akun pedagang yang sudah ada otomatis berstatus **non-supervisor** (hanya-lihat) sampai eksplisit diaktifkan oleh admin lewat layar ini atau langsung di database.

---

## Perubahan Teknis

- **Server**: kolom baru pada `Toko` (9 field profil) dan `Pedagang.supervisor`; aksi PosApi baru `pedagang_list`, `pedagang_ubah`, `toko_profil_ambil`, `toko_profil_simpan`; `tambahAkunKasir` diperluas agar supervisor toko (bukan cuma admin global) bisa membuat akun baru untuk tokonya sendiri.
- Kolom baru di tabel utama (`koperasi.toko`, `koperasi.pedagang`) **otomatis ditambahkan Hibernate** (`hbm2ddl.auto=update`) saat server berikutnya start — tidak perlu ALTER manual.
- ⚠️ **Kecuali tabel audit** — `hbm2ddl.auto=update` terbukti tidak menyinkron kolom baru ke tabel audit Envers. Jalankan `MIGRASI_TOKO_PROFIL_PEDAGANG_SUPERVISOR.sql` (di root proyek `ais/`, sudah diperbarui agar hanya berisi ALTER tabel audit) sebelum baris Toko/Pedagang mana pun diubah lewat layar Konfigurasi — kalau tidak, penyimpanan akan gagal (INSERT ke tabel audit gagal → rollback).
- **Desktop**: halaman baru `konfigurasi.html`/`konfigurasi-renderer.js`, skrip bersama `branding.js` (diterapkan ke seluruh 9 layar) untuk menerapkan judul/logo kustom ke sidebar setiap halaman.
- Seluruh berkas JS lolos `node --check`; server lolos `mvn -o compile`.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.11.exe`.
