# AIS POS Kasir Desktop v1.0.35

## Perubahan: "Cetak Struk" kini menampilkan pratinjau dulu

- Tombol **"Cetak Struk"** di modal sukses checkout sekarang membuka jendela pratinjau struk terlebih
  dahulu, lalu memunculkan dialog cetak native Windows (yang sudah punya panel pratinjau + tombol
  "Print" sendiri) -- struk **tidak lagi tercetak otomatis secara diam-diam** begitu tombol ditekan.
  Kasir bisa memeriksa isi struk dulu sebelum benar-benar mencetak, dan membatalkan dari dialog cetak
  bila ternyata tidak jadi perlu.
- Tombol "Cetak Struk" per-baris di layar Ringkasan/Riwayat Transaksi TIDAK berubah -- tetap mencetak
  langsung ke printer default seperti sebelumnya (dipakai untuk cetak-ulang cepat dari riwayat).

> Perubahan ini murni sisi aplikasi (tidak menyentuh data/server) -- tidak perlu deploy server apa pun.
