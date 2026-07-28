# AIS POS Kasir Desktop v1.0.40 (Hotfix)

Perbaikan 2 crash yang dilaporkan setelah v1.0.39:

1. **"Cetak Price Tag" gagal (`daftarProdukPriceTag.filter is not a function`)** -- respons daftar produk dari server salah dibongkar (mengambil seluruh objek `{status, data}` alih-alih hanya isi `data`-nya). Diperbaiki di `produk-renderer.js`. Bug yang sama juga ditemukan (dan sekalian diperbaiki) di riwayat Stok Opname (`stokopname-renderer.js`) -- sebelumnya riwayat selalu tampil kosong secara diam-diam karena bug yang sama, bukan sekadar belum ada data.
2. **"Cetak Struk" di layar Pesanan gagal (`Cannot read properties of undefined (reading 'cetakDenganPreview')`)** -- berkas `struk.js` lupa disertakan di `pesanan.html`. Sudah ditambahkan.

Tidak ada perubahan fitur baru di rilis ini -- murni perbaikan bug dari v1.0.39.
