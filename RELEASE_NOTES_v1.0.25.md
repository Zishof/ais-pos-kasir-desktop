> **Tag:** `v1.0.25`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.25`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.25.exe` (ada di `desktop-pos-electron/release/`)

---

# AIS POS Kasir Desktop — v1.0.25

## 1. Layar Kasir: tombol "Fokus Keranjang"

Dua tombol baru di sebelah kotak pencarian layar Kasir:
- **Fokus Keranjang** -- sembunyikan kotak-kotak produk, keranjang jadi lebar penuh (cocok saat kasir sedang sibuk memindai barcode beruntun dan tidak butuh lihat katalog produk).
- **Tampilan Normal** -- kembali ke tampilan produk + keranjang berdampingan seperti biasa.

Pilihan tampilan diingat otomatis (tersimpan di perangkat ini) sampai diganti lagi.

## 2. Cetak struk langsung ke printer default (tanpa dialog pilih printer)

Sebelumnya klik "Cetak Struk" selalu memunculkan dialog Windows "Pilih Printer". Sekarang struk **langsung tercetak ke printer default** Windows tanpa dialog apa pun -- lebih cepat untuk kasir yang mencetak struk berkali-kali sehari. Kalau printer default belum diatur di Windows atau gagal mencetak, muncul pesan kesalahan yang jelas.

## 3. Ucapan "Terima Kasih" bisa disunting per-toko

Menu **Konfigurasi > Profil Toko** sekarang punya kolom baru "Ucapan Terima Kasih (Struk & Layar Customer)". Teks ini dipakai di **dua tempat**:
- Baris penutup struk pembayaran.
- Layar Pelanggan (layar kedua), ditampilkan **lebih besar & mencolok** dibanding rincian transaksi lainnya, karena ini kalimat terakhir yang dibaca pelanggan.

Tiap toko boleh punya kata-katanya sendiri (hanya supervisor/admin yang boleh mengubah, sama seperti field profil toko lain). Kalau belum pernah disunting, otomatis memakai teks formal default:

> "Terima Kasih Telah Berbelanja, Semoga Belanja Berkah Berpahala"

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.25.exe`.

## Catatan

Fitur ucapan terima kasih butuh migrasi database kecil untuk tabel audit (`MIGRASI_TOKO_PESAN_TERIMA_KASIH.sql` di root proyek server) -- kolom tabel utamanya sendiri otomatis dibuat Hibernate saat server restart, migrasi ini hanya untuk tabel riwayat perubahan (audit). Aman dijalankan kapan saja, tidak menghapus data apa pun.

Ketiga fitur ini baru diverifikasi lewat pemeriksaan kode + kompilasi server + pemeriksaan sintaks JS -- belum diuji langsung klik-per-klik di aplikasi berjalan (termasuk cetak fisik ke printer thermal). Mohon diuji sebelum benar-benar diandalkan di lapangan, terutama alur cetak struk (perlu printer default sudah diatur di Windows).

**Belum tersedia di Android** -- ketiga fitur ini khusus Desktop untuk saat ini (sesuai permintaan "sebelum android").
