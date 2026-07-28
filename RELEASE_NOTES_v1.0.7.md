> **Tag:** `v1.0.7`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.7`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.7.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.7

Rilis ini menambahkan **layar "Aturan Diskon"** — permintaan untuk mengelola aturan promo/diskon dari Desktop, setara dengan yang sudah ada di aplikasi POS versi web.

---

## Fitur Baru

### Layar "Aturan Diskon"
Menu baru **"Aturan Diskon"** di sidebar (tersedia di semua layar Desktop) membuka layar pengelolaan aturan promo lengkap: pencarian, daftar berpaginasi (nama aturan, produk target, toko target, nilai diskon, cara eksekusi, status aktif), serta form tambah/ubah dengan seluruh opsi yang tersedia di versi web:

- **Nama & Keterangan Aturan** — label bebas, mis. "Promo Akhir Tahun Indomie".
- **Target Produk** — berlaku untuk **satu produk spesifik** (dicari lewat kode produk) atau **semua produk** (toggle).
- **Target Toko** *(khusus akun admin/manager)* — berlaku di **satu toko tertentu** atau **semua toko** (global). Akun kasir toko biasa otomatis terkunci ke tokonya sendiri — tidak bisa membuat aturan lintas-toko.
- **Target Member** — berlaku untuk **semua member (publik)**, atau dipersempit ke **Jenis Anggota** dan/atau **Tipe Anggota** tertentu.
- **Masa Berlaku** — tanggal & waktu mulai/selesai (opsional, kosong berarti tanpa batas waktu).
- **Nilai Diskon** — Persentase (%) dengan batas Maksimal Potongan (Rp), atau Nominal Tetap (Rp).
- **Logika Eksekusi** — **Potong Langsung** di struk, atau **Simpan Jadi Saldo Diskon/Cashback** untuk dicairkan member kemudian.
- **Batas 1x Per Hari Per Toko** — opsional, membatasi pemakaian aturan per member per toko per hari.

Aturan yang dibuat/diubah dari sini langsung berlaku di mesin promo yang sudah ada — begitu disimpan, checkout di layar Kasir **web dan ZK** otomatis menerapkannya tanpa langkah tambahan.

> **Catatan cakupan (penting)**: layar ini murni untuk **mengelola** aturan diskon (buat/ubah/lihat daftar). Penerapan otomatis aturan tersebut **saat checkout di Kasir Desktop ini sendiri belum tersedia** — mesin perhitungan diskon (`evaluasiDiskon`) yang dipakai Kasir web/ZK belum di-porting ke Desktop. Kasir Desktop yang ingin memakai promo bisa membuat/mengaktifkan aturannya dari layar baru ini, namun checkout di Kasir Desktop untuk saat ini tetap menghitung transaksi tanpa diskon otomatis. Ini keputusan cakupan yang disengaja untuk rilis ini — beri tahu bila penerapan otomatis di checkout Desktop dibutuhkan sebagai tahap lanjutan.

---

## Perubahan Teknis

- **Server** (`PosApi.java` / `KantinHelper.java`): 4 aksi baru — `diskon_list`, `diskon_simpan`, `jenis_anggota_list` *(dipakai ulang dari layar Anggota)*, `tipe_anggota_list`. Mengelola entity `AturanDiskon` (`koperasi.aturan_diskon`) yang sudah ada — tidak ada tabel/model baru.
- **Desktop**: halaman baru `diskon.html` + `diskon-renderer.js`, ditautkan ke sidebar navigasi seluruh 7 layar Desktop.
- Seluruh berkas JS baru/diubah lolos `node --check`; seluruh berkas Java terkait dikompilasi bersih (`javac --release 8`).

---

## Catatan Operasional: Auto-Update Belum Berfungsi

Fitur "Update Sistem" di aplikasi menampilkan error **"Repo GitHub tempat rilis aplikasi ini disimpan tidak ditemukan"**. Ini BUKAN bug di kode pengecekan pembaruan (kode tersebut sudah benar mendeteksi dan melaporkan kegagalan ini) — penyebabnya adalah repo `Zishof/ais-pos-kasir-desktop` yang dikonfigurasi di `package.json` **belum pernah dibuat/diisi rilis apa pun di GitHub**. Sampai repo tersebut dibuat (atau diisi minimal 1 rilis publik), fitur pengecekan pembaruan otomatis akan terus menampilkan pesan ini — instalasi manual (menjalankan installer versi terbaru) tetap berfungsi normal tanpa terpengaruh.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.7.exe`.
