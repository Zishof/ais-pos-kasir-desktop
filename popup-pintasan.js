/**
 * Pintasan keyboard UNIVERSAL utk popup/modal -- ESC menutup overlay yg sedang terbuka, di SEMUA
 * layar (bukan cuma Kasir, yg sudah punya pemetaan sendiri lebih rinci di pos-renderer.js termasuk
 * Enter-konfirmasi -- lihat PETA_OVERLAY_ESC_ENTER di sana). File ini dimuat sbg <script> terpisah
 * di layar-layar LAIN (pola sama bantuan.js/branding.js) -- TIDAK dimuat di customer.html (layar
 * tampilan pelanggan, sengaja dikecualikan: tak ada keyboard fisik di dekatnya).
 *
 * HANYA ESC-menutup -- SENGAJA TIDAK ADA Enter-konfirmasi generik di sini: tombol "konfirmasi" tiap
 * modal beda arti (kadang "Simpan", kadang "Hapus Permanen", kadang cuma filter "Cari") dan class
 * CSS-nya TIDAK cukup konsisten lintas layar utk ditebak otomatis dgn aman -- salah tebak bisa
 * memicu aksi DESTRUKTIF tanpa sengaja. Kalau suatu layar butuh Enter-konfirmasi utk modal
 * tertentu, tambahkan pemetaan eksplisit sendiri di renderer.js layar itu (pola yg sama dipakai
 * pos-renderer.js), bukan di sini.
 *
 * Selektor overlay mencakup 4 variasi nama class yg dipakai berbagai layar (lihat survei lintas-
 * layar): "overlay" (mayoritas), "overlay-modal" (retur-penjualan/riwayat-penjualan/laporan-
 * transaksi), "overlay-review" (produk), "overlay-pin" (customer -- meski file ini tak dimuat di
 * sana). Tombol tutup dicari berlapis: class="tutup"/"btn-tutup" (X pojok, pola paling umum), lalu
 * id berawalan "btnTutup" (fallback penamaan lain), lalu id mengandung "Batal" (mis. modal Alasan
 * di Ringkasan yg tak punya tombol X sama sekali, hanya "Batal"/"Lanjut").
 */
(function () {
    'use strict';

    var SELEKTOR_OVERLAY_TAMPIL = '.overlay.tampil, .overlay-modal.tampil, .overlay-review.tampil, .overlay-pin.tampil';

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var overlayAktif = document.querySelector(SELEKTOR_OVERLAY_TAMPIL);
        if (!overlayAktif) return;
        var tombolTutup = overlayAktif.querySelector('.tutup, .btn-tutup')
            || overlayAktif.querySelector('[id^="btnTutup"]')
            || overlayAktif.querySelector('[id*="Batal"]');
        if (tombolTutup) { event.preventDefault(); tombolTutup.click(); }
    });
})();
