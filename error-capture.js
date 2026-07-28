/**
 * error-capture.js -- Penangkap error/exception GLOBAL untuk jendela renderer (Kasir, Ringkasan,
 * Pesanan, Customer/Anggota, Aturan Diskon, Laporan-Laporan, Riwayat Sinkronisasi, Log Error sendiri)
 * -- dimuat lewat satu tag <script> yang sama di SETIAP halaman tsb, tepat setelah preload selesai
 * membuka {@code window.electronAPI}.
 *
 * <p><b>Kenapa perlu ini.</b> Sebelum menu "Log Error" ada, satu-satunya jejak error di sisi renderer
 * (kesalahan sintaks/logika JS di halaman, promise yang ditolak tanpa `.catch()`, dst) adalah DevTools
 * console -- yang tidak pernah dibuka kasir/admin toko sehari-hari, dan hilang begitu jendela ditutup.
 * File ini menangkap DUA jenis kegagalan JS yang paling umum lolos dari try/catch manual:</p>
 * <ul>
 *   <li>{@code window.onerror} -- exception sinkron yang tak tertangkap di mana pun (typo, akses
 *       properti dari {@code null}, dst).</li>
 *   <li>{@code unhandledrejection} -- Promise yang ditolak (mis. {@code fetch}/{@code ipcRenderer.invoke}
 *       gagal) tanpa ada {@code .catch()} di rantai pemanggilnya.</li>
 * </ul>
 *
 * <p>Keduanya diteruskan ke proses utama lewat {@code posAPI.errorLog.catat} (lihat JavaDoc handler
 * {@code pos:error-log-catat} di main.js), yang menyimpannya ke SQLite lokal (tabel {@code error_log})
 * supaya bisa diperiksa lewat menu "Log Error" (log-error.html) tanpa perlu DevTools.</p>
 *
 * <p><b>Sengaja diam-diam gagal</b> bila {@code window.electronAPI} belum tersedia (mis. dimuat
 * sebelum preload selesai) atau panggilan IPC itu sendiri gagal -- logger tidak boleh menjadi sumber
 * error baru yang justru menutupi error asli yang sedang dicoba dicatat.</p>
 */
(function () {
    function potong(teks, maks) {
        teks = String(teks == null ? '' : teks);
        return teks.length > maks ? teks.slice(0, maks) : teks;
    }

    function kirim(sumber, pesan, detail) {
        try {
            if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.errorLog) return;
            window.electronAPI.posAPI.errorLog.catat({
                sumber: sumber,
                tingkat: 'error',
                pesan: potong(pesan, 500),
                detail: potong(detail, 3000),
                layar: document.title || location.pathname
            }).catch(function () { /* IPC gagal -- diamkan, jangan sampai bikin error baru */ });
        } catch (e) { /* diamkan -- lihat JavaDoc file ini */ }
    }

    /**
     * Tampilkan modal {@code PesanDetail} utk error tak tertangkap -- SEBELUM perbaikan ini, jejak
     * satu-satunya adalah baris di menu "Log Error" yang TIDAK ADA kasir/admin toko yang membukanya
     * sehari-hari, jadi kegagalan diam-diam terjadi tanpa pernah terlihat siapa pun saat itu juga.
     * Sekarang SETIAP kegagalan langsung memunculkan alert, dgn detail teknis mentah tersedia utk
     * disalin/dilaporkan via tombol di modal (lihat pesan-detail.js).
     *
     * Guard anti-badai (sama seperti error-alert.js versi Android): pesan IDENTIK dlm 4 detik terakhir
     * tidak memicu modal baru -- mencegah tumpukan modal bila satu error yang sama berulang cepat
     * (mis. dari dalam setInterval).
     */
    var pesanTerakhir = null, waktuTerakhir = 0;
    function tampilkanAlert(sumber, pesan, detail) {
        try {
            if (!window.PesanDetail || typeof window.PesanDetail.tampilkan !== 'function') return;
            var sekarang = Date.now();
            if (pesan === pesanTerakhir && (sekarang - waktuTerakhir) < 4000) return;
            pesanTerakhir = pesan; waktuTerakhir = sekarang;
            window.PesanDetail.tampilkan({
                tingkat: 'error',
                judul: 'Terjadi Kesalahan Tak Terduga',
                penjelasan: 'Aplikasi mengalami kegagalan yang belum punya penjelasan khusus. Detail teknis di bawah bisa membantu admin/pengembang menemukan penyebabnya -- silakan salin atau laporkan langsung lewat tombol di bawah.',
                langkah: ['Coba ulangi tindakan yang tadi dilakukan.', 'Bila terus terjadi, laporkan lewat tombol "Laporkan ke GitHub" di bawah supaya bisa segera diperbaiki.'],
                teknis: '[' + sumber + '] ' + pesan + (detail ? '\n\n' + detail : '')
            });
        } catch (e) { /* diamkan -- alert BUKAN aksi kritikal, jangan sampai bikin error baru */ }
    }

    window.addEventListener('error', function (ev) {
        var err = ev && ev.error;
        var pesan = (err && err.message) || ev.message || 'Error JS tak dikenal';
        var detail = (err && err.stack) || ((ev.filename || '?') + ':' + (ev.lineno || '?') + ':' + (ev.colno || '?'));
        kirim('window.onerror', pesan, detail);
        tampilkanAlert('window.onerror', pesan, detail);
    });

    window.addEventListener('unhandledrejection', function (ev) {
        var alasan = ev && ev.reason;
        var pesan = (alasan && alasan.message) || String(alasan || 'Promise ditolak tanpa alasan');
        var detail = alasan && alasan.stack;
        kirim('unhandledrejection', pesan, detail);
        tampilkanAlert('unhandledrejection', pesan, detail);
    });
})();
