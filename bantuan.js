/**
 * Modul Bantuan (Help) -- panduan pakai per-layar, dipanggil dari tombol "Bantuan"
 * di topbar tiap layar utama (lihat data-topik pada #btnBantuan tiap file .html).
 *
 * Pola FILE INI SENGAJA meniru persis pesan-detail.js (self-injecting CSS+modal,
 * dictionary konten, window.Bantuan sbg satu-satunya API publik) -- konsisten dgn
 * "infra bersama" yang sudah ada di aplikasi ini, bukan pola baru. Konten bantuan
 * (judul/ringkasan/langkah/tips) SENGAJA Indonesia-saja tanpa lewat i18n.js,
 * mengikuti preseden pesan-detail.js (KAMUS error) yg juga tak pernah lewat i18n --
 * lihat catatan arsitektur di README/CLAUDE.md kalau ada soal kelas konten ini.
 *
 * Diagram alur kerja dibangun OTOMATIS dari array singkat `alur` tiap topik lewat
 * svgAlur() -- bukan gambar/SVG tulisan tangan per topik (mahal dirawat, gampang
 * basi begitu alur kerja berubah) -- cukup ubah array teksnya, diagram ikut berubah.
 */
(function () {
	'use strict';

	// ============================================================================
	// KONTEN BANTUAN per topik (kunci = data-topik pada tombol #btnBantuan)
	// ============================================================================
	const TOPIK = {
		pos: {
			judul: 'Kasir',
			ikon: '\u{1F6D2}',
			ringkasan: 'Layar utama untuk melayani transaksi penjualan sehari-hari -- cari/scan produk, masukkan ke keranjang, lalu bayar.',
			alur: ['Buka Kas (modal awal)', 'Cari / scan produk', 'Atur jumlah di keranjang', 'Pilih member (opsional)', 'Pilih metode bayar', 'Tekan Bayar', 'Struk tercetak otomatis'],
			langkah: [
				{ judul: 'Buka Kas dulu sebelum jualan', teks: 'Tombol "Sesi Kas" di topbar WAJIB ditekan dan diisi modal awal (uang di laci) sebelum bisa menjual apa pun. Ini supaya perhitungan tutup kas nanti akurat.' },
				{ judul: 'Cari atau scan produk', teks: 'Ketik nama/kode di kotak pencarian, atau scan barcode langsung -- barang otomatis masuk ke keranjang begitu kode cocok persis. Bisa juga klik langsung kartu produknya.' },
				{ judul: 'Atur jumlah & lihat total', teks: 'Ubah jumlah tiap barang di keranjang dengan tombol +/-. Subtotal, diskon otomatis, dan total ter-update langsung.' },
				{ judul: 'Pilih member (opsional)', teks: 'Kalau pembeli member/punya saldo, cari namanya lewat tombol member di keranjang -- saldo & diskon khusus member otomatis dihitung. Member dgn PIN wajib akan diminta PIN sebelum transaksi selesai.' },
				{ judul: 'Pilih metode pembayaran', teks: 'Pilih tunai, saldo, atau metode lain yang tersedia. Untuk tunai, isi "Uang Diterima" agar kembalian terhitung otomatis.' },
				{ judul: 'Tekan Bayar', teks: 'Transaksi tersimpan meski internet sedang terputus (data tersimpan lokal dulu, otomatis terkirim ke server begitu koneksi kembali) -- struk tetap bisa dicetak.' },
			],
			tips: [
				'Tombol "Tahan" menyimpan keranjang saat ini tanpa membayar -- berguna kalau pembeli belum siap bayar dan kasir ingin layani pembeli lain dulu. Ambil lagi lewat menu Pesanan.',
				'"Fokus Keranjang" menyembunyikan daftar produk supaya layar keranjang lebih besar -- cocok dipakai di layar sentuh kecil.',
				'Kalau laci kasir tidak terbuka otomatis setelah bayar tunai, coba tombol kunci kecil di sebelah "Buka Laci" (beberapa printer pakai kabel pin berbeda).',
				'Badge merah di tombol "Sinkronkan" menandakan ada transaksi yang belum terkirim ke server -- klik untuk mengirim ulang.',
			],
		},
		ringkasan: {
			judul: 'Ringkasan',
			ikon: '\u{1F4CA}',
			ringkasan: 'Dasbor untuk melihat performa toko: omzet, transaksi, produk terlaris, stok kritis, sampai kepatuhan operasional kasir -- semua dalam beberapa tab.',
			alur: ['Buka menu Ringkasan', 'Pilih tab yg diinginkan', 'Atur rentang tanggal/filter', 'Baca grafik & tabel', 'Ekspor CSV bila perlu'],
			langkah: [
				{ judul: 'Pilih tab sesuai kebutuhan', teks: 'Ringkasan Umum (omzet harian/mingguan), Keuangan & Kinerja (laba, HPP), Produk & Inventaris (stok kritis, terlaris), Perilaku Pelanggan, Peringkat Mitra/Toko, Resep & Margin, Ramalan Penjualan, Monitor Promo, dan Kepatuhan Operasional.' },
				{ judul: 'Atur rentang tanggal', teks: 'Setiap tab punya filter tanggal sendiri -- data akan dihitung ulang begitu rentang diubah.' },
				{ judul: 'Tandai pesanan "Sudah Dilayani"', teks: 'Di tabel transaksi tab Ringkasan Umum, tombol "Layani" (atau "Layani Semua") menandai pesanan sudah diproses -- berguna utk memantau antrian dapur/gudang.' },
				{ judul: 'Ekspor bila perlu laporan cetak', teks: 'Tombol ekspor CSV tersedia di sebagian besar tabel untuk dibuka di Excel/Spreadsheet.' },
			],
			tips: [
				'Tab "Kepatuhan Operasional" khusus membantu supervisor menemukan hal yang butuh perhatian: sesi kas yg lupa ditutup, opname stok yg terlambat, atau selisih kas yg mencurigakan.',
				'Grafik di sini digambar langsung dari data toko Anda (bukan gambar statis) -- klik tombol Sinkronkan di Kasir dulu kalau angkanya terasa belum ter-update.',
			],
		},
		pesanan: {
			judul: 'Pesanan',
			ikon: '\u{1F4CB}',
			ringkasan: 'Daftar pesanan online dari pembeli DAN keranjang yang sengaja "ditahan" kasir -- dari sini bisa diverifikasi, dilanjutkan, atau dibatalkan.',
			alur: ['Buka menu Pesanan', 'Filter tanggal/status', 'Pilih 1 pesanan', 'Verifikasi / Muat ke Keranjang / Batalkan'],
			langkah: [
				{ judul: 'Bedakan jenis pesanan', teks: 'Badge "Online" = pesanan dari pembeli lewat aplikasi; badge "Tertahan" = keranjang yang tadi ditekan tombol Tahan di layar Kasir oleh kasir sendiri.' },
				{ judul: 'Verifikasi pesanan online', teks: 'Tombol "Verifikasi & Selesaikan" membuka pilihan metode bayar lalu menyelesaikan pesanan tersebut seperti transaksi biasa.' },
				{ judul: 'Lanjutkan keranjang tertahan', teks: 'Tombol "Muat ke Keranjang" pada baris berstatus Tertahan akan membuka kembali keranjang itu di layar Kasir, lengkap dengan member & metode bayar yang sudah dipilih sebelumnya.' },
				{ judul: 'Batalkan bila perlu', teks: 'Hanya supervisor/admin yang bisa membatalkan pesanan -- tindakan ini permanen dan butuh konfirmasi.' },
			],
			tips: [
				'"Bayar Semua" (khusus admin) menyelesaikan SEMUA pesanan online yang sedang tampil di layar sekaligus -- cocok dipakai saat jam sibuk sudah lewat dan ingin membersihkan antrian.',
				'Tombol "Hitung Ulang" menghitung ulang diskon/cashback pesanan memakai aturan diskon TERBARU -- berguna kalau aturan diskon baru saja diubah setelah pesanan dibuat.',
			],
		},
		anggota: {
			judul: 'Customer / Anggota',
			ikon: '\u{1F464}',
			ringkasan: 'Kelola data member/pelanggan (nama, kode, saldo, wajib-PIN) yang dipakai saat kasir memilih member di layar Kasir.',
			alur: ['Buka menu Customer/Anggota', 'Cari member yang sudah ada, atau', 'Tekan Tambah', 'Isi data & simpan'],
			langkah: [
				{ judul: 'Cari data member', teks: 'Ketik nama/kode/HP di kotak pencarian -- daftar akan tersaring otomatis.' },
				{ judul: 'Tambah member baru', teks: 'Tombol "Tambah" (khusus supervisor/admin) membuka form isian: nama, kode, kode identitas, HP, jenis keanggotaan.' },
				{ judul: 'Sinkronkan data & foto', teks: 'Tombol "Sinkronkan" mengunduh seluruh data member + foto ke perangkat ini, supaya pencarian member di Kasir tetap jalan walau sedang offline.' },
			],
			tips: [
				'Kasir non-supervisor hanya bisa MELIHAT data member, tidak bisa menambah/mengubah -- ini pengaturan sengaja utk mencegah kesalahan input massal.',
				'Sinkronisasi foto member cukup dilakukan sesekali (bukan tiap hari) karena ukurannya cukup besar -- data teks tetap tersinkron otomatis tiap beberapa menit.',
			],
		},
		produk: {
			judul: 'Produk',
			ikon: '\u{1F4E6}',
			ringkasan: 'Kelola katalog barang: tambah/ubah produk, pantau stok, cetak label harga, dan bersihkan data ganda.',
			alur: ['Buka menu Produk', 'Cari/lihat daftar', 'Tambah atau klik produk utk ubah', 'Isi kode/nama/harga/stok', 'Simpan'],
			langkah: [
				{ judul: 'Tambah produk baru', teks: 'Kode dan nama WAJIB diisi, harus unik. Harga jual, harga beli, dan stok awal bisa diisi sekaligus.' },
				{ judul: 'Pakai resep (Bahan Baku) bila produk racikan', teks: 'Untuk produk seperti minuman/makanan olahan, isi bagian "Bahan Baku" dengan produk-produk lain sbg bahan -- harga modal (HPP) akan dihitung otomatis dari situ, tidak perlu diisi manual.' },
				{ judul: 'Impor/Ekspor lewat Excel', teks: 'Untuk menambah banyak produk sekaligus, unduh format Excel dari tombol Ekspor, isi barisnya, lalu unggah kembali lewat Impor -- ada layar pratinjau sebelum data benar-benar disimpan.' },
				{ judul: 'Bersihkan produk ganda', teks: 'Kalau ada produk yang ternyata terduplikasi (kode/barcode/nama sama), pakai tombol pembersih duplikat -- sistem akan menampilkan pratinjau grup duplikat sebelum digabungkan/dihapus.' },
			],
			tips: [
				'Kartu statistik di atas daftar produk menunjukkan berapa produk aktif, stok habis, dan stok menipis -- cek berkala supaya tidak kehabisan barang laris.',
				'Tombol "Hitung Ulang Stok" berguna kalau angka stok terasa tidak sesuai kenyataan -- sistem akan menghitung ulang dari riwayat pembelian, opname, dan penjualan.',
				'Cetak Label Harga tersedia dalam beberapa ukuran kertas (A4/A5, stiker, label teks sederhana) -- pilih produk yang mau dicetak lalu pilih template.',
			],
		},
		stokopname: {
			judul: 'Stok Opname',
			ikon: '\u{1F4CB}',
			ringkasan: 'Cocokkan stok sistem dengan stok fisik di rak/gudang -- manual satu-satu atau cepat lewat scan kamera berturut-turut.',
			alur: ['Buka menu Stok Opname', 'Pilih mode: manual atau scan kamera', 'Cek stok sistem vs fisik', 'Catat selisih', 'Simpan'],
			langkah: [
				{ judul: 'Kartu Mutasi Stok (tab dasbor)', teks: 'Lihat ringkasan barang masuk/keluar dan barang berstatus kritis sebelum mulai opname.' },
				{ judul: 'Stok Opname manual', teks: 'Scan/ketik satu kode produk, sistem menampilkan stok tercatat, lalu masukkan jumlah fisik yang benar-benar dihitung -- selisihnya otomatis tersimpan.' },
				{ judul: 'SO by Scan (mode cepat)', teks: 'Cocok utk opname banyak barang sekaligus pakai HP/scanner genggam -- setiap scan berulang pada kode yang sama otomatis menambah jumlah 1, tidak perlu ketik ulang. Setelah semua discan, tekan "Simpan Semua".' },
			],
			tips: [
				'Lakukan opname secara berkala (misal tiap akhir bulan) -- tab "Kepatuhan Operasional" di menu Ringkasan akan menandai toko yang opname-nya sudah lama tidak dilakukan.',
				'Mode scan kamera butuh izin kamera pada perangkat -- pastikan pencahayaan cukup agar barcode terbaca cepat.',
			],
		},
		kulakan: {
			judul: 'Kulakan',
			ikon: '\u{1F69A}',
			ringkasan: 'Catat pembelian/pengadaan barang dari pemasok -- stok dan harga modal produk otomatis diperbarui.',
			alur: ['Buka menu Kulakan', 'Scan/cari kode produk', 'Isi jumlah, harga beli, no. faktur', 'Simpan'],
			langkah: [
				{ judul: 'Cari produk yang dibeli', teks: 'Scan barcode atau ketik kode -- stok sistem saat ini akan tampil sbg pembanding.' },
				{ judul: 'Isi detail pembelian', teks: 'Jumlah barang, harga beli per satuan, nomor faktur pemasok, nama pemasok, dan catatan tambahan bila perlu.' },
				{ judul: 'Simpan', teks: 'Stok produk otomatis bertambah dan harga modal (HPP) ter-update sesuai transaksi ini.' },
			],
			tips: [
				'Riwayat pembelian di bawah form bisa dicari/difilter -- berguna utk mengecek ulang faktur pemasok tertentu.',
			],
		},
		diskon: {
			judul: 'Aturan Diskon',
			ikon: '\u{1F3F7}',
			ringkasan: 'Atur aturan diskon/promo otomatis yang berlaku saat kasir checkout -- berdasarkan produk, toko, dan/atau jenis member.',
			alur: ['Buka menu Aturan Diskon', 'Tekan Tambah (atau pilih aturan lama)', 'Tentukan cakupan (produk/toko/member)', 'Tentukan besar diskon', 'Simpan'],
			langkah: [
				{ judul: 'Tentukan cakupan aturan', teks: 'Bisa berlaku utk SEMUA produk atau kode tertentu saja; SEMUA toko atau satu toko saja (khusus admin); SEMUA member atau jenis/tipe member tertentu.' },
				{ judul: 'Tentukan bentuk diskon', teks: 'Persentase (dgn batas maksimal potongan opsional) atau nominal tetap. Bisa dipilih jadi "potongan langsung" (mengurangi total bayar) atau "masuk sebagai cashback/saldo" (dikreditkan ke saldo member).' },
				{ judul: 'Atur tanggal berlaku', teks: 'Kosongkan tanggal mulai/selesai kalau ingin berlaku terus-menerus, atau isi utk promo periode tertentu.' },
			],
			tips: [
				'Aturan yang dibuat di sini LANGSUNG berlaku di Kasir Desktop maupun Android maupun web -- tidak perlu pengaturan terpisah di tempat lain.',
				'Aturan dengan "berlaku per hari per toko" berguna utk membatasi total potongan yang boleh diberikan dalam satu hari (misal maksimal Rp100rb per toko per hari).',
			],
		},
		'laporan-transaksi': {
			judul: 'Laporan Transaksi',
			ikon: '\u{1F4C4}',
			ringkasan: 'Rekap transaksi per baris (Order), per sesi kas (Sesi), dan per metode bayar (Payment) -- tiga tab terpisah.',
			alur: ['Buka menu Laporan Transaksi', 'Pilih tab (Order/Sesi/Payment)', 'Atur rentang tanggal', 'Klik baris utk detail'],
			langkah: [
				{ judul: 'Tab Report Order', teks: 'Daftar tiap transaksi -- klik "Detail Penjualan" utk melihat rincian pajak/subtotal per barang dalam satu transaksi.' },
				{ judul: 'Tab Report Sesi', teks: 'Rekap tiap sesi buka/tutup kas -- sesi yang masih berjalan ditandai badge "Proyeksi" (angkanya masih bisa berubah sampai kas ditutup).' },
				{ judul: 'Tab Report Payment', teks: 'Rekap total per metode pembayaran (tunai, saldo, QRIS, dst) -- berguna utk rekonsiliasi harian.' },
			],
			tips: [
				'Badge "Mesin Ini" menandai baris yang berasal dari perangkat yang sedang Anda pakai -- berguna kalau satu toko punya lebih dari satu mesin kasir.',
			],
		},
		'retur-penjualan': {
			judul: 'Retur Penjualan',
			ikon: '\u{21A9}\u{FE0F}',
			ringkasan: 'Catat barang yang dikembalikan pelanggan (rusak/salah/tidak sesuai) dari transaksi yang sudah dibayar -- stok otomatis kembali kecuali barangnya rusak.',
			alur: ['Klik "Retur Baru (Cari Transaksi)"', 'Cari nota/nama pembeli asal', 'Pilih transaksi', 'Centang barang + isi qty/alasan/kondisi', 'Simpan Retur'],
			langkah: [
				{ judul: 'Cari transaksi asal', teks: 'Ketik nomor nota atau nama pembeli, lalu pilih transaksi yang benar dari daftar hasil.' },
				{ judul: 'Pilih barang & kondisi', teks: 'Centang barang yang diretur, atur jumlahnya (maksimal sejumlah yang dibeli), pilih alasan, dan pilih kondisi barang.' },
				{ judul: 'Kondisi barang menentukan stok', teks: 'Kondisi "Baik (Layak Jual Lagi)" otomatis menambah stok jual; kondisi "Rusak (Tidak Layak Jual)" TIDAK menambah stok (barang dianggap write-off, bukan sellable lagi).' },
			],
			tips: [
				'Retur bisa diproses kasir mana pun yang sedang bertugas -- tidak perlu supervisor, beda dengan Kulakan.',
			],
		},
		'riwayat-penjualan': {
			judul: 'Riwayat Penjualan',
			ikon: '\u{1F553}',
			ringkasan: 'Telusuri transaksi penjualan yang sudah dibayar -- cari per tanggal/nama pembeli/nomor nota, lihat rincian, atau cetak ulang struknya.',
			alur: ['Buka menu Riwayat Penjualan', 'Atur rentang tanggal / kata kunci pencarian', 'Klik "Detail Penjualan" pada baris yang dicari', 'Klik "Cetak Ulang Struk" bila perlu'],
			langkah: [
				{ judul: 'Cari transaksi', teks: 'Isi rentang tanggal dan/atau nama pembeli/nomor nota, lalu klik Terapkan.' },
				{ judul: 'Lihat rincian', teks: 'Klik "Detail Penjualan" pada baris yang dituju untuk melihat daftar barang, diskon, dan pajak transaksi tersebut.' },
				{ judul: 'Cetak ulang struk', teks: 'Di dalam jendela Detail Penjualan, klik "Cetak Ulang Struk" -- berguna kalau struk asli hilang/rusak atau pelanggan minta salinan.' },
			],
			tips: [
				'Beda dengan menu Laporan Transaksi (fokus analitik/rekap), menu ini fokus mencari SATU transaksi tertentu untuk dilihat/dicetak ulang.',
			],
		},
		laporan: {
			judul: 'Laporan-Laporan',
			ikon: '\u{1F5C2}',
			ringkasan: 'Katalog lengkap ratusan jenis laporan siap pakai (keuangan, stok, member, dst) -- bisa dilihat langsung atau diekspor PDF/CSV.',
			alur: ['Buka menu Laporan-Laporan', 'Cari laporan lewat kotak pencarian', 'Atur filter tanggal/produk', 'Lihat hasil atau ekspor'],
			langkah: [
				{ judul: 'Cari laporan yang dibutuhkan', teks: 'Kotak pencarian menyaring dari judul, keterangan, maupun kategori laporan -- lebih cepat drpd menelusuri satu-satu.' },
				{ judul: 'Atur filter', teks: 'Kebanyakan laporan butuh rentang tanggal; sebagian juga bisa difilter per produk/pelanggan.' },
				{ judul: 'Ekspor hasil', teks: 'Tombol PDF/CSV tersedia di hasil laporan utk disimpan/dicetak.' },
			],
			tips: [
				'Ada ratusan laporan di katalog ini (dikelompokkan per kategori) -- gunakan kotak pencarian daripada menelusuri manual.',
			],
		},
		'riwayat-sinkronisasi': {
			judul: 'Riwayat Sinkronisasi',
			ikon: '\u{1F504}',
			ringkasan: 'Pantau data apa saja yang sudah masuk dari server (Sinkron Masuk) dan transaksi mana yang sudah/belum terkirim ke server (Sinkron Keluar).',
			alur: ['Buka menu Riwayat Sinkronisasi', 'Lihat panel Sinkron Masuk', 'Lihat panel Sinkron Keluar', 'Filter status bila perlu'],
			langkah: [
				{ judul: 'Panel Sinkron Masuk', teks: 'Menunjukkan kapan terakhir kali katalog produk, konfigurasi, ringkasan, dan pesanan berhasil diperbarui dari server.' },
				{ judul: 'Panel Sinkron Keluar', teks: 'Daftar transaksi yang dibuat dari perangkat ini -- status "Tersinkron" berarti sudah sampai di server, "Menunggu" berarti masih tersimpan lokal dan akan dikirim ulang otomatis.' },
			],
			tips: [
				'Kalau ada transaksi berstatus "Menunggu" cukup lama, cek koneksi internet lalu tekan "Sinkronkan" di layar Kasir.',
			],
		},
		'log-error': {
			judul: 'Log Error',
			ikon: '\u{1F41E}',
			ringkasan: 'Catatan teknis semua kesalahan/error yang pernah terjadi di aplikasi ini -- berguna utk melapor ke tim dukungan.',
			alur: ['Buka menu Log Error', 'Filter tingkat/tanggal/kata kunci', 'Buka detail baris', 'Salin atau laporkan'],
			langkah: [
				{ judul: 'Filter log', teks: 'Saring berdasarkan tingkat (error/peringatan), rentang tanggal, atau kata kunci tertentu.' },
				{ judul: 'Lihat detail teknis', teks: 'Klik baris untuk melihat rincian teknis lengkap -- ini yang perlu disalin/dilampirkan saat melapor ke tim dukungan.' },
				{ judul: 'Salin atau bersihkan', teks: '"Salin Semua" menyalin seluruh log yang sedang tersaring (siap ditempel ke chat/tiket dukungan); "Bersihkan Semua" menghapus log lama.' },
			],
			tips: [
				'Layar ini murni catatan teknis -- kalau menemukan pesan error saat bekerja, sistem biasanya SUDAH menampilkan penjelasan yang lebih mudah dipahami lewat jendela pop-up tersendiri saat itu juga.',
			],
		},
		konfigurasi: {
			judul: 'Konfigurasi',
			ikon: '\u{2699}\u{FE0F}',
			ringkasan: 'Pengaturan aplikasi: identitas tampilan (logo/judul), identitas mesin kasir, profil toko, dan kelola akun kasir.',
			alur: ['Buka menu Konfigurasi', 'Pilih bagian (Tampilan/Mesin/Toko/Akun)', 'Ubah data', 'Simpan'],
			langkah: [
				{ judul: 'Tampilan aplikasi', teks: 'Ganti judul aplikasi dan logo sidebar -- pengaturan ini hanya tersimpan di perangkat ini (tidak dikirim ke server).' },
				{ judul: 'Identitas mesin', teks: 'Beri nama mesin ini (misal "Kasir Depan", "Kasir 2") -- nama ini muncul di laporan supaya transaksi tiap mesin bisa dibedakan.' },
				{ judul: 'Profil toko', teks: 'Alamat, telepon, jam operasional, dan pesan terima kasih yang tercetak di struk -- perlu izin (supervisor/admin) untuk mengubah.' },
				{ judul: 'Kelola akun kasir', teks: 'Aktifkan/nonaktifkan akun kasir, reset kata sandi, atur status supervisor, atau tambah akun kasir baru.' },
			],
			tips: [
				'Perubahan identitas mesin tidak memengaruhi transaksi yang SUDAH tercatat -- hanya berlaku utk transaksi baru sejak nama diubah.',
			],
		},
	};

	// ============================================================================
	// GENERATOR DIAGRAM ALUR (SVG vertikal: lingkaran bernomor + garis penghubung)
	// ============================================================================
	function svgAlur(langkahSingkat) {
		const tinggiPerBaris = 56;
		const radius = 15;
		const cx = 22;
		const lebar = 460;
		const tinggi = langkahSingkat.length * tinggiPerBaris + 16;
		let isi = '';
		langkahSingkat.forEach((teks, i) => {
			const cy = 24 + i * tinggiPerBaris;
			if (i < langkahSingkat.length - 1) {
				const cyBerikut = 24 + (i + 1) * tinggiPerBaris;
				isi += `<line x1="${cx}" y1="${cy + radius}" x2="${cx}" y2="${cyBerikut - radius}" stroke="var(--border,#cbd5e1)" stroke-width="2.5"/>`;
				isi += `<polygon points="${cx - 5},${cyBerikut - radius - 8} ${cx + 5},${cyBerikut - radius - 8} ${cx},${cyBerikut - radius}" fill="var(--border,#cbd5e1)"/>`;
			}
			isi += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="var(--primary,#2563eb)"/>`;
			isi += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${i + 1}</text>`;
			isi += `<text x="${cx + radius + 14}" y="${cy + 5}" font-size="13" fill="var(--ink,#1e293b)">${escapeXml(teks)}</text>`;
		});
		return `<svg viewBox="0 0 ${lebar} ${tinggi}" width="100%" height="${tinggi}" xmlns="http://www.w3.org/2000/svg">${isi}</svg>`;
	}

	function escapeXml(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// ============================================================================
	// MODAL (pola identik pesan-detail.js)
	// ============================================================================
	let sudahDisuntik = false;
	let elOverlay, elModal, elIkon, elJudul, elRingkasan, elDiagram, elLangkah, elTips, elBlokTips;

	function suntikSekaliJalan() {
		if (sudahDisuntik) return;
		sudahDisuntik = true;

		const style = document.createElement('style');
		style.textContent = `
			.bp-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.6); display: none; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
			.bp-overlay.tampil { display: flex; }
			.bp-modal { background: var(--surface, #fff); border-radius: 18px; width: 560px; max-width: 100%; max-height: 88vh; overflow-y: auto; box-shadow: var(--shadow-lg, 0 16px 40px rgba(15,23,42,.16)); }
			.bp-kepala { display: flex; align-items: flex-start; gap: 12px; padding: 20px 22px 14px; border-bottom: 1px solid var(--border, #e2e8f0); position: sticky; top: 0; background: var(--surface, #fff); }
			.bp-ikon { font-size: 26px; flex-shrink: 0; line-height: 1; margin-top: 2px; }
			.bp-kepala h3 { margin: 0 0 3px; font-size: 17px; font-weight: 800; color: var(--ink, #1e293b); }
			.bp-sub { font-size: 12.5px; color: var(--muted, #64748b); line-height: 1.5; }
			.bp-tutup { margin-left: auto; background: none; border: none; font-size: 15px; cursor: pointer; color: var(--muted, #64748b); padding: 4px; flex-shrink: 0; }
			.bp-body { padding: 18px 22px 6px; }
			.bp-blok { margin-bottom: 20px; }
			.bp-blok h4 { margin: 0 0 10px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--muted, #64748b); }
			.bp-diagram { background: var(--bg, #f8fafc); border-radius: 12px; padding: 12px 16px; }
			.bp-langkah-item { margin-bottom: 12px; }
			.bp-langkah-item b { display: block; font-size: 13.5px; color: var(--ink, #1e293b); margin-bottom: 2px; }
			.bp-langkah-item span { font-size: 13px; line-height: 1.6; color: var(--muted, #64748b); }
			.bp-tips { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.7; color: var(--ink, #1e293b); }
			.bp-tips li { margin-bottom: 6px; }
			.bp-footer { padding: 14px 22px 22px; }
			.bp-btn-ok { width: 100%; padding: 12px; border: none; border-radius: 11px; font-size: 13.5px; font-weight: 800; cursor: pointer; color: #fff; background: var(--primary, #2563eb); }
		`;
		document.head.appendChild(style);

		elOverlay = document.createElement('div');
		elOverlay.className = 'bp-overlay';
		elOverlay.innerHTML =
			'<div class="bp-modal">' +
			'  <div class="bp-kepala"><span class="bp-ikon"></span><div><h3></h3><div class="bp-sub"></div></div><button type="button" class="bp-tutup">&#10005;</button></div>' +
			'  <div class="bp-body">' +
			'    <div class="bp-blok bp-blok-diagram"><h4>Alur Kerja Singkat</h4><div class="bp-diagram"></div></div>' +
			'    <div class="bp-blok bp-blok-langkah"><h4>Langkah Lebih Rinci</h4><div class="bp-langkah-list"></div></div>' +
			'    <div class="bp-blok bp-blok-tips"><h4>Tips</h4><ul class="bp-tips"></ul></div>' +
			'  </div>' +
			'  <div class="bp-footer"><button type="button" class="bp-btn-ok">Mengerti</button></div>' +
			'</div>';
		document.body.appendChild(elOverlay);

		elModal = elOverlay.querySelector('.bp-modal');
		elIkon = elOverlay.querySelector('.bp-ikon');
		elJudul = elOverlay.querySelector('h3');
		elRingkasan = elOverlay.querySelector('.bp-sub');
		elDiagram = elOverlay.querySelector('.bp-diagram');
		elLangkah = elOverlay.querySelector('.bp-langkah-list');
		elBlokTips = elOverlay.querySelector('.bp-blok-tips');
		elTips = elBlokTips.querySelector('.bp-tips');

		const tutup = () => { elOverlay.className = 'bp-overlay'; };
		elOverlay.querySelector('.bp-tutup').addEventListener('click', tutup);
		elOverlay.querySelector('.bp-btn-ok').addEventListener('click', tutup);
		elOverlay.addEventListener('click', (e) => { if (e.target === elOverlay) tutup(); });
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && elOverlay.classList.contains('tampil')) tutup();
		});
	}

	function tampilkan(kunciTopik) {
		const info = TOPIK[kunciTopik];
		if (!info) {
			console.warn('[Bantuan] topik tidak dikenal:', kunciTopik);
			return;
		}
		suntikSekaliJalan();

		elIkon.textContent = info.ikon || '\u{2753}';
		elJudul.textContent = info.judul;
		elRingkasan.textContent = info.ringkasan || '';

		elDiagram.innerHTML = svgAlur(info.alur || []);

		elLangkah.innerHTML = '';
		(info.langkah || []).forEach((l) => {
			const div = document.createElement('div');
			div.className = 'bp-langkah-item';
			const b = document.createElement('b');
			b.textContent = l.judul;
			const span = document.createElement('span');
			span.textContent = l.teks;
			div.appendChild(b);
			div.appendChild(span);
			elLangkah.appendChild(div);
		});

		elTips.innerHTML = '';
		const tipsArr = info.tips || [];
		elBlokTips.style.display = tipsArr.length ? '' : 'none';
		tipsArr.forEach((t) => {
			const li = document.createElement('li');
			li.textContent = t;
			elTips.appendChild(li);
		});

		elOverlay.className = 'bp-overlay tampil';
	}

	// Pasang otomatis ke tombol #btnBantuan (atribut data-topik menentukan konten) --
	// tiap halaman cukup menaruh tombolnya, tidak perlu menulis JS pemicu sendiri.
	document.addEventListener('DOMContentLoaded', () => {
		const tombol = document.getElementById('btnBantuan');
		if (tombol) {
			tombol.addEventListener('click', () => tampilkan(tombol.getAttribute('data-topik')));
		}
	});

	window.Bantuan = { tampilkan, TOPIK };
})();
