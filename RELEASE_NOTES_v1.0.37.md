# AIS POS Kasir Desktop v1.0.37

## Fitur baru: progress bar saat menyimpan katalog Excel

- Tombol **"Simpan"** di layar Tinjau Impor Katalog sekarang menampilkan **progress bar sungguhan**
  (bukan cuma teks "Menyimpan..." statis) -- penting untuk katalog besar (ribuan baris) yang
  sebelumnya bisa memakan waktu lama tanpa indikasi kemajuan apa pun.
- Di baliknya, pengiriman ke server kini **dipecah menjadi beberapa permintaan bertahap** (200 baris
  per permintaan) alih-alih satu permintaan raksasa untuk seluruh katalog sekaligus -- selain
  memberikan progres yang terlihat, ini juga mengurangi risiko permintaan gagal karena timeout pada
  katalog yang sangat besar. Laporan hasil akhir (jumlah produk baru/diperbarui/dilewati, dst) tetap
  sama seperti sebelumnya -- hasil tiap tahap digabung otomatis.
- Sinkronisasi latar (batch yang tadinya offline, terkirim otomatis begitu koneksi pulih) turut
  memakai mekanisme bertahap yang sama untuk keandalan yang sama, tanpa perlu progress bar (berjalan
  di latar tanpa layar yang menonton).
- Kalau proses terhenti di tengah jalan (mis. sesi login kedaluwarsa), pesan error sekarang menyebutkan
  dengan jelas berapa baris yang **sudah sempat tersimpan dengan aman** sebelum berhenti, supaya jelas
  apa yang perlu diulang.

> Perubahan ini murni sisi aplikasi -- tidak perlu deploy server apa pun.
