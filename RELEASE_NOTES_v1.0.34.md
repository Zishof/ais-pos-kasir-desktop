# AIS POS Kasir Desktop v1.0.34

## Fitur baru: Buka Laci Kasir

- **Tombol "Buka Laci"** kini tersedia di topbar layar Kasir dan di layar sukses setelah pembayaran.
- Mengirim perintah standar ESC/POS `ESC p m t1 t2` (`0x1B 0x70 0x00 0x19 0xFA`) ke printer default
  Windows lewat teknik `winspool.drv` (P/Invoke via PowerShell, tanpa dependency native tambahan) --
  laci kasir yang tersambung via kabel RJ11 ke port "Cash Drawer"/"DK" pada printer struk thermal akan
  terbuka.
- **Otomatis terbuka** begitu transaksi dengan metode bayar **Tunai** berhasil -- metode non-tunai
  (Saldo/Transfer/QRIS) TIDAK memicu otomatis (tidak melibatkan uang fisik), tapi kasir tetap bisa
  membukanya manual lewat tombol kapan saja.
- Kalau laci tidak terbuka dengan perintah default, sebagian model memakai pin 5 (bukan pin 2) --
  variasi ini sudah didukung di kode (`payload.pinAlternatif`), tinggal disambungkan ke opsi
  konfigurasi bila dibutuhkan di lapangan.

> **Catatan uji coba:** perintah WinSpool sudah diuji SECARA MEKANIS (compile & penulisan RAW ke
> printer default berhasil) tapi BELUM diverifikasi memicu laci fisik sungguhan di lingkungan
> pengembangan (tidak ada printer+laci nyata tersedia). Mohon uji di lapangan dengan printer+laci
> fisik sebelum mengandalkan fitur ini sepenuhnya; laporkan bila laci tidak terbuka dengan perintah
> default (coba varian pin 5).
