> **Tag:** `v1.0.27`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.27`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.27.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.27

## Menu baru: Stok Opname

Menu baru di sidebar, prosesnya sama seperti "SO by Scan" di POS Online (JSP) dan alur cari-produk yang sudah dipakai layar Produk: ketik/scan barcode atau kode produk, sistem menampilkan stok sistem saat ini, masukkan hasil hitung fisik + keterangan (opsional), lalu Simpan. Setiap catatan langsung tersimpan resmi (stok produk otomatis disesuaikan, ada jejak audit) -- tidak ada langkah persetujuan terpisah, sama seperti versi JSP/aplikasi Android "Stok Opname" yang sudah ada. Ringkasan hari ini (jumlah produk, total lebih/kurang, selisih bersih) selalu tampil di bagian atas.

## Perubahan: hak akses "hanya supervisor boleh edit, selain itu lihat saja"

Sesuai permintaan klien, 4 menu berikut sekarang mengikuti aturan yang sama: **siapa saja yang login boleh MELIHAT**, tapi **hanya supervisor toko atau admin/manager yang boleh menambah/mengubah**:

- **Produk** -- sebelumnya kasir biasa sama sekali tidak bisa membuka katalog produk; sekarang bisa melihat (berguna untuk cek harga/stok saat melayani pembeli), hanya tombol Tambah/Ubah/Excel yang disembunyikan.
- **Customer/Anggota** -- daftar anggota selalu terlihat, tombol Tambah/Ubah disembunyikan untuk non-supervisor.
- **Aturan Diskon** -- daftar aturan selalu terlihat, tombol Tambah/Ubah disembunyikan untuk non-supervisor.
- **Stok Opname** (baru) -- kasir biasa hanya melihat ringkasan hari ini; form pencatatan hanya muncul untuk supervisor/admin.

Gerbang ini ditegakkan di **server** (bukan cuma disembunyikan di layar) -- percobaan mengakali lewat cara lain tetap ditolak.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.27.exe`.

## Catatan

Fitur-fitur ini baru diverifikasi lewat pemeriksaan kode + kompilasi server + pemeriksaan sintaks JS -- belum diuji langsung klik-per-klik di aplikasi berjalan. Mohon diuji sebelum benar-benar diandalkan di lapangan, terutama alur Stok Opname (server mencatat perubahan stok nyata) dan pastikan akun kasir yang login TIDAK bercentang Supervisor untuk menguji mode lihat-saja.

**Belum tersedia di Android** -- keempat perubahan ini untuk saat ini khusus Desktop.

**Tentang "Kulakan"**: masih menunggu klarifikasi cakupan dari klien sebelum dikerjakan -- modul "Kulakan &amp; Pengadaan" di versi JSP mencakup 8 sub-modul berbeda (Harga Beli, PR-Permintaan, PO-Pemesanan, BAST-Penerimaan, Draft Inventaris, Terima Tagihan, PKS-Kerjasama, Retur Barang, Pemakaian Bahan Baku) dan belum ada satu pun yang punya versi Desktop/Android.
