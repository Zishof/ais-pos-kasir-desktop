# AIS POS Kasir Desktop v1.0.41

## Perbaikan

1. **"Cetak Struk" di layar Ringkasan (Riwayat Transaksi) langsung cetak diam-diam, tidak lewat preview** -- sekarang memakai jendela pratinjau yang sama seperti tombol "Cetak Struk" di layar Kasir.
2. **Dasbor Stok Opname tidak muncul saat pertama dibuka** -- sebelumnya kasir harus klik "Muat Ulang" dulu baru data KPI/grafik tampil. Sekarang dasbor otomatis dimuat begitu layar Stok Opname dibuka.
3. **"Cetak Price Tag" belum ada pilihan jenis label** -- ditambahkan dropdown "Jenis Cetak" (POP Besar / Stiker Label Warna / Label Teks) seperti versi JSP; masing-masing jenis punya tata letak & pengaturan sendiri (Ukuran Kertas & Label per Halaman hanya relevan utk POP Besar).

## Fitur baru

4. **Bahan Baku (Resep) & HPP** pada form Tambah/Ubah Produk -- pilih produk lain sbg bahan, tentukan qty, sistem otomatis hitung Harga Pokok Produksi (HPP) dari total bahan dan menjadikannya harga beli produk saat disimpan (persis seperti versi JSP).
5. **Scan barcode lebih efisien** -- kotak pencarian di layar Kasir sekarang otomatis "Select All" setiap kali Enter ditekan/barcode discan, supaya scan berikutnya langsung menimpa teks lama alih-alih menyambungnya.
6. **Tanda bulat merah pesanan online baru** -- menu "Pesanan" di sidebar sekarang menampilkan badge merah berisi jumlah pesanan online baru yang belum dilihat, tampil konsisten di semua layar (bukan cuma layar Kasir), dan otomatis nol saat layar Pesanan dibuka.
