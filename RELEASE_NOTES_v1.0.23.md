> **Tag:** `v1.0.23`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.23`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.23.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.23

## Fitur Baru: Unduh & Unggah Excel Katalog Barang (khusus Supervisor)

Layar "Produk" sekarang punya 2 tombol baru:

- **Unduh Excel** -- mengekspor seluruh katalog produk toko ke file `.xlsx` dengan format yang SAMA PERSIS dengan "Daftar Barang dan Jasa" (Kode, UPC/Barcode, Kategori, Nama Barang, Nama Pemasok Utama, Satuan, Kts, Def. Hrg. Jual Sa, Nilai Satuan).
- **Unggah Excel** -- mengunggah file Excel (baik hasil unduhan di atas maupun file "Daftar Barang dan Jasa" asli) untuk memperbarui katalog secara massal:
  - **Kode sudah ada di toko ini** → produk itu **diperbarui**. **Kode belum ada** → dibuat **produk baru**.
  - **Kategori/Pemasok/Satuan** yang namanya belum dikenal sistem otomatis **dibuat baru** dan langsung ditautkan ke produk -- tidak perlu membuatnya manual dulu.
  - **Kolom "Kts" (stok) RANGKAP FUNGSI jadi Stok Opname**: nilainya tidak menimpa stok begitu saja, tapi dicatat sebagai baris **Stok Opname resmi** (mesin yang sama dengan fitur Stok Opname Android) sehingga stok akhir produk otomatis sesuai angka di file, LENGKAP dengan jejak audit -- file ini jadi bisa dipakai sekaligus untuk opname stok fisik massal.

## Perbaikan: Cetak struk kini lebih tebal/gelap di printer thermal

Ada laporan cetakan struk keluar tipis/buram di printer thermal walau pratinjau di layar terlihat normal -- ini karena teks anti-aliased (abu-abu di tepi huruf) diterjemahkan printer thermal jadi titik jarang, bukan hitam pekat. Font struk sekarang dibuat lebih besar & tebal (700, dengan penebalan tepi huruf tambahan) khusus untuk pencetakan, supaya hasil di kertas jauh lebih jelas dan tidak buram. Perbaikan yang sama juga diterapkan ke struk versi POS Online (JSP) supaya konsisten.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.23.exe`.
