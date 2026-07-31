/**
 * preload.js -- Jembatan aman antara proses utama (main.js) dan halaman web AIS POS yang dimuat di
 * jendela kasir utama. Dijalankan dalam konteks terisolasi ({@code contextIsolation: true}) sehingga
 * halaman web TIDAK punya akses langsung ke Node.js/API sistem -- hanya fungsi yang SENGAJA
 * diekspos di sini lewat {@code contextBridge} yang bisa dipanggil halaman web, lewat
 * {@code window.electronAPI}.
 *
 * Dipakai oleh _pos.jsp (fungsi {@code bukaLayarPelanggan()}) untuk mendeteksi bahwa halaman sedang
 * berjalan di dalam shell desktop (bukan browser biasa) dan mengarahkan tombol "Layar Pelanggan" ke
 * jendela native yang dikelola main.js, alih-alih popup browser biasa.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    /** Penanda sederhana bagi halaman web: {@code true} berarti berjalan di dalam shell desktop ini. */
    isElectron: true,

    /** Minta proses utama membuka (atau memfokuskan) jendela Layar Pelanggan di {@code url} yang diberikan. */
    openCustomerScreen: (url) => ipcRenderer.send('customer-screen:open', url),

    /** Minta proses utama menutup jendela Layar Pelanggan bila sedang terbuka. */
    closeCustomerScreen: () => ipcRenderer.send('customer-screen:close'),

    /** @return {Promise<boolean>} true bila jendela Layar Pelanggan sedang terbuka saat ini. */
    isCustomerScreenOpen: () => ipcRenderer.invoke('customer-screen:is-open'),

    /** @return {Promise<boolean>} true bila sistem mendeteksi lebih dari satu monitor terpasang. */
    hasSecondDisplay: () => ipcRenderer.invoke('display:has-second'),

    /** Membuka {@code url} (harus {@code https://}) di browser default sistem -- dipakai tautan di dalam catatan rilis Update Sistem. @param {string} url */
    bukaLinkEksternal: (url) => ipcRenderer.send('pos:buka-link-eksternal', url),

    // --- Dipakai HANYA oleh error.html (dimuat di jendela yang sama, jadi berbagi preload ini) ---
    /** Minta proses utama memuat ulang URL server tersimpan di jendela ini. */
    retryConnection: () => ipcRenderer.send('error-page:retry'),
    /** Minta proses utama membuka wizard pengaturan dari halaman error. */
    openSetupFromError: () => ipcRenderer.send('error-page:open-setup'),

    /**
     * Penyimpanan transaksi lokal PERSISTEN (SQLite, lihat local-db.js) -- dipakai ais_pos_offline.js
     * sebagai pengganti IndexedDB KETIKA berjalan di dalam shell desktop ini (terdeteksi lewat
     * window.electronAPI.isElectron). Semua method di sini async (Promise) walau di sisi main
     * process better-sqlite3 sinkron -- tetap dibungkus ipcRenderer.invoke supaya kontraknya konsisten
     * dengan API IndexedDB yang digantikannya (yang memang berbasis Promise).
     */
    localDb: {
        /** @param {object} trx objek transaksi lengkap (sama seperti dikirim ke server). @return {Promise<boolean>} */
        simpanBaru: (trx) => ipcRenderer.invoke('local-db:simpan-baru', trx),
        /** @param {string} clientTrxId @return {Promise<void>} */
        tandaiSinkron: (clientTrxId) => ipcRenderer.invoke('local-db:tandai-sinkron', clientTrxId),
        /** @param {string} clientTrxId @param {string} pesan @return {Promise<void>} */
        tandaiGagal: (clientTrxId, pesan) => ipcRenderer.invoke('local-db:tandai-gagal', clientTrxId, pesan),
        /** @return {Promise<Array<object>>} transaksi yang masih menunggu sinkron. */
        listPending: () => ipcRenderer.invoke('local-db:list-pending'),
        /** @param {object} filter @return {Promise<{data:Array<object>, total:number}>} */
        listSemua: (filter) => ipcRenderer.invoke('local-db:list-semua', filter),
        /** @return {Promise<string|null>} waktu ISO sinkron paling akhir. */
        waktuSinkronTerakhir: () => ipcRenderer.invoke('local-db:waktu-sinkron-terakhir'),
        /** @return {Promise<Array<{kunci:string, disimpanPada:string, data:object|null}>>} seluruh data "sinkron masuk" (cache referensi) tersimpan -- dipakai halaman Riwayat Sinkronisasi. */
        listCache: () => ipcRenderer.invoke('local-db:list-cache')
    },

    /**
     * Dipakai halaman Kasir (POS) LOKAL ({@code pos.html}, dimuat file:// di jendela ini) untuk
     * bicara ke server lewat {@code /PosApi} (JSON bertipe + token, lihat JavaDoc
     * {@code ais.action.servlet.PosApi} di server). SELURUH permintaan jaringan dilakukan di proses
     * UTAMA (bukan {@code fetch()} di renderer) -- konsisten dgn pola login/setup di aplikasi ini:
     * renderer hanya mengirim niat lewat IPC, main process yang memegang token & bicara ke server,
     * dan main process JUGA yang memutuskan fallback ke cache lokal saat offline (lihat JavaDoc
     * handler {@code pos:*} di main.js) -- satu tempat, bukan logic offline terduplikasi di renderer.
     */
    posAPI: {
        /** @return {Promise<{ok:boolean, tersedia:boolean}>} status token API saat ini (siap dipakai atau tidak). */
        status: () => ipcRenderer.invoke('pos:status'),
        /** Fitur "Tombol Logout" sidebar (SEMUA 13 layar) -- meneruskan ke main.js logoutDariAplikasi() (konfirmasi native + hapus kredensial "Ingat Saya"/hash offline + cabut token + kembali ke layar login). @return {Promise<{ok:boolean}>} */
        keluarAkun: () => ipcRenderer.invoke('pos:logout-akun'),
        /** @return {Promise<boolean>} true bila sesi kasir ini sedang berjalan dalam Login Mode Offline (lihat JavaDoc handler login:coba-offline di main.js) -- tanpa token, katalog/checkout memakai cache+antrean lokal sepenuhnya. */
        modeOffline: () => ipcRenderer.invoke('pos:mode-offline'),
        /** @param {{keyword?:string}} opsi @return {Promise<{ok:boolean, data?:object, fromCache?:boolean, cachedAt?:string, pesan?:string}>} */
        katalog: (opsi) => ipcRenderer.invoke('pos:katalog', opsi),
        /** Gap-closure "layar Kasir HANYA baca local DB" -- TIDAK PERNAH memanggil server, murni SQLite lokal (produk_cache, aktif=1 saja). Lihat JavaDoc handler {@code pos:produk-cache-kasir} di main.js. @return {Promise<{ok:boolean, data?:{produk:object[], kategori:Array<{id,nama}>}, pesan?:string}>} */
        katalogKasirLokal: () => ipcRenderer.invoke('pos:produk-cache-kasir'),
        /**
         * Progress layar muat awal (katalog produk + gambar) -- lihat JavaDoc {@code kirimStatusKatalog}/
         * {@code unduhCacheGambarProduk} di main.js. Dipakai overlay {@code #layarMuat} di pos.html
         * supaya kasir tahu PERSIS sedang apa (menghubungi server / membaca cache lokal / mengunduh N
         * gambar) alih-alih teks statis tanpa progres.
         * @param {(status:{tipe:string, totalPerluUnduh?:number, sudahTercache?:number, selesai?:number, total?:number})=>void} callback
         */
        onKatalogStatus: (callback) => ipcRenderer.on('pos:katalog-status', (event, status) => callback(status)),
        /** @return {Promise<{ok:boolean, data?:object, fromCache?:boolean, cachedAt?:string, pesan?:string}>} */
        konfigurasi: () => ipcRenderer.invoke('pos:konfigurasi'),
        /** Baca konfigurasi TERSIMPAN saja, TANPA memicu percobaan jaringan -- dipakai layar Kasir utk paint instan saat boot (lihat JavaDoc {@code muatKatalogDanKonfigurasi} di pos-renderer.js). @return {Promise<{ok:boolean, data?:object|null, disimpanPada?:string}>} */
        konfigurasiCacheBaca: () => ipcRenderer.invoke('pos:konfigurasi-cache-baca'),
        /** Fitur "Multi-Toko" -- lihat JavaDoc handler {@code pos:daftar-toko-saya} di main.js. @return {Promise<{ok:boolean, data?:{data:Array<{id:number,nama:string}>, tokoAktifId?:number}, offline?:boolean, pesan?:string}>} */
        daftarTokoSaya: () => ipcRenderer.invoke('pos:daftar-toko-saya'),
        /** @param {{tokoId:number}|number} payload @return {Promise<{ok:boolean, data?:object, pesan?:string}>} */
        pilihTokoAktif: (payload) => ipcRenderer.invoke('pos:pilih-toko-aktif', payload),
        /** @param {object} payload @return {Promise<{ok:boolean, offline?:boolean, data?:object, pesan?:string}>} */
        bayar: (payload) => ipcRenderer.invoke('pos:bayar', payload),
        /** @param {object} payload @return {Promise<{ok:boolean, offline?:boolean, data?:object, pesan?:string}>} */
        draftBayar: (payload) => ipcRenderer.invoke('pos:draft-bayar', payload),
        /** @param {object} payload @return {Promise<{ok:boolean, data?:object, pesan?:string}>} HANYA online -- tak berlaku offline. */
        checkBayar: (payload) => ipcRenderer.invoke('pos:check-bayar', payload),
        /** @return {Promise<{ok:boolean, data:{idMesin:string, namaMesin:string}}>} identitas mesin POS ini (lihat JavaDoc main.js MESIN_PATH). */
        identitasMesinBaca: () => ipcRenderer.invoke('pos:identitas-mesin-baca'),
        /** @param {{namaMesin:string}} payload @return {Promise<{ok:boolean, data:{idMesin:string, namaMesin:string}}>} */
        identitasMesinSimpan: (payload) => ipcRenderer.invoke('pos:identitas-mesin-simpan', payload),
        /** Memicu sinkronisasi manual seluruh transaksi PENDING ke server (lihat tombol "Sinkronkan Sekarang" di pos.html). @return {Promise<{disinkron:number, gagal:number}>} */
        syncNow: () => ipcRenderer.invoke('pos:sync-now'),
        /** @param {{sejak?:string, sampai?:string, kode?:string, pembeli?:string, pedagang?:string, hanya_belum_lunas?:boolean, limit?:number}} [payload] filter opsional (gap-closure, padanan filter Mulai/Akhir/Kode/Pembeli/Pedagang JSP), semua boleh kosong. @return {Promise<{ok:boolean, data?:{pesanan:Array<object>}, fromCache?:boolean, cachedAt?:string, pesan?:string}>} */
        pesananList: (payload) => ipcRenderer.invoke('pos:pesanan-list', payload || {}),
        /** @param {object} payload payload lengkap {action tak perlu disertakan, lihat KantinHelper.bayar} @return {Promise<{ok:boolean, offline?:boolean, data?:object, pesan?:string}>} */
        pesananVerifikasi: (payload) => ipcRenderer.invoke('pos:pesanan-verifikasi', payload),
        /** @param {{id:number}} payload @return {Promise<{ok:boolean, offline?:boolean, pesan?:string}>} */
        pesananBatal: (payload) => ipcRenderer.invoke('pos:pesanan-batal', payload),
        /** "Hitung Ulang" (gap-closure) -- lihat JavaDoc pos:pesanan-hitung-ulang di main.js. @param {{draft_id:number}} payload @return {Promise<{ok:boolean, offline?:boolean, data?:object, pesan?:string}>} */
        pesananHitungUlang: (payload) => ipcRenderer.invoke('pos:pesanan-hitung-ulang', payload),
        /** @return {Promise<{ok:boolean, data?:{omzetHariIni:number, transaksiHariIni:number, qtyTerjualHariIni:number, produkTerlaris:Array<object>}, fromCache?:boolean, cachedAt?:string, pesan?:string}>} */
        ringkasan: () => ipcRenderer.invoke('pos:ringkasan'),

        /**
         * Rincian 1 transaksi (header + baris item) utk tombol "Cetak Struk" di layar Ringkasan (yg
         * hanya punya data agregat per baris, bukan rincian item) -- lihat JavaDoc server
         * {@code PosApi.prosesDetailTransaksi}. HANYA online (rincian struk historis tak di-cache).
         * @param {{id:number}} payload id {@code PembelianAnggotaKoperasi}.
         * @return {Promise<{ok:boolean, data?:{kode:string, waktu:string, tokoNama:string, bayarTunai:number, bayarNonTunai:number, kembalian:number, totalBiaya:number, totalDiskon:number, totalCashback:number, item:Array<{nama:string, qty:number, harga:number, diskon:number}>}, pesan?:string}>}
         */
        detailTransaksi: (payload) => ipcRenderer.invoke('pos:detail-transaksi', payload),

        /**
         * Dasbor "Ringkasan" 4 tab (dulunya cuma 1 kartu KPI sederhana) -- port dari dashboard admin
         * Kantin versi web, di-scope selalu ke toko kasir yg login. Lihat JavaDoc method server
         * {@code PosApi.prosesDashboardUmum} dst utk bentuk data lengkap tiap balikan.
         */
        dashboard: {
            /** @param {{periodeTren?:string, tglMulai?:string, tglSampai?:string, cariPembeli?:string, page?:number, pageSize?:number}} payload */
            umum: (payload) => ipcRenderer.invoke('pos:dashboard-umum', payload),
            /** Baca-saja, murni cache lokal (potret respons {@link #umum} sukses TERAKHIR) -- dipakai paint SEKETIKA sebelum panggilan live selesai. @return {Promise<{ok:boolean, data:?object, disimpanPada:?string, pesan?:string}>} */
            umumCacheBaca: () => ipcRenderer.invoke('pos:dashboard-umum-cache-baca'),
            keuangan: () => ipcRenderer.invoke('pos:dashboard-keuangan'),
            /** @param {{periode?:string}} payload */
            produk: (payload) => ipcRenderer.invoke('pos:dashboard-produk', payload),
            /** @param {{periode?:string}} payload */
            pelanggan: (payload) => ipcRenderer.invoke('pos:dashboard-pelanggan', payload),
            /** @param {{id:number}} payload */
            layaniTransaksi: (payload) => ipcRenderer.invoke('pos:layani-transaksi', payload),
            /** @param {{tglMulai?:string, tglSampai?:string}} payload */
            layaniSemuaTransaksi: (payload) => ipcRenderer.invoke('pos:layani-semua-transaksi', payload),
            /** Dasbor "Peringkat Mitra/Toko" (gap-closure kloning ZK), lihat JavaDoc server {@code KantinHelper.peringkatMitra}. @param {{tglMulai?:string, tglSampai?:string}} [payload] */
            peringkatMitra: (payload) => ipcRenderer.invoke('pos:dashboard-peringkat-mitra', payload),
            /** Dasbor "Resep, HPP & Margin" (gap-closure kloning ZK), lihat JavaDoc server {@code KantinHelper.resepHppMargin}. */
            resepHpp: () => ipcRenderer.invoke('pos:dashboard-resep-hpp'),
            /** Dasbor "Ramalan Penjualan" (gap-closure kloning ZK), lihat JavaDoc server {@code KantinHelper.ramalanPenjualan}. */
            ramalan: () => ipcRenderer.invoke('pos:dashboard-ramalan'),
            /** Dasbor "Monitor Promo & Cashback" (gap-closure kloning ZK), lihat JavaDoc server {@code KantinHelper.monitorPromoCashback}. */
            promoCashback: () => ipcRenderer.invoke('pos:dashboard-promo-cashback'),
            /** Dasbor "Kepatuhan Operasional" (gap-closure kloning ZK, 4 dari 6 rule), lihat JavaDoc server {@code KantinHelper.kepatuhanOperasional}. */
            kepatuhan: () => ipcRenderer.invoke('pos:dashboard-kepatuhan')
        },

        /**
         * Layar "Report Order/Sesi/Payment" (spesifikasi klien "Flow Kasir") -- lihat JavaDoc server
         * {@code PosApi.daftarOrderDenganSesi}/{@code prosesLaporanSesiList} utk bentuk data lengkap.
         */
        laporanTransaksi: {
            /** @param {{tglMulai?:string, tglSampai?:string, cariPembeli?:string, page?:number, pageSize?:number}} payload */
            order: (payload) => ipcRenderer.invoke('pos:laporan-order-list', payload),
            /** @param {{tglMulai?:string, tglSampai?:string, page?:number, pageSize?:number}} payload */
            sesi: (payload) => ipcRenderer.invoke('pos:laporan-sesi-list', payload),
            /** @param {{tglMulai?:string, tglSampai?:string, cariPembeli?:string, page?:number, pageSize?:number}} payload */
            payment: (payload) => ipcRenderer.invoke('pos:laporan-payment-list', payload),
            /** Dasbor KPI+breakdown per-kasir/per-mesin (gap-closure paritas Produk), fallback ke cache lokal saat offline. @return {Promise<{ok:boolean, data?:object, dariCache?:boolean, disimpanPada?:string, offline?:boolean, pesan?:string}>} */
            statistik: () => ipcRenderer.invoke('pos:transaksi-statistik'),
            /** Baca-saja, murni cache lokal (potret {@link #order} sukses TERAKHIR) -- paint SEKETIKA sebelum live selesai. Dipakai BERSAMA oleh tab Order Laporan Transaksi & layar Riwayat Penjualan (channel IPC sama). */
            orderCacheBaca: () => ipcRenderer.invoke('pos:laporan-order-list-cache-baca'),
            /** Baca-saja, murni cache lokal (potret {@link #sesi} sukses TERAKHIR). */
            sesiCacheBaca: () => ipcRenderer.invoke('pos:laporan-sesi-list-cache-baca'),
            /** Baca-saja, murni cache lokal (potret {@link #payment} sukses TERAKHIR). */
            paymentCacheBaca: () => ipcRenderer.invoke('pos:laporan-payment-list-cache-baca')
        },
        /** Status cache lokal Pesanan (gap-closure indikator "terakhir disinkron" paritas Produk/Anggota), lihat JavaDoc handler {@code pos:pesanan-cache-info} di main.js. */
        pesananCacheInfo: () => ipcRenderer.invoke('pos:pesanan-cache-info'),

        /**
         * Layar "Stok Opname" -- lihat JavaDoc IPC {@code pos:stokopname-*} di main.js. {@code simpan}
         * ditolak server (status error) bila pemanggil bukan supervisor/admin; {@code scan}/{@code
         * ringkasan} boleh dipanggil siapa saja.
         */
        stokOpname: {
            /** @param {{barcode:string}} payload */
            scan: (payload) => ipcRenderer.invoke('pos:stokopname-scan', payload),
            /** @param {{produk_id:number, stok_fisik:number, keterangan?:string}} payload */
            simpan: (payload) => ipcRenderer.invoke('pos:stokopname-simpan', payload),
            ringkasan: () => ipcRenderer.invoke('pos:stokopname-ringkasan'),
            /** Daftar catatan hari ini dari server (gap-closure) -- @param {{limit?:number}} [payload] */
            riwayat: (payload) => ipcRenderer.invoke('pos:stokopname-riwayat', payload || {}),
            /** Dashboard "Mutasi Barang" (gap-closure, padanan JSP stok/mutasi_stok.jsp) -- @param {{periode?:string}} [payload] */
            dashboard: (payload) => ipcRenderer.invoke('pos:stokopname-dashboard', payload || {}),
            /** Baca-saja, murni cache lokal (potret {@link #dashboard} sukses TERAKHIR) -- paint SEKETIKA sebelum live selesai. */
            dashboardCacheBaca: () => ipcRenderer.invoke('pos:stokopname-dashboard-cache-baca')
        },

        /**
         * Layar "Kulakan" (Harga Beli / Pengadaan Produk) -- lihat JavaDoc IPC {@code pos:kulakan-*}
         * di main.js. Pencarian produk memakai ULANG {@code stokOpname.scan} di atas. {@code simpan}
         * ditolak server bila pemanggil bukan supervisor/admin; {@code list} boleh dipanggil siapa saja.
         */
        kulakan: {
            /** @param {{keyword?:string, page?:number, page_size?:number}} payload */
            list: (payload) => ipcRenderer.invoke('pos:kulakan-list', payload),
            /** @param {{produk_id:number, nomor_faktur?:string, nama_supplier?:string, qty:number, harga_beli_satuan:number, keterangan?:string}} payload */
            simpan: (payload) => ipcRenderer.invoke('pos:kulakan-simpan', payload),
            /** Baca-saja, murni cache lokal (potret {@link #list} sukses TERAKHIR) -- paint SEKETIKA sebelum live selesai. */
            listCacheBaca: () => ipcRenderer.invoke('pos:kulakan-list-cache-baca')
        },

        /**
         * Layar "Retur Penjualan" -- catat barang kembali dari pelanggan. Gated Supervisor utk
         * simpan/ubah/hapus (lihat JavaDoc server KantinHelper.returPenjualanSimpan) -- {@code list}
         * boleh dipanggil siapa saja.
         */
        returPenjualan: {
            /** @param {{keyword?:string, toko_id?:string, page?:number, page_size?:number}} payload */
            list: (payload) => ipcRenderer.invoke('pos:retur-penjualan-list', payload),
            /** Baca-saja, murni cache lokal (potret {@link #list} sukses TERAKHIR) -- paint SEKETIKA sebelum live selesai. */
            listCacheBaca: () => ipcRenderer.invoke('pos:retur-penjualan-list-cache-baca'),
            /** @param {{pembelian_anggota_koperasi_id?:number, kode_transaksi_asal?:string, nama_pembeli?:string, metode_pengembalian?:string, items:Array<{produk_id:number, qty:number, harga_satuan:number, alasan?:string, kondisi_barang?:string, kembalikan_ke_stok?:boolean}>}} payload */
            simpan: (payload) => ipcRenderer.invoke('pos:retur-penjualan-simpan', payload),
            /** @param {{id:number, qty?:number, harga_satuan?:number, alasan?:string, kondisi_barang?:string, kembalikan_ke_stok?:boolean, metode_pengembalian?:string, keterangan?:string}} payload */
            ubah: (payload) => ipcRenderer.invoke('pos:retur-penjualan-ubah', payload),
            /** @param {{id:number}} payload */
            hapus: (payload) => ipcRenderer.invoke('pos:retur-penjualan-hapus', payload)
        },

        /**
         * Layar "Ringkasan" -- batalkan transaksi (gap-closure padanan JSP {@code
         * riwayat_transaksi_service.jsp}/{@code _riwayat_transaksi_terbaru.jsp}). Gated Supervisor,
         * alasan WAJIB -- lihat JavaDoc server KantinHelper.batalkanTransaksi. Arsip tersimpan di
         * {@code koperasi.pembatalan_transaksi} (sama persis dgn JSP, bukan mekanisme terpisah).
         * @param {{id:number, alasan:string}} payload
         */
        batalkanTransaksi: (payload) => ipcRenderer.invoke('pos:batalkan-transaksi', payload),

        /**
         * Pohon navigasi ERP eBisnis lengkap (gap-closure dokumen STRUKTUR_MENU_LENGKAP_EBISNIS_ID.md)
         * -- dipakai menu-tree.js merender sidebar berbentuk tree (menggantikan `<nav>` statis flat).
         * HANYA berisi node yang sudah punya layar sungguhan (`tersedia:true` di ebisnis_menu_master
         * .json), beserta folder leluhurnya utk konteks pengelompokan.
         * @param {{platform:"desktop"}} payload
         */
        ebisnisMenuTree: (payload) => ipcRenderer.invoke('pos:ebisnis-menu-tree', payload),

        /** Layar "Produk" -- Cetak Price Tag/POP (gap-closure, padanan JSP barang/pricetag.jsp). */
        priceTag: {
            /** @param {{keyword?:string}} [payload] */
            listProduk: (payload) => ipcRenderer.invoke('pos:pricetag-list-produk', payload || {}),
            /** @param {{isi:string}} payload HTML lembar cetak lengkap (barcode SVG sudah dibangun di renderer). */
            cetakPreview: (payload) => ipcRenderer.invoke('pos:cetak-pricetag-preview', payload)
        },

        /**
         * Layar Kasir (Fase 4) -- evaluasi Aturan Diskon otomatis, lihat JavaDoc IPC {@code pos:diskon-evaluasi}
         * di main.js. Dipanggil ulang setiap kali keranjang berubah; kegagalan BUKAN blocker checkout.
         * @param {{id_member?:number, items:Array<{id:number, harga:number, jumlah:number}>}} payload
         * @return {Promise<{ok:boolean, data?:{items:Array<{id:number, diskon:number, cashback:number, aturanDiskon:number|null, berlakuPerHariDanPerToko:boolean}>}, pesan?:string}>}
         */
        diskonEvaluasi: (payload) => ipcRenderer.invoke('pos:diskon-evaluasi', payload),

        /** Tombol "Unduh CSV" di tiap tabel dasbor -- buka dialog simpan native. @param {{namaBerkas:string, isi:string}} opsi @return {Promise<{ok:boolean, dibatalkan?:boolean, path?:string, pesan?:string}>} */
        simpanFile: (opsi) => ipcRenderer.invoke('pos:simpan-file', opsi),

        /**
         * Fitur "Laporan-Laporan e-Kantin" (Desktop) -- katalog ~150 laporan (32 kategori), eksekusi
         * 1 laporan (JSON tabel), dan unduh PDF -- lihat JavaDoc server {@code PosApi.prosesLaporanJalankan}/
         * {@code prosesLaporanPdf} soal bagaimana ini dijembatani ke mesin {@code LaporanKantinUtil}
         * yang SAMA dipakai versi web.
         */
        laporan: {
            katalog: () => ipcRenderer.invoke('pos:laporan-katalog'),
            /** @param {{r:string, tokoId?:string, tglMulai?:string, tglSampai?:string, qProduk?:string, qPelanggan?:string, perToko?:string}} payload */
            jalankan: (payload) => ipcRenderer.invoke('pos:laporan-jalankan', payload),
            /** @param {{r:string, tokoId?:string, tglMulai?:string, tglSampai?:string, qProduk?:string, qPelanggan?:string, perToko?:string}} payload */
            pdf: (payload) => ipcRenderer.invoke('pos:laporan-pdf', payload)
        },
        /** Menyimpan PDF laporan (base64) ke berkas pilihan pengguna. @param {{namaBerkas:string, pdfBase64:string}} opsi */
        laporanSimpanPdf: (opsi) => ipcRenderer.invoke('pos:laporan-simpan-pdf', opsi),

        /** Fitur "Alih Bahasa" (Desktop) -- ambil kamus terjemahan 1 bahasa. @param {{lang:string, teks:string[]}} payload */
        i18nKamus: (payload) => ipcRenderer.invoke('pos:i18n-kamus', payload),

        /**
         * Tombol "Update Sistem" -- memeriksa/mengunduh/memasang versi BARU aplikasi desktop ini
         * sendiri (bukan sinkron data). Status berjalan (memeriksa/tersedia/terkini/unduh
         * progres/siap/error) datang lewat {@code onStatus}, BUKAN lewat balikan {@code cek()}/
         * {@code unduh()} -- kedua method itu cuma MEMICU aksi, lihat JavaDoc handler
         * {@code pos:update-*} di main.js.
         */
        update: {
            /** @return {Promise<string>} versi aplikasi TERPASANG saat ini (mis. "1.0.0"). */
            versiSaatIni: () => ipcRenderer.invoke('pos:update-versi-saat-ini'),
            /** @return {Promise<{ok:boolean, pesan?:string}>} */
            cek: () => ipcRenderer.invoke('pos:update-cek'),
            /** @return {Promise<{ok:boolean, pesan?:string}>} */
            unduh: () => ipcRenderer.invoke('pos:update-unduh'),
            /** Restart aplikasi + jalankan installer yang sudah terunduh -- hanya valid setelah status {tipe:'siap'}. */
            instal: () => ipcRenderer.send('pos:update-instal'),
            /** @param {(status:{tipe:string, versiBaru?:string, versi?:string, persen?:number, ditransferMb?:number, totalMb?:number, pesan?:string, catatan?:string})=>void} callback */
            onStatus: (callback) => ipcRenderer.on('pos:update-status', (event, status) => callback(status)),
            /** @return {Promise<{otomatis:boolean}>} preferensi "Update Otomatis" tersimpan. */
            preferensiBaca: () => ipcRenderer.invoke('pos:update-preferensi-baca'),
            /** @param {boolean} otomatis @return {Promise<{otomatis:boolean}>} */
            preferensiSet: (otomatis) => ipcRenderer.invoke('pos:update-preferensi-set', !!otomatis)
        },

        /** @param {{keyword?:string, id?:number}} opsi -- {@code keyword} utk cari (maks 20 baris) ATAU {@code id} utk exact lookup SATU member (Fase 5, dipakai memulihkan member saat "Muat" Keranjang Tertahan). @return {Promise<{ok:boolean, data?:{member:Array<{id,nama,kodeIdentitas,wajibPin,minSaldo,fotoPathLokal?}>}, offline?:boolean, dariCache?:boolean, pesan?:string}>} `dariCache:true` berarti hasil dari cache lokal (offline) -- lihat JavaDoc handler `pos:cari-member` di main.js. */
        cariMember: (opsi) => ipcRenderer.invoke('pos:cari-member', opsi),

        /** Fase 5 -- daftar metode bayar, terfilter per jenis-anggota bila {@code id_member} dikirim. Lihat JavaDoc handler `pos:cara-bayar-list` di main.js. @param {{id_member?:number}} opsi @return {Promise<{ok:boolean, data?:{caraBayar:Array<{id,nama,manual}>}, offline?:boolean, pesan?:string}>} */
        caraBayarList: (opsi) => ipcRenderer.invoke('pos:cara-bayar-list', opsi),

        /** @param {{id_toko?:number, limit?:number}} [opsi] @return {Promise<{ok:boolean, data?:{data:Array<{id,nama,kodeIdentitas,wajibPin,minSaldo,fotoPathLokal?,waktuTerakhir}>}}>} anggota dgn transaksi terbaru -- lihat JavaDoc handler `pos:anggota-transaksi-terbaru` di main.js. */
        anggotaTransaksiTerbaru: (opsi) => ipcRenderer.invoke('pos:anggota-transaksi-terbaru', opsi),

        /**
         * Fitur "Picker Member Offline" -- cache SQLite lokal seluruh anggota koperasi (data+foto),
         * lihat JavaDoc {@code sinkronkanAnggotaLengkap} di main.js.
         */
        anggotaSync: {
            /** Memicu sinkron penuh (data lalu foto) di background -- return segera, progres lewat {@code onStatus}. @return {Promise<{ok:boolean, pesan?:string}>} */
            mulai: () => ipcRenderer.invoke('pos:anggota-sync-mulai'),
            /** @param {(status:{tipe:string, totalSejauhIni?:number, terproses?:number, totalFoto?:number, diperbarui?:number, totalAnggota?:number, tahap?:string, pesan?:string})=>void} callback */
            onStatus: (callback) => ipcRenderer.on('pos:anggota-sync-status', (event, status) => callback(status))
        },
        /** Pencarian member di cache lokal (dipakai picker saat mengetik, digabung dgn hasil server bila online). @param {{keyword:string, limit?:number}} opsi @return {Promise<{ok:boolean, data?:Array<object>, totalCache?:number, pesan?:string}>} */
        anggotaCacheCari: (opsi) => ipcRenderer.invoke('pos:anggota-cache-cari', opsi),
        /**
         * Verifikasi PIN member LANGSUNG di layar utama Kasir -- fallback saat Layar Pelanggan (monitor
         * kedua) tidak/belum dibuka (lihat JavaDoc {@code mintaPinDiLayarUtama} di pos-renderer.js).
         * Channel IPC sama persis dgn {@code customerAPI.verifikasiPin} (preload-customer.js) --
         * handler {@code pos:verifikasi-pin} di main.js generik, tidak terikat ke jendela tertentu.
         * @param {{memberId:number, pin:string}} payload
         * @return {Promise<{ok:boolean, cocok?:boolean, offline?:boolean, pesan?:string}>}
         */
        verifikasiPin: (payload) => ipcRenderer.invoke('pos:verifikasi-pin', payload),

        /**
         * Manajemen akun (butir 11 spesifikasi "dashboard kasir") -- ganti kata sandi akun sendiri
         * (siapa pun boleh) dan tambah akun kasir baru (admin/manager saja, gerbangnya server-side,
         * lihat JavaDoc {@code KantinHelper.gantiPasswordSendiri}/{@code tambahAkunKasir}).
         */
        akun: {
            /** @param {{password_lama:string, password_baru:string}} payload @return {Promise<{ok:boolean, pesan?:string}>} */
            gantiPassword: (payload) => ipcRenderer.invoke('pos:akun-ganti-password', payload),
            /** @param {{userid:string, password:string, nama:string, toko_id:number, keterangan?:string}} payload @return {Promise<{ok:boolean, pesan?:string}>} */
            tambah: (payload) => ipcRenderer.invoke('pos:akun-tambah', payload)
        },

        /**
         * Menu "Konfigurasi" -- kelola akun {@code Pedagang} (kasir) milik toko yang login. Gerbang
         * tambah/ubah ditegakkan SERVER-SIDE (supervisor/admin saja, lihat JavaDoc
         * {@code KantinHelper.pedagangList}/{@code pedagangUbah}) -- non-supervisor tetap boleh
         * memanggil {@code list} (lihat-saja), server akan menolak {@code ubah}.
         */
        pedagang: {
            /** @param {{toko_id?:number}} payload @return {Promise<{ok:boolean, data?:{data:Array<{id,userid,nama,keterangan,aktif,supervisor}>, bolehKelola:boolean}, offline?:boolean, pesan?:string}>} */
            list: (payload) => ipcRenderer.invoke('pos:pedagang-list', payload),
            /** @param {{id:number, nama?:string, keterangan?:string, aktif?:boolean, password_baru?:string, supervisor?:boolean}} payload -- {@code supervisor} hanya berlaku bila admin global. @return {Promise<{ok:boolean, pesan?:string}>} */
            ubah: (payload) => ipcRenderer.invoke('pos:pedagang-ubah', payload)
        },

        /**
         * Menu "Konfigurasi" -- Profil Toko (tersimpan di server, lihat JavaDoc
         * {@code KantinHelper.tokoProfilAmbil}/{@code tokoProfilSimpan}).
         */
        tokoProfil: {
            /** @param {{toko_id?:number}} payload @return {Promise<{ok:boolean, data?:object, bolehUbah?:boolean, offline?:boolean, pesan?:string}>} */
            ambil: (payload) => ipcRenderer.invoke('pos:toko-profil-ambil', payload),
            /** @param {object} payload lihat JavaDoc server tokoProfilSimpan (nama, alamat, kota, kode_pos, telp, email, pic_nama, pic_hp, npwp, jam_operasional, keterangan) @return {Promise<{ok:boolean, pesan?:string}>} */
            simpan: (payload) => ipcRenderer.invoke('pos:toko-profil-simpan', payload)
        },

        /**
         * Menu "Konfigurasi" -- tampilan aplikasi LOKAL (judul jendela + logo sidebar). Murni berkas
         * lokal (userData/branding.json), TIDAK PERNAH dikirim ke server. Lihat JavaDoc
         * {@code BRANDING_PATH} di main.js.
         */
        branding: {
            /** @return {Promise<{ok:boolean, data?:{judulAplikasi:string, logoLokalPath:string|null}, pesan?:string}>} */
            ambil: () => ipcRenderer.invoke('pos:branding-ambil'),
            /** @param {{judulAplikasi:string}} payload @return {Promise<{ok:boolean, data?:object, pesan?:string}>} */
            simpanJudul: (payload) => ipcRenderer.invoke('pos:branding-simpan-judul', payload),
            /** Membuka dialog pilih berkas gambar native lalu menyalinnya ke folder aplikasi. @return {Promise<{ok:boolean, dibatalkan?:boolean, data?:object, pesan?:string}>} */
            pilihLogo: () => ipcRenderer.invoke('pos:branding-pilih-logo')
        },

        /**
         * Butir 12 spesifikasi "dashboard kasir" -- layar "Customer/Anggota" (anggota.html), lihat
         * JavaDoc {@code KantinHelper.anggotaList}/{@code anggotaSimpan}/{@code jenisAnggotaList}.
         */
        anggota: {
            /** @param {{keyword?:string, page?:number, page_size?:number}} payload @return {Promise<{ok:boolean, data?:{data:Array<object>, total:number}, pesan?:string}>} */
            list: (payload) => ipcRenderer.invoke('pos:anggota-list', payload),
            /** @param {object} payload {id?, nama, kode_identitas?, hp?, telp?, email?, keterangan?, aktif?, jenis_anggota_koperasi_id?} @return {Promise<{ok:boolean, data?:{id:number, kode:string}, pesan?:string}>} */
            simpan: (payload) => ipcRenderer.invoke('pos:anggota-simpan', payload),
            /** @return {Promise<{ok:boolean, data?:{data:Array<{id:number, nama:string}>}, pesan?:string}>} */
            jenisList: () => ipcRenderer.invoke('pos:anggota-jenis-list'),
            /** @return {Promise<{ok:boolean, data?:{data:Array<{id:number, nama:string}>}, pesan?:string}>} */
            tipeList: () => ipcRenderer.invoke('pos:anggota-tipe-list'),
            /** Dasbor statistik anggota (gap-closure paritas Produk), lihat JavaDoc server {@code KantinHelper.anggotaStatistik}. @return {Promise<{ok:boolean, data?:{totalAnggota,totalAktif,totalNonaktif,totalWajibPin,byJenis:Array<{label,jumlah}>}, pesan?:string}>} */
            statistik: () => ipcRenderer.invoke('pos:anggota-statistik'),
            /** SELURUH cache lokal anggota (murni baca SQLite, tanpa jaringan) -- dipakai paint SEKETIKA sebelum {@link #list} selesai, pola sama {@code produk.cacheSemua}. @return {Promise<{ok:boolean, data?:Array<object>, pesan?:string}>} */
            cacheSemua: () => ipcRenderer.invoke('pos:anggota-cache-semua')
        },

        /**
         * Layar "Aturan Diskon" (diskon.html) -- kelola aturan promo yang sudah otomatis diterapkan
         * saat checkout ZK/JSP, lihat JavaDoc server {@code KantinHelper.diskonList}/{@code diskonSimpan}.
         */
        diskon: {
            /** @param {{keyword?:string, page?:number, page_size?:number}} payload @return {Promise<{ok:boolean, data?:{data:Array<object>, total:number}, pesan?:string}>} */
            list: (payload) => ipcRenderer.invoke('pos:diskon-list', payload),
            /** @param {object} payload lihat JavaDoc server diskonSimpan @return {Promise<{ok:boolean, data?:{id:number}, pesan?:string}>} */
            simpan: (payload) => ipcRenderer.invoke('pos:diskon-simpan', payload),
            /** Baca-saja, murni cache lokal (potret {@link #list} sukses TERAKHIR) -- paint SEKETIKA sebelum live selesai. */
            listCacheBaca: () => ipcRenderer.invoke('pos:diskon-list-cache-baca')
        },
        /**
         * Layar "Katalog Barang" (produk.html, khusus supervisor) -- daftar produk dibaca lewat
         * {@code katalog} (di atas, dipakai bareng layar Kasir), simpan lewat aksi baru ini saja.
         * Lihat JavaDoc server {@code KantinHelper.produkSimpan}.
         */
        produk: {
            /** @param {object} payload lihat JavaDoc server produkSimpan @return {Promise<{ok:boolean, data?:{id:number}, pesan?:string}>} */
            simpan: (payload) => ipcRenderer.invoke('pos:produk-simpan', payload),
            /** @return {Promise<{ok:boolean, data?:object, pesan?:string}>} lihat JavaDoc server KantinHelper.produkStatistik */
            statistik: () => ipcRenderer.invoke('pos:produk-statistik'),
            /** Fitur "klik kartu/bar statistik" -- gerbang toko sama dgn statistik() sendiri (ditegakkan server-side). @param {{tipe:string, nilai?:string}} payload @return {Promise<{ok:boolean, data?:{total:number, produk:Array}, pesan?:string}>} */
            statistikDetail: (payload) => ipcRenderer.invoke('pos:produk-statistik-detail', payload),
            /** Tombol "Sinkronkan" manual (cache lokal produk_cache) @return {Promise<{ok:boolean, total?:number, disinkronPada?:string, pesan?:string}>} */
            sinkronManual: () => ipcRenderer.invoke('pos:produk-sinkron-manual'),
            /** @return {Promise<{ok:boolean, data:{total:number, disinkronPada:?string}}>} status cache lokal produk TERKINI (tanpa memicu sinkron baru). */
            cacheRingkasan: () => ipcRenderer.invoke('pos:produk-cache-ringkasan'),
            /** @return {Promise<{ok:boolean, data?:{produk:object[], kategori:Array<{id:?number,nama:string}>, disinkronPada:?string}, pesan?:string}>} cache lokal SEMUA produk (termasuk Non-Aktif) -- dipakai tampilan seketika layar Katalog Barang, lihat JavaDoc pos:produk-cache-semua di main.js. */
            cacheSemua: () => ipcRenderer.invoke('pos:produk-cache-semua'),
            /** @return {Promise<{ok:boolean, data?:{fileBase64:string, namaFile:string, total:number}, pesan?:string}>} */
            eksporExcel: (payload) => ipcRenderer.invoke('pos:produk-ekspor-excel', payload),
            /** @param {{fileBase64:string, namaBerkas?:string}} opsi @return {Promise<{ok:boolean, path?:string, dibatalkan?:boolean, pesan?:string}>} */
            simpanExcel: (opsi) => ipcRenderer.invoke('pos:produk-simpan-excel', opsi),
            /** @return {Promise<{ok:boolean, base64?:string, namaBerkas?:string, dibatalkan?:boolean, pesan?:string}>} */
            pilihExcel: () => ipcRenderer.invoke('pos:produk-pilih-excel'),
            /** Langkah 1/2 "Unggah Excel" -- parse SAJA, tidak menulis DB. @param {{file_base64:string}} payload @return {Promise<{ok:boolean, data?:{baris:object[], daftarKategori:object[], daftarPemasok:object[], daftarSatuan:object[], tokoId:number}, pesan?:string}>} */
            pratinjauExcel: (payload) => ipcRenderer.invoke('pos:produk-pratinjau-excel', payload),
            /** Langkah 1/2 "Unggah Excel" LOKAL (gap-closure -- parsing 100% di klien, TIDAK butuh koneksi, TIDAK tergantung deploy server). Jalur UTAMA sekarang -- lihat JavaDoc handler di main.js. @param {{file_base64:string}} payload @return {Promise<{ok:boolean, data?:{baris:object[], daftarKategori:object[], daftarPemasok:object[], daftarSatuan:object[], kolomTidakDitemukan:string[]}, pesan?:string}>} */
            pratinjauExcelLokal: (payload) => ipcRenderer.invoke('pos:produk-pratinjau-excel-lokal', payload),
            /** Langkah 2/2 "Unggah Excel" -- simpan sungguhan baris hasil review/edit user. OFFLINE-FIRST: batch SELALU tersimpan di SQLite lokal dulu (lihat {@code idLokal} pada balikan) sebelum dicoba kirim -- kalau offline, balikan {@code offline:true} dan batch dikirim otomatis di latar begitu koneksi pulih (lihat {@link #onImportKatalogTersinkron}). @param {{baris:object[]}} payload @return {Promise<{ok:boolean, data?:{dibuat:number,diperbarui:number,dilewati:number,kategoriBaru:number,pemasokBaru:number,satuanBaru:number,stokDiopname:number,error:string[],baris:Array<{no:number,kode:string,nama:string,status:string,pesan:string,teknis?:string,produkBaru?:boolean,kategoriBaru?:boolean,pemasokBaru?:boolean,satuanBaru?:boolean,stokLama?:number,stokBaru?:number,selisih?:number,aksiStok?:string}>}, offline?:boolean, idLokal:string, pesan?:string}>} */
            komitExcel: (payload) => ipcRenderer.invoke('pos:produk-komit-excel', payload),
            /** Tombol "Download Excel" di layar review -- ekspor dari baris yg SEDANG diedit, bukan query ulang DB. @param {{baris:object[]}} payload @return {Promise<{ok:boolean, data?:{fileBase64:string, namaFile:string, total:number}, pesan?:string}>} */
            eksporGridExcel: (payload) => ipcRenderer.invoke('pos:produk-grid-ekspor-excel', payload),
            /** Tombol "Hitung Ulang Stok" -- recompute stok semua produk toko dari rekam jejak pengadaan/opname/penjualan, SEKALIGUS memperbaiki kolom StokOpname.selisih lama yg kadung salah. @return {Promise<{ok:boolean, data?:{produkDiproses:number, selisihDiperbaiki:number}, offline?:boolean, pesan?:string}>} */
            hitungUlangStok: () => ipcRenderer.invoke('pos:stok-hitung-ulang'),
            /** @param {string} id idLokal batch impor katalog @return {Promise<{ok:boolean, data?:object, pesan?:string}>} status/hasil TERKINI dari SQLite lokal -- dipakai memuat ulang laporan hasil impor kapan saja. */
            importStatus: (id) => ipcRenderer.invoke('pos:produk-impor-status', id),
            /** Dipanggil proses utama begitu SATU batch impor katalog yg tadinya offline berhasil tersinkron di latar (lihat main.js sinkronkanImporKatalogPending) -- dipakai layar Produk menyegarkan laporan/daftar TANPA supervisor perlu klik ulang apa pun. @param {(payload:{id:string, hasil:object})=>void} callback */
            onImportKatalogTersinkron: (callback) => ipcRenderer.on('pos:import-katalog-tersinkron', (event, payload) => callback(payload)),
            /** Simpan laporan hasil impor LANGSUNG ke folder Downloads, TANPA dialog "Simpan Sebagai" -- dipanggil OTOMATIS begitu proses impor selesai (sinkron/offline/gagal), tak perlu supervisor klik apa pun. @param {{namaFile:string, isiTeks:string}} payload @return {Promise<{ok:boolean, path?:string, pesan?:string}>} */
            simpanLaporanOtomatis: (payload) => ipcRenderer.invoke('pos:simpan-laporan-otomatis', payload),
            /** Fitur "Bersihkan Produk Duplikat" (pratinjau, murni baca) -- gerbang supervisor/admin DITEGAKKAN server-side. @param {{jenis:string}} payload jenis: kode|barcode|nama|kode_barcode. @return {Promise<{ok:boolean, data?:{grup:Array,totalGrup:number,totalProdukTerlibat:number}, pesan?:string}>} */
            duplikatCari: (payload) => ipcRenderer.invoke('pos:produk-duplikat-cari', payload),
            /** Fitur "Bersihkan Produk Duplikat" (eksekusi -- recompute ulang di server, TIDAK memakai hasil pratinjau klien). @param {{jenis:string}} payload @return {Promise<{ok:boolean, data?:{grupDiproses:number,produkDihapus:number,grupDigabungTransaksi:number}, pesan?:string}>} */
            duplikatHapus: (payload) => ipcRenderer.invoke('pos:produk-duplikat-hapus', payload),
            /** Fitur "Hapus Non-Aktif Tak Terpakai" -- gerbang supervisor/admin DITEGAKKAN server-side. Aksi PERMANEN, hanya menghapus produk Non-Aktif yang tak pernah dipakai di transaksi/resep apa pun. @return {Promise<{ok:boolean, data?:{dihapus:number,dipertahankan:number}, pesan?:string}>} */
            hapusNonaktifTakTerpakai: () => ipcRenderer.invoke('pos:produk-hapus-nonaktif-tak-terpakai', {}),
            /** Fitur "Hapus Produk Tak Ada Transaksi" -- gerbang supervisor/admin DITEGAKKAN server-side. Aksi PERMANEN, mencakup SEMUA produk (aktif/non-aktif) toko ini yang belum pernah ditransaksikan; stok_opname produk yang ikut terhapus juga dihapus (cascade). @return {Promise<{ok:boolean, data?:{dihapus:number,dipertahankan:number,stokOpnameDihapus:number}, pesan?:string}>} */
            hapusTakAdaTransaksi: () => ipcRenderer.invoke('pos:produk-hapus-tak-ada-transaksi', {}),
            /** Progress bar "Simpan" (gap-closure) -- dipanggil proses utama tiap satu batch baris selesai dikirim ke server (lihat JavaDoc pos:produk-komit-excel di main.js). @param {(payload:{diproses:number, total:number})=>void} callback */
            onImportProgress: (callback) => ipcRenderer.on('pos:import-katalog-progress', (event, payload) => callback(payload))
        },
        /** @param {{id_member:number}} payload saldo REAL-TIME (bukan hasil cari_member yg bisa basi) -- panggil ulang tiap kali sebelum checkout. @return {Promise<{ok:boolean, data?:{data:number}, offline?:boolean, pesan?:string}>} */
        saldoMember: (payload) => ipcRenderer.invoke('pos:saldo-member', payload),

        /** Cetak struk LANGSUNG ke printer default (tanpa dialog pilih printer) -- dipakai struk.js. @param {{html:string}} payload @return {Promise<{ok:boolean, pesan?:string}>} */
        cetakStrukDiam: (payload) => ipcRenderer.invoke('pos:cetak-struk-diam', payload),

        /** Cetak struk DENGAN pratinjau + dialog "Print" (kebalikan cetakStrukDiam) -- dipakai struk.js. @param {{html:string}} payload @return {Promise<{ok:boolean, pesan?:string}>} */
        cetakStrukPreview: (payload) => ipcRenderer.invoke('pos:cetak-struk-preview', payload),

        /** Buka Laci Kasir (cash drawer) via printer struk default -- lihat JavaDoc handler main.js. @param {{pinAlternatif?:boolean}} [payload] @return {Promise<{ok:boolean, pesan?:string}>} */
        bukaLaciKasir: (payload) => ipcRenderer.invoke('pos:buka-laci-kasir', payload || {}),

        /**
         * Fitur "Sesi Kasir" (Buka/Tutup Kas) -- lihat JavaDoc handler {@code pos:sesi-kas-*} di
         * main.js. {@code status} dipanggil saat pos.html dimuat; {@code buka}/{@code tutup} dipanggil
         * dari form yang muncul saat kasir klik chip status.
         */
        sesiKas: {
            /** @param {{id_toko?:number|string}} payload @return {Promise<{ok:boolean, data?:{terbuka:boolean, waktuBuka?:string, modalAwal?:number, totalTunai?:number, totalNonTunai?:number, kasSaatIni?:number}, offline?:boolean, pesan?:string}>} */
            status: (payload) => ipcRenderer.invoke('pos:sesi-kas-status', payload),
            /** @param {{id_toko?:number|string, modal_awal:number, keterangan?:string}} payload */
            buka: (payload) => ipcRenderer.invoke('pos:sesi-kas-buka', payload),
            /** @param {{id_toko?:number|string, uang_fisik:number, keterangan?:string}} payload @return {Promise<{ok:boolean, data?:{selisih:number}, ...}>} */
            tutup: (payload) => ipcRenderer.invoke('pos:sesi-kas-tutup', payload)
        },

        /** @param {{id_member:number|string, nominal:number, keterangan?:string}} payload -- lihat JavaDoc handler {@code pos:topup-saldo} di main.js. @return {Promise<{ok:boolean, data?:{id:number}, offline?:boolean, pesan?:string}>} */
        topupSaldo: (payload) => ipcRenderer.invoke('pos:topup-saldo', payload),

        /**
         * Menu "Log Error" (Desktop, log-error.html) -- lihat JavaDoc tabel {@code error_log} di
         * local-db.js dan handler {@code pos:error-log-*} di main.js. {@code catat} dipakai
         * error-capture.js (dimuat di SETIAP halaman) utk melaporkan exception JS yg tak tertangkap
         * di jendela manapun, plus pemanggilan manual di pos-renderer.js utk anomali sesi kas.
         */
        errorLog: {
            /** @param {{sumber?:string, tingkat?:string, keyword?:string, dariTanggal?:string, sampaiTanggal?:string, limit?:number, offset?:number}} filter @return {Promise<{ok:boolean, data?:Array<object>, total?:number, pesan?:string}>} */
            list: (filter) => ipcRenderer.invoke('pos:error-log-list', filter),
            /** @param {{sumber:string, tingkat?:string, pesan:string, detail?:string, layar?:string}} entry @return {Promise<{ok:boolean}>} */
            catat: (entry) => ipcRenderer.invoke('pos:error-log-catat', entry),
            /** @param {{id:number}} payload @return {Promise<{ok:boolean, pesan?:string}>} */
            hapus: (payload) => ipcRenderer.invoke('pos:error-log-hapus', payload),
            /** @return {Promise<{ok:boolean, pesan?:string}>} */
            bersihkan: () => ipcRenderer.invoke('pos:error-log-bersihkan')
        },

        /** @param {{id_toko?:number|string, sejak_id?:number}} payload -- lihat JavaDoc handler {@code pos:pesanan-online-baru} di main.js. @return {Promise<{ok:boolean, data?:{maksId:number, pesanan:Array<{id,kode,waktu,pembeli,barang}>}, offline?:boolean, pesan?:string}>} */
        pesananOnlineBaru: (payload) => ipcRenderer.invoke('pos:pesanan-online-baru', payload),

        /**
         * Layar Pelanggan LOKAL (customer.html, jendela monitor kedua) -- dipakai Kasir mem-mirror
         * keranjang & meminta verifikasi PIN saat checkout pakai saldo member. Lihat JavaDoc handler
         * {@code pos:layar-pelanggan-*} di main.js utk kontrak relay lengkapnya.
         */
        layarPelanggan: {
            /** @return {Promise<{ok:boolean, adaMonitorKedua:boolean}>} */
            buka: () => ipcRenderer.invoke('pos:layar-pelanggan-buka'),
            /** Tutup jendela Layar Pelanggan bila sedang terbuka. */
            tutup: () => ipcRenderer.send('pos:layar-pelanggan-tutup'),
            /** @return {Promise<{terbuka:boolean, adaMonitorKedua:boolean}>} */
            status: () => ipcRenderer.invoke('pos:layar-pelanggan-status'),
            /** Kirim pesan satu-arah ke Layar Pelanggan (mis. {tipe:'keranjang',...}/{tipe:'minta_pin',...}/{tipe:'sukses',...}/{tipe:'reset'}). @param {object} payload */
            kirim: (payload) => ipcRenderer.send('pos:layar-pelanggan-kirim', payload),
            /** Daftarkan callback utk pesan BALIK dari Layar Pelanggan (mis. {tipe:'pin_hasil', ok, batal?}). @param {(payload:object)=>void} callback */
            onDariPelanggan: (callback) => ipcRenderer.on('pos:layar-pelanggan-dari-pelanggan', (event, payload) => callback(payload))
        }
    }
});
