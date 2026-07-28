> **Tag:** `v1.0.10`
> **Judul Release:** `AIS POS Kasir Desktop v1.0.10`
> **File installer diunggah:** `AIS-POS-Kasir-Setup-1.0.10.exe` (ada di `desktop-pos-electron/release/`)
>
> *(3 baris di atas untuk diisi ke form GitHub Release — Tag version / Release title / lampiran file. Konten di bawah garis ini untuk kolom Deskripsi.)*

---

# AIS POS Kasir Desktop — v1.0.10

Rilis ini menghadirkan **Picker Member Offline** — permintaan agar pencarian/pemilihan member saat checkout tidak lagi buntu total saat perangkat sedang offline, sekaligus tampilan yang lebih baik (foto member, bukan cuma teks).

---

## Fitur Baru

### Modal "Pilih Member" dengan Foto
Kotak "Cari member" di layar Kasir sekarang membuka **modal pencarian** yang lebih lega — setiap hasil ditampilkan sebagai kartu dengan foto bulat kecil (bila tersedia), nama, kode identitas, dan lencana "PIN wajib" bila berlaku — menggantikan dropdown teks sempit sebelumnya. Alur pemilihan member untuk checkout (termasuk gerbang saldo/PIN) **tidak berubah sama sekali** — cuma titik pemicunya yang lebih nyaman dipakai.

### Cache Offline — Data & Foto Member Tersimpan di Perangkat
Sebelumnya, mencari member **hanya mungkin saat online** — kalau server tak terjangkau, kasir benar-benar tidak bisa memilih member sama sekali (checkout dengan metode saldo jadi mustahil). Sekarang:
- Tombol **"Sinkronkan"** di dalam modal picker mengunduh **seluruh data member koperasi aktif** (nama, kode, kontak, status wajib-PIN) ke database lokal (SQLite) di perangkat, lengkap dengan **progress bar** dua tahap (data lalu foto).
- **Foto member ikut diunduh & disimpan sebagai berkas lokal** — sinkron berikutnya HANYA mengunduh ulang foto yang benar-benar berubah (dibandingkan nama & ukuran berkas dari server terhadap yang sudah tersimpan), bukan menarik ulang semuanya setiap kali.
- Saat **offline**, mencari member otomatis jatuh ke data cache ini — hasilnya ditandai jelas dengan peringatan "⚠️ Offline -- hasil dari data tersimpan" karena **saldo tidak bisa diperiksa** dalam kondisi ini (data finansial memang sengaja tidak pernah disajikan basi).
- Sinkron foto **sengaja hanya manual** (tombol, bukan otomatis di background) — foto ribuan member bisa berat, kasir yang menentukan kapan.

---

## Perubahan Teknis

- **Server**: aksi baru `anggota_sync_list` (`KantinHelper.java`/`PosApi.java`) — pengambilan bertahap (cursor) seluruh anggota koperasi aktif beserta info foto, memakai ulang mesin resolusi foto yang sudah ada (`ProfileImageUtil`, dipakai luas di JSP/ZK) lewat method baru `cariFileFotoLain` (extract-method, tidak mengubah perilaku method lama).
- **Desktop**: tabel SQLite baru `anggota_cache` (`local-db.js`), mesin sinkron `sinkronkanAnggotaLengkap` (`main.js`) dengan progress event `pos:anggota-sync-status` (pola sama dengan fitur "Update Sistem"), modal picker baru di `pos.html`/`pos-renderer.js`.
- Foto diunduh lewat mekanisme publik yang sama dipakai foto produk (`unduhBiner`, endpoint anonim `/al`) — tidak ada endpoint biner baru di server.
- Seluruh berkas JS lolos `node --check`; server lolos `mvn -o compile`.

## Instalasi

Unduh dan jalankan `AIS-POS-Kasir-Setup-1.0.10.exe`.
