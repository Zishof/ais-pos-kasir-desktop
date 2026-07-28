# AIS POS Kasir Desktop v1.0.36

## Perbaikan: pratinjau "Cetak Struk" didesain ulang (toolbar sendiri)

- v1.0.35 sempat memakai dialog cetak native Windows utk pratinjau, tapi ternyata dialog itu TIDAK
  merender pratinjau visual sungguhan (cuma teks "This app doesn't support print preview") dan
  jendelanya tumpang tindih janggal dengan layar Kasir di belakangnya.
- **Sekarang:** jendela pratinjau struk punya **toolbar sendiri** di bagian bawah dengan tombol
  "Cetak" dan "Tutup" -- isi struk yang ditampilkan PERSIS sama dengan yang akan tercetak. Menekan
  "Cetak" langsung mencetak diam-diam ke printer default (tanpa dialog tambahan); "Tutup" atau
  menutup jendela membatalkan tanpa mencetak apa pun.

## Perbaikan: Riwayat Stok Opname kini dari server (bukan cuma sesi layar ini)

- Layar "Stok Opname" sebelumnya menampilkan riwayat catatan HANYA dari memori sesi layar itu sendiri
  -- begitu layar dimuat ulang, daftar riwayat kosong lagi walau kartu ringkasan di atasnya (yang
  sudah membaca dari server) tetap menunjukkan angka yang benar, membuat tampilan terasa tidak
  sinkron/membingungkan.
- **Sekarang:** daftar riwayat dibaca LANGSUNG dari server (aksi baru `so_riwayat`) -- tetap terisi
  walau layar dimuat ulang, dibuka lagi nanti, atau dibuka dari perangkat lain.

> **Catatan:** perbaikan Riwayat Stok Opname butuh server (backend) sudah di-deploy dengan perubahan
> terbaru (`KantinHelper.soRiwayat`, aksi PosApi `so_riwayat`) supaya berfungsi.
