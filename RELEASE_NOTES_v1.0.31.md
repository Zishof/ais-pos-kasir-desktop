# AIS POS Kasir Desktop v1.0.31

## Fitur baru: "Hitung Ulang Stok" (Katalog Barang, khusus supervisor/admin)

Tombol baru di sebelah kotak pencarian layar **Katalog Barang** -- merekalkulasi stok SEMUA
produk toko dari rekam jejak pengadaan/stok opname/penjualan/pemakaian bahan baku, mirip fitur
serupa di POS Online.

**Ini juga jalan pemulihan mandiri** untuk bug "Stok tetap Habis walau sudah diisi lewat Unggah
Excel/Stok Opname" yang dilaporkan sebelumnya -- sebelum menghitung ulang, tombol ini otomatis
memperbaiki dulu riwayat Stok Opname lama yang kolom `selisih`-nya kadung tersimpan salah (root
cause bug tersebut), jadi tidak perlu menjalankan SQL manual.

> **Catatan penting:** fitur ini butuh SERVER (bukan cuma aplikasi Desktop ini) sudah di-deploy
> dengan perbaikan yang sama (aksi baru `stok_hitung_ulang` di `PosApi`/`KantinHelper`). Sebelum
> server di-deploy, tombol ini akan menampilkan pesan gagal -- itu wajar, bukan bug baru.
