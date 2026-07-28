# AIS POS Kasir Desktop v1.0.38

## Paritas Fitur Menu "Pesanan" dengan JSP/Web Admin

Menu Pesanan & Keranjang Tertahan sekarang sejajar dengan layar "Monitor Pesanan Online (Draft)" di JSP/Web admin -- tidak ada fitur yang tertinggal:

- **Filter**: Mulai, Akhir, Kode, Pembeli, dan (khusus admin) Pedagang -- tombol "Saring" untuk menerapkan.
- **Detail**: lihat rincian item, diskon, cashback, dan total tiap pesanan (baik yang sudah lunas maupun belum) tanpa harus membuka modal verifikasi.
- **Cetak Struk**: untuk pesanan yang sudah lunas, memakai pratinjau struk dengan toolbar (sama seperti di layar Kasir).
- **Hitung Ulang**: (admin/pengawas toko) menghitung ulang diskon & cashback memakai aturan diskon terkini -- berlaku untuk draft maupun transaksi yang sudah lunas (otomatis mengoreksi juga transaksi lunas terkait).
- **Bayar Semua**: (admin) memproses pembayaran seluruh pesanan online yang belum lunas sesuai filter aktif, satu per satu, dengan progress bar dan ringkasan berhasil/gagal.

Semua fitur baru ini memerlukan server AIS versi terbaru (aksi `pesanan_hitung_ulang` dan filter baru pada `pesanan_list`) sudah ter-deploy.
