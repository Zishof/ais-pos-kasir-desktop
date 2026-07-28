> **Tag:** `v1.0.28`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.28`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.28.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.28

## Menu baru: Kulakan (Harga Beli)

Menu baru di sidebar (setelah "Stok Opname"), untuk mencatat barang yang **dibeli dari pemasok**: ketik/scan barcode atau kode produk, isi jumlah masuk + harga beli satuan + (opsional) nomor faktur/nama pemasok/keterangan, lalu Simpan. Stok dan harga beli produk otomatis diperbarui begitu tersimpan — rumus dan mekanismenya **sama persis** dengan layar admin "Pengadaan / Kulakan (Barang Masuk)" yang sudah ada di sistem, hanya dibuatkan versi Desktop-nya.

Riwayat seluruh catatan Kulakan (bukan cuma sesi hari ini) bisa dicari dan dilihat langsung di layar yang sama.

Sesuai aturan hak akses yang sudah berlaku untuk Produk/Anggota/Aturan Diskon/Stok Opname: **siapa saja boleh melihat riwayat**, tapi **hanya supervisor toko atau admin/manager yang boleh mencatat** barang masuk baru. Gerbang ini ditegakkan di server.

## Catatan

Diverifikasi lewat kompilasi server + pemeriksaan sintaks JS — belum diuji klik-per-klik di aplikasi berjalan. Mohon diuji sebelum diandalkan di lapangan, terutama pastikan stok & harga beli produk yang dicatat lewat menu ini benar-benar bertambah/berubah di layar Kasir.

**Belum tersedia di Android** — menu ini untuk saat ini khusus Desktop.
