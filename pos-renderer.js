/**
 * pos-renderer.js -- Logika layar Kasir (POS) LOKAL (pos.html). Berjalan di konteks renderer
 * terisolasi; satu-satunya jembatan ke proses utama adalah window.electronAPI (preload.js -- dipakai
 * BERSAMA dgn jendela yg sama saat menampilkan aplikasi web lengkap via menu "Buka Aplikasi Lengkap").
 *
 * TIDAK ADA fetch()/XHR ke server di sini SAMA SEKALI -- seluruh komunikasi jaringan (termasuk
 * fallback ke cache SQLite saat offline) dilakukan proses utama lewat window.electronAPI.posAPI.*
 * (lihat JavaDoc handler 'pos:*' di main.js). Berkas ini murni tampilan + state keranjang.
 *
 * CAKUPAN SAAT INI: katalog produk+kategori+gambar (dgn badge stok realtime), keranjang, checkout
 * tunai/non-tunai, pencarian member+cek saldo langsung+bayar pakai saldo (dgn gerbang PIN via Layar
 * Pelanggan bila member wajib-PIN, lihat blok "Member & Layar Pelanggan" di bawah), Sesi Kasir
 * (Buka/Tutup Kas, lihat blok "Fitur Sesi Kasir" di bawah), aturan diskon otomatis (lihat blok
 * evaluasiDiskonKeranjang), tahan/simpan keranjang (lihat elBtnTahanKeranjang), cetak struk dgn
 * pratinjau (lihat window.Struk.cetakDenganPreview di struk.js) -- paritas penuh dgn menu "Buka
 * Aplikasi Lengkap".
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elBannerModeOffline = document.getElementById('bannerModeOffline');

    /** true bila sesi ini masuk lewat "Masuk Mode Offline" (lihat JavaDoc login:coba-offline di main.js) -- diperiksa SEKALI saat load, tak berubah selama jendela ini terbuka. */
    let sedangModeOffline = false;
    const elPendingBadge = document.getElementById('pendingBadge');
    const elBtnSync = document.getElementById('btnSync');
    const elCariProduk = document.getElementById('cariProduk');
    const elKategoriRow = document.getElementById('kategoriRow');
    const elProdukGrid = document.getElementById('produkGrid');
    const elPaginasiProdukKasir = document.getElementById('paginasiProdukKasir');
    const elInfoStrip = document.getElementById('infoStrip');
    const elCartItems = document.getElementById('cartItems');
    const elJumlahItemBadge = document.getElementById('jumlahItemBadge');
    const elRingkasSubtotal = document.getElementById('ringkasSubtotal');
    const elBarisRingkasDiskon = document.getElementById('barisRingkasDiskon');
    const elRingkasDiskon = document.getElementById('ringkasDiskon');
    const elBarisRingkasCashback = document.getElementById('barisRingkasCashback');
    const elRingkasCashback = document.getElementById('ringkasCashback');
    const elLabelPajak = document.getElementById('labelPajak');
    const elRingkasPajak = document.getElementById('ringkasPajak');
    const elRingkasTotal = document.getElementById('ringkasTotal');
    const elBtnPilihMetode = document.getElementById('btnPilihMetode');
    const elMetodeTerpilihLabel = document.getElementById('metodeTerpilihLabel');
    const elInputUangTunai = document.getElementById('inputUangTunai');
    const elKembalianBox = document.getElementById('kembalianBox');
    const elKembalianNilai = document.getElementById('kembalianNilai');
    const elBtnBayar = document.getElementById('btnBayar');
    const elBtnTahanKeranjang = document.getElementById('btnTahanKeranjang');
    const elLayarMuat = document.getElementById('layarMuat');
    const elLayarMuatTeks = document.getElementById('layarMuatTeks');
    const elLayarMuatProgressWrap = document.getElementById('layarMuatProgressWrap');
    const elLayarMuatProgressBar = document.getElementById('layarMuatProgressBar');
    const elLayarMuatProgressTeks = document.getElementById('layarMuatProgressTeks');
    const elToast = document.getElementById('toast');

    const elBtnBukaLaci = document.getElementById('btnBukaLaci');
    const elBtnBukaLaciAlt = document.getElementById('btnBukaLaciAlt');
    const elBtnLayarPelanggan = document.getElementById('btnLayarPelanggan');
    const elBtnUpdateSistem = document.getElementById('btnUpdateSistem');
    const elOverlayUpdate = document.getElementById('overlayUpdate');
    const elBtnTutupUpdate = document.getElementById('btnTutupUpdate');
    const elUpdateVersiSaatIni = document.getElementById('updateVersiSaatIni');
    const elUpdateStatusArea = document.getElementById('updateStatusArea');
    const elUpdateCatatanRilis = document.getElementById('updateCatatanRilis');
    const elUpdateProgressWrap = document.getElementById('updateProgressWrap');
    const elUpdateProgressBar = document.getElementById('updateProgressBar');
    const elUpdateProgressTeks = document.getElementById('updateProgressTeks');
    const elBtnUpdateAksi = document.getElementById('btnUpdateAksi');
    const elOverlayTawaranUpdate = document.getElementById('overlayTawaranUpdate');
    const elBtnTutupTawaranUpdate = document.getElementById('btnTutupTawaranUpdate');
    const elTawaranUpdateTeks = document.getElementById('tawaranUpdateTeks');
    const elChkUpdateOtomatis = document.getElementById('chkUpdateOtomatis');
    const elBtnTawaranNanti = document.getElementById('btnTawaranNanti');
    const elBtnTawaranUpdateSekarang = document.getElementById('btnTawaranUpdateSekarang');
    const elOverlayUpdateRestart = document.getElementById('overlayUpdateRestart');
    const elBtnTutupUpdateRestart = document.getElementById('btnTutupUpdateRestart');
    const elUpdateRestartTeks = document.getElementById('updateRestartTeks');
    const elBtnRestartNanti = document.getElementById('btnRestartNanti');
    const elBtnRestartSekarang = document.getElementById('btnRestartSekarang');

    const elBtnSesiKas = document.getElementById('btnSesiKas');
    const elOverlaySesiKas = document.getElementById('overlaySesiKas');
    const elBtnTutupSesiKas = document.getElementById('btnTutupSesiKas');
    const elIsiSesiKas = document.getElementById('isiSesiKas');
    const elKasTertutupOverlay = document.getElementById('kasTertutupOverlay');
    const elBtnBukaKasDariOverlay = document.getElementById('btnBukaKasDariOverlay');
    const elBtnTutupOverlayKasDarurat = document.getElementById('btnTutupOverlayKasDarurat');
    const elBannerDaruratKas = document.getElementById('bannerDaruratKas');

    const elOverlayPinKasir = document.getElementById('overlayPinKasir');
    const elBtnBatalPinKasir = document.getElementById('btnBatalPinKasir');
    const elKeteranganPinKasir = document.getElementById('keteranganPinKasir');
    const elInputPinKasir = document.getElementById('inputPinKasir');
    const elErrorPinKasir = document.getElementById('errorPinKasir');
    const elBtnSubmitPinKasir = document.getElementById('btnSubmitPinKasir');

    const elBtnAkunSaya = document.getElementById('btnAkunSaya');
    const elOverlayAkunSaya = document.getElementById('overlayAkunSaya');
    const elBtnTutupAkunSaya = document.getElementById('btnTutupAkunSaya');
    const elIsiAkunSaya = document.getElementById('isiAkunSaya');

    const elBtnTopUpTopbar = document.getElementById('btnTopUpTopbar');
    const elOverlayTopUpMandiri = document.getElementById('overlayTopUpMandiri');
    const elBtnTutupTopUpMandiri = document.getElementById('btnTutupTopUpMandiri');
    const elIsiTopUpMandiri = document.getElementById('isiTopUpMandiri');

    const elOverlayPesananBaru = document.getElementById('overlayPesananBaru');
    const elBtnTutupPesananBaru = document.getElementById('btnTutupPesananBaru');
    const elBtnLihatPesananBaru = document.getElementById('btnLihatPesananBaru');
    const elIsiPesananBaru = document.getElementById('isiPesananBaru');

    const elBtnBukaPickerMember = document.getElementById('btnBukaPickerMember');
    const elOverlayPickerMember = document.getElementById('overlayPickerMember');
    const elBtnTutupPickerMember = document.getElementById('btnTutupPickerMember');
    const elCariMemberModal = document.getElementById('cariMemberModal');
    const elBtnSinkronAnggota = document.getElementById('btnSinkronAnggota');
    const elPickerSyncProgress = document.getElementById('pickerSyncProgress');
    const elPickerSyncProgressBar = document.getElementById('pickerSyncProgressBar');
    const elPickerSyncProgressTeks = document.getElementById('pickerSyncProgressTeks');
    const elPickerInfoCache = document.getElementById('pickerInfoCache');
    const elPickerDaftarMember = document.getElementById('pickerDaftarMember');
    const elMemberChip = document.getElementById('memberChip');
    const elMemberChipTeks = document.getElementById('memberChipTeks');
    const elBtnHapusMember = document.getElementById('btnHapusMember');
    const elMemberChipSaldo = document.getElementById('memberChipSaldo');
    const elBtnTopupMember = document.getElementById('btnTopupMember');
    const elFormTopupMemberWrap = document.getElementById('formTopupMemberWrap');
    const elInputNominalTopupMember = document.getElementById('inputNominalTopupMember');
    const elInputKetTopupMember = document.getElementById('inputKetTopupMember');
    const elBtnSubmitTopupMember = document.getElementById('btnSubmitTopupMember');

    const elOverlayMetode = document.getElementById('overlayMetode');
    const elGridMetode = document.getElementById('gridMetode');
    const elBtnTutupMetode = document.getElementById('btnTutupMetode');

    const elLayarSukses = document.getElementById('layarSukses');
    const elIkonSukses = document.getElementById('ikonSukses');
    const elJudulSukses = document.getElementById('judulSukses');
    const elSubSukses = document.getElementById('subSukses');
    const elRincianMetode = document.getElementById('rincianMetode');
    const elRincianDiterima = document.getElementById('rincianDiterima');
    const elRincianKembalian = document.getElementById('rincianKembalian');
    const elRincianTotal = document.getElementById('rincianTotal');
    const elBtnTransaksiBaru = document.getElementById('btnTransaksiBaru');
    const elBtnCetakStruk = document.getElementById('btnCetakStruk');
    const elBtnBukaLaciSukses = document.getElementById('btnBukaLaciSukses');

    /** Data struk transaksi TERAKHIR yg barusan dibayar (utk tombol "Cetak Struk" di modal sukses) -- lihat {@link #tampilkanLayarSukses}/{@link #struk.js}. */
    let strukTerakhir = null;

    /** @type {Array<object>} seluruh produk (tak difilter) hasil katalog terakhir. */
    let semuaProduk = [];
    /** @type {Array<object>} */
    let semuaKategori = [];
    /** @type {Array<object>} cara bayar aktif dari konfigurasi. */
    let semuaCaraBayar = [];
    let kategoriAktifId = null; // null = "Semua"
    // Gap-closure "paging 25/hal spy katalog sangat besar tak dimuat sekaligus" -- direset ke halaman
    // 1 tiap kali filter kategori/pencarian berubah (lihat pemanggil renderProduk terkait di bawah).
    const stateProdukKasir = { page: 1, pageSize: 25 };
    let pajakPersen = 0;
    let tokoId = null;
    let tokoNama = '';
    /** Ucapan penutup struk & Layar Pelanggan, disunting per-toko lewat menu Konfigurasi (lihat server {@code Toko.getPesanTerimaKasih}); teks ini SUDAH datang dgn fallback formal default dari server, jadi TIDAK perlu default kedua di sini. */
    let pesanTerimaKasih = '';
    let userId = '';
    /** @type {{id:string, nama:string, manual:boolean}|null} metode pembayaran yang sedang dipilih di keranjang. */
    let caraBayarTerpilih = null;

    /** @type {{terbuka:boolean, waktuBuka?:string, modalAwal?:number, totalTunai?:number, totalNonTunai?:number, kasSaatIni?:number}} status Sesi Kasir TERAKHIR diketahui -- lihat muatStatusSesiKas(). */
    let sesiKasInfo = { terbuka: false };
    /**
     * @type {boolean} Override DARURAT -- kasir memilih melewati gerbang wajib-buka-kas lewat tombol
     * "Tutup" di overlay (mis. server belum bisa dihubungi utk benar-benar membuka sesi kas resmi).
     * SENGAJA hanya di memori (reset tiap aplikasi dibuka ulang) -- bukan pengaturan permanen.
     * Transaksi selama override AKTIF tidak tercatat dalam sesi kas resmi manapun (tidak ikut
     * dihitung saat "Tutup Kas" nanti) -- lihat banner peringatan permanen `elBannerDaruratKas`.
     */
    let overrideDaruratTanpaSesiKas = false;
    /** @type {boolean} hak kasir utk fitur "Top Up Saldo lewat POS" -- dari konfigurasi(), murni sembunyikan tombol; gerbang sebenarnya di server. */
    let bolehTopup = false;
    /** true bila akun yg sedang login tidak terikat Pedagang/toko (admin/manager) -- lihat JavaDoc KantinHelper.tambahAkunKasir. */
    let isAdminAkun = false;
    /**
     * Fitur "Multi-Toko" -- lihat JavaDoc server {@code KantinHelper.daftarTokoBolehDiakses}.
     * `daftarTokoSaya.length <= 1` (kasus paling umum) berarti TIDAK ADA yang berubah dari perilaku
     * lama sama sekali -- `tokoId` di atas tetap dipakai apa adanya, kombo TIDAK pernah dirender.
     * `daftarTokoSaya.length > 1` mewajibkan kasir memilih lewat kombo di overlay Sesi Kas SEBELUM
     * "Buka Kas" bisa ditekan (lihat renderIsiSesiKas/submitBukaKas).
     * @type {Array<{id:number, nama:string}>}
     */
    let daftarTokoSaya = [];
    /** @type {number|null} id tertinggi pesanan online TERAKHIR diketahui -- null = baseline belum direkam (lihat mulaiPollingPesananBaru()). */
    let sejakIdPesananBaru = null;

    /** @type {Array<{id:number, kode:string, nama:string, harga:number, jumlah:number}>} */
    let cart = [];
    /** @type {number|null} id DraftPembelianAnggotaKoperasi bila keranjang ini hasil "Muat" dari layar Pesanan (Keranjang Tertahan) -- dikirim ULANG ke payload bayar/draft_bayar spy menuntaskan/menahan draft yg SAMA, bukan bikin baris duplikat (lihat JavaDoc lanjutkanKeranjangTertahan). */
    let draftAktifId = null;

    /** @type {{id:number, nama:string, kodeIdentitas:string, wajibPin:boolean, minSaldo:number}|null} member terpilih -- wajib diisi utk bayar pakai metode "saldo" (manual===false). */
    let memberTerpilih = null;
    /** @type {((hasil:{ok:boolean, batal?:boolean, timeout?:boolean})=>void)|null} resolver Promise yg menunggu hasil PIN dari Layar Pelanggan -- lihat gerbangSaldoDanPin(). */
    let pinPendingResolve = null;
    let pinPendingTimeoutId = null;

    function formatRupiah(n) {
        const angka = Math.round(Number(n) || 0);
        return 'Rp ' + angka.toLocaleString('id-ID');
    }

    function formatWaktuServer(d) {
        const pad = (x) => String(x).padStart(2, '0');
        return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' '
            + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function buatKodeUnik() {
        return 'POSLOKAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    /** Palet warna avatar produk/kategori -- dipilih deterministik dari nama supaya produk yg sama selalu dapat warna sama antar render. */
    const PALET_AVATAR = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#dc2626'];
    function warnaDariNama(nama) {
        const teks = String(nama || '?');
        let hash = 0;
        for (let i = 0; i < teks.length; i++) { hash = (hash * 31 + teks.charCodeAt(i)) | 0; }
        return PALET_AVATAR[Math.abs(hash) % PALET_AVATAR.length];
    }
    function inisialDariNama(nama) {
        const teks = String(nama || '?').trim();
        return teks ? teks.charAt(0).toUpperCase() : '?';
    }

    /**
     * Menempelkan {@code <img>} produk ke atas elemen avatar warna+inisial (dipanggil dari
     * {@link #renderProduk}/{@link #renderCart}) -- avatar warna TETAP ada di belakangnya sbg
     * fallback otomatis: kalau gambar gagal dimuat (mis. path file:// cache lokal ternyata belum
     * pernah berhasil diunduh sama sekali krn belum pernah online), {@code onerror} menghapus elemen
     * {@code <img>} itu sendiri sehingga avatar warna di baliknya langsung terlihat -- TANPA perlu
     * logic try/catch tambahan, murni memanfaatkan bahwa {@code <img>} gagal cuma menyembunyikan
     * dirinya sendiri (posisinya {@code absolute}, lihat CSS {@code .avatar img}).
     * @param {HTMLElement} elAvatar
     * @param {string|null|undefined} url
     */
    function lampirkanGambarKeAvatar(elAvatar, url) {
        if (!url) return;
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.addEventListener('error', () => { img.remove(); });
        elAvatar.appendChild(img);
    }

    /** Menebak ikon emoji dari nama kategori/metode bayar berdasar kata kunci -- server tidak mengirim ikon, ini murni kosmetik sisi klien. */
    function tebakIkonKategori(nama) {
        const n = String(nama || '').toLowerCase();
        if (n.indexOf('minum') >= 0 || n.indexOf('beverage') >= 0 || n.indexOf('kopi') >= 0) return '☕';
        if (n.indexOf('makan') >= 0 || n.indexOf('food') >= 0) return '\u{1F35B}';
        if (n.indexOf('snack') >= 0 || n.indexOf('cemilan') >= 0) return '\u{1F36A}';
        if (n.indexOf('roti') >= 0 || n.indexOf('kue') >= 0 || n.indexOf('bread') >= 0) return '\u{1F35E}';
        if (n.indexOf('atk') >= 0 || n.indexOf('alat') >= 0) return '\u{1F4CE}';
        if (n.indexOf('baby') >= 0 || n.indexOf('bayi') >= 0) return '\u{1F37C}';
        return '\u{1F3F7}️';
    }
    function tebakIkonMetode(nama) {
        const n = String(nama || '').toLowerCase();
        if (n.indexOf('tunai') >= 0 || n.indexOf('cash') >= 0) return '\u{1F4B5}';
        if (n.indexOf('qris') >= 0 || n.indexOf('qr') >= 0) return '\u{1F4F1}';
        if (n.indexOf('kartu') >= 0 || n.indexOf('debit') >= 0 || n.indexOf('kredit') >= 0) return '\u{1F4B3}';
        if (n.indexOf('transfer') >= 0 || n.indexOf('bank') >= 0) return '\u{1F3E6}';
        if (n.indexOf('saldo') >= 0 || n.indexOf('member') >= 0) return '\u{1F3AB}';
        return '\u{1F4B0}';
    }

    // ==== Member & Layar Pelanggan ====
    // Mengadaptasi alur "bayar pakai saldo member + gerbang PIN" yang sudah ada di versi web
    // (_pos.jsp + layar_pelanggan.jsp) ke arsitektur token/IPC aplikasi lokal ini. Bedanya dgn versi
    // web: PIN tidak lagi diverifikasi via fetch() langsung dari jendela Layar Pelanggan (jendela itu
    // tidak punya token) -- verifikasi tetap lewat proses utama, lihat JavaDoc preload-customer.js.

    // ==== Modal "Pilih Member" (picker offline-aware, foto thumbnail) ====
    // Menggantikan dropdown pencarian inline lama -- pilihMember(m) di bawah TIDAK berubah sama
    // sekali (kontrak dgn alur checkout/gerbang saldo tetap identik), cuma titik pemicunya sekarang
    // modal, bukan dropdown di bawah kotak teks. window.electronAPI.posAPI.cariMember SUDAH
    // menangani fallback ke cache offline sendiri di sisi main.js (lihat JavaDoc handler
    // 'pos:cari-member') -- kode di sini tak perlu tahu online/offline, cukup pakai `dariCache` pada
    // hasil utk memberi tahu kasir.
    let cariMemberModalTimer = null;
    /** @type {NodeJS.Timeout|null} penyegar berkala "Transaksi Terbaru" SELAMA modal picker terbuka DAN kotak cari masih kosong -- lihat JavaDoc {@link #muatTransaksiTerbaruPickerMember}. */
    let transaksiTerbaruPickerTimer = null;

    elBtnBukaPickerMember.addEventListener('click', () => {
        elOverlayPickerMember.className = 'overlay tampil';
        elCariMemberModal.value = '';
        elCariMemberModal.focus();
        muatTransaksiTerbaruPickerMember();
        segarkanInfoCachePickerMember();
        clearInterval(transaksiTerbaruPickerTimer);
        transaksiTerbaruPickerTimer = setInterval(() => {
            if (!elCariMemberModal.value.trim()) muatTransaksiTerbaruPickerMember();
        }, 20000);
    });
    function tutupPickerMember() {
        elOverlayPickerMember.className = 'overlay';
        clearInterval(transaksiTerbaruPickerTimer);
        transaksiTerbaruPickerTimer = null;
    }
    elBtnTutupPickerMember.addEventListener('click', tutupPickerMember);
    elOverlayPickerMember.addEventListener('click', (event) => { if (event.target === elOverlayPickerMember) tutupPickerMember(); });

    elCariMemberModal.addEventListener('input', () => {
        clearTimeout(cariMemberModalTimer);
        const keyword = elCariMemberModal.value.trim();
        if (!keyword) { muatTransaksiTerbaruPickerMember(); return; }
        cariMemberModalTimer = setTimeout(() => cariMemberDiModal(keyword), 350);
    });

    /**
     * Fitur "anggota yang baru saja bertransaksi" -- jalan pintas "pilih pelanggan tadi" tanpa
     * mengetik, ditampilkan sbg pengganti layar kosong saat kotak cari picker member masih kosong.
     * Dipanggil saat modal dibuka, saat kotak cari dikosongkan lagi, DAN berkala tiap 20 detik selama
     * modal terbuka + kotak cari tetap kosong ("secara langsung" -- daftar ini wajar berubah tiap ada
     * transaksi baru, bukan snapshot beku sejak modal dibuka). Gagal (offline/timeout) cukup jatuh ke
     * pesan kosong biasa -- fitur pelengkap, TIDAK PERNAH menampilkan error ke kasir.
     */
    async function muatTransaksiTerbaruPickerMember() {
        try {
            const hasil = await window.electronAPI.posAPI.anggotaTransaksiTerbaru({ limit: 10 });
            const daftar = (hasil.data && hasil.data.data) || [];
            renderDaftarPickerMember(daftar, false, 'Ketik nama/kode member utk mencari.', daftar.length ? 'Transaksi Terbaru' : null);
        } catch (e) {
            renderDaftarPickerMember([], false, 'Ketik nama/kode member utk mencari.');
        }
    }

    async function segarkanInfoCachePickerMember() {
        try {
            const hasil = await window.electronAPI.posAPI.anggotaCacheCari({ keyword: '', limit: 1 });
            elPickerInfoCache.textContent = hasil && hasil.ok
                ? (hasil.totalCache || 0) + ' member tersimpan offline di perangkat ini.'
                : '';
        } catch (e) { elPickerInfoCache.textContent = ''; }
    }

    /**
     * Daftar hasil Pilih Member yg SEDANG tampil, urutan sama persis dgn kartu yg dirender -- dipakai
     * listener Ctrl+angka di bawah utk merujuk kartu ke-N tanpa query ulang.
     * @type {object[]}
     */
    let daftarHasilPickerMemberTerkini = [];

    function pilihDariPickerMember(m) {
        pilihMember(m);
        elOverlayPickerMember.className = 'overlay';
    }

    async function cariMemberDiModal(keyword) {
        let daftar = [];
        let pesanKosong = 'Tidak ada member yang cocok.';
        let dariCache = false;
        try {
            const hasil = await window.electronAPI.posAPI.cariMember({ keyword });
            if (hasil.ok) { daftar = (hasil.data && hasil.data.member) || []; dariCache = !!hasil.dariCache; }
            else pesanKosong = hasil.pesan || 'Gagal mencari member.';
        } catch (e) {
            pesanKosong = 'Gagal mencari member: ' + (e && e.message ? e.message : e);
        }
        renderDaftarPickerMember(daftar, dariCache, pesanKosong);
    }

    function avatarPickerHtml(m) {
        if (m.fotoPathLokal) return '<img src="' + m.fotoPathLokal + '" alt="">';
        return (m.nama || '?').trim().charAt(0).toUpperCase();
    }

    /** @param {string} [judul] label kecil di atas daftar (mis. "Transaksi Terbaru") -- kosongkan utk hasil pencarian biasa (tanpa label). */
    function renderDaftarPickerMember(daftar, dariCache, pesanKosong, judul) {
        elPickerDaftarMember.innerHTML = '';
        daftarHasilPickerMemberTerkini = daftar;
        if (daftar.length === 0) {
            const kosong = document.createElement('div');
            kosong.className = 'picker-kosong';
            kosong.textContent = pesanKosong || 'Ketik nama/kode member utk mencari.';
            elPickerDaftarMember.appendChild(kosong);
            return;
        }
        if (judul) {
            const label = document.createElement('div');
            label.className = 'picker-label-grup';
            label.textContent = judul;
            elPickerDaftarMember.appendChild(label);
        }
        if (dariCache) {
            const info = document.createElement('div');
            info.className = 'picker-kosong';
            info.style.padding = '4px 8px 10px';
            info.style.color = 'var(--warning)';
            info.textContent = '⚠️ Offline -- hasil dari data tersimpan (saldo tidak bisa diperiksa sampai online kembali).';
            elPickerDaftarMember.appendChild(info);
        }
        daftar.forEach((m, idx) => {
            // Ctrl+angka -- lihat listener keydown elCariMemberModal di bawah, sama persis dgn pola
            // nomor-hasil dropdown cari produk.
            const nomorPintasan = idx < 9 ? String(idx + 1) : (idx === 9 ? '0' : '');
            const kartu = document.createElement('div');
            kartu.className = 'picker-kartu-member';
            kartu.innerHTML = '<div class="nomor-hasil"></div><div class="avatar"></div><div class="info"><div class="nama"></div><div class="sub"></div></div>';
            kartu.querySelector('.nomor-hasil').textContent = nomorPintasan;
            kartu.querySelector('.avatar').innerHTML = avatarPickerHtml(m);
            kartu.querySelector('.nama').textContent = m.nama;
            kartu.querySelector('.sub').textContent = m.kodeIdentitas || '-';
            if (m.wajibPin) {
                const badge = document.createElement('span');
                badge.className = 'badge-pin';
                badge.textContent = '\u{1F512} PIN';
                kartu.appendChild(badge);
            }
            // Pola sama dgn dropdown cari produk (lihat JavaDoc mousedown baris-hasil di atas) --
            // mousedown+preventDefault supaya klik tetap konsisten walau kartu ini {@code <div>} (bukan
            // <button>, jadi risiko rebutan fokusnya lebih kecil, tapi disamakan utk keseragaman).
            kartu.addEventListener('mousedown', (event) => { event.preventDefault(); pilihDariPickerMember(m); });
            elPickerDaftarMember.appendChild(kartu);
        });
    }

    /**
     * Pintasan Ctrl+angka utk daftar Pilih Member -- pola SAMA PERSIS dgn dropdown cari produk (lihat
     * JavaDoc listener {@code elCariProduk} keydown di atas): Ctrl (bukan angka polos) supaya tidak
     * bentrok dgn mengetik kode member numerik di {@code elCariMemberModal}.
     */
    elCariMemberModal.addEventListener('keydown', (event) => {
        if (!event.ctrlKey) return;
        if (!/^[0-9]$/.test(event.key)) return;
        const idx = event.key === '0' ? 9 : (Number(event.key) - 1);
        const m = daftarHasilPickerMemberTerkini[idx];
        if (!m) return;
        event.preventDefault();
        pilihDariPickerMember(m);
    });

    elBtnSinkronAnggota.addEventListener('click', async () => {
        elBtnSinkronAnggota.disabled = true;
        elPickerSyncProgress.style.display = 'block';
        elPickerSyncProgressBar.style.width = '0%';
        elPickerSyncProgressTeks.textContent = 'Memulai...';
        const hasil = await window.electronAPI.posAPI.anggotaSync.mulai();
        if (!hasil || !hasil.ok) {
            elBtnSinkronAnggota.disabled = false;
            elPickerSyncProgress.style.display = 'none';
            tampilkanToast('error', (hasil && hasil.pesan) || 'Gagal memulai sinkronisasi data anggota.');
        }
        // Bila berhasil DIMULAI, tombol tetap disabled & progress tetap tampil sampai event
        // 'selesai'/'error' diterima lewat onStatus (didaftarkan sekali di bawah) -- proses sebenarnya
        // berjalan async di main.js, respons handle() ini cuma penanda "berhasil dipicu".
    });

    window.electronAPI.posAPI.anggotaSync.onStatus((status) => {
        if (!status) return;
        if (status.tipe === 'data') {
            elPickerSyncProgressBar.style.width = '10%';
            elPickerSyncProgressTeks.textContent = 'Mengambil data anggota... (' + (status.totalSejauhIni || 0) + ' tersinkron)';
        } else if (status.tipe === 'foto') {
            const persen = status.totalFoto > 0 ? Math.round((status.terproses / status.totalFoto) * 90) + 10 : 100;
            elPickerSyncProgressBar.style.width = persen + '%';
            elPickerSyncProgressTeks.textContent = 'Mengunduh foto... ' + (status.terproses || 0) + '/' + (status.totalFoto || 0)
                + ' (' + (status.diperbarui || 0) + ' baru/berubah)';
        } else if (status.tipe === 'selesai') {
            elPickerSyncProgressBar.style.width = '100%';
            elPickerSyncProgressTeks.textContent = 'Selesai -- ' + (status.totalAnggota || 0) + ' anggota, '
                + (status.fotoDiperbarui || 0) + ' foto diperbarui.';
            elBtnSinkronAnggota.disabled = false;
            tampilkanToast('success', 'Data anggota berhasil disinkronkan.');
            segarkanInfoCachePickerMember();
            setTimeout(() => { elPickerSyncProgress.style.display = 'none'; }, 2500);
        } else if (status.tipe === 'error') {
            elPickerSyncProgressTeks.textContent = 'Gagal: ' + (status.pesan || 'kesalahan tak diketahui');
            elBtnSinkronAnggota.disabled = false;
            tampilkanToast('error', 'Sinkronisasi anggota gagal: ' + (status.pesan || ''));
        }
    });

    /**
     * Memilih member -- SEKALIGUS langsung cek saldo terkininya (Fitur "Cek Saldo lewat POS") supaya
     * kasir/pelanggan bisa lihat saldo TANPA harus mulai checkout dulu, bukan cuma saat validasi
     * pembayaran Saldo. Saldo yg tampil di sini murni informasi -- checkout tetap cek ULANG saldo
     * real-time di {@link #gerbangSaldoDanPin} (angka di sini bisa saja sedikit basi kalau member
     * sempat bertransaksi di kasir lain sebelum tombol Bayar ditekan di sini).
     */
    function pilihMember(m) {
        memberTerpilih = m;
        elMemberChipTeks.textContent = m.nama + (m.wajibPin ? ' \u{1F512}' : '');
        elMemberChipSaldo.textContent = 'Memeriksa saldo...';
        elMemberChip.style.display = 'flex';
        elBtnTopupMember.style.display = bolehTopup ? 'inline' : 'none';
        elFormTopupMemberWrap.style.display = 'none';
        siarkanKeranjangKeLayarPelanggan();
        segarkanSaldoMemberTerpilih();
        jadwalkanEvaluasiDiskon();
        return muatCaraBayarUntukMember(m.id);
    }

    /**
     * <h3>Fase 5 -- muat ULANG daftar metode bayar, TERFILTER sesuai jenis-anggota member yg sedang
     * dipilih.</h3>
     *
     * <p>Porting 1:1 {@code _pos.jsp} fungsi {@code loadMetodePembayaranPOS} lewat aksi server BARU
     * {@code cara_bayar_list} (lihat JavaDoc {@code PosApi.prosesCaraBayarList}) -- SEBELUMNYA {@code
     * semuaCaraBayar} hanya dimuat SEKALI saat start (aksi {@code konfigurasi}), tak pernah disaring
     * ulang per member. Dipanggil setiap member dipilih/dihapus.</p>
     */
    async function muatCaraBayarUntukMember(idMember) {
        try {
            const hasil = await window.electronAPI.posAPI.caraBayarList({ id_member: idMember || null });
            if (hasil.ok && hasil.data && Array.isArray(hasil.data.caraBayar)) {
                semuaCaraBayar = hasil.data.caraBayar;
                if (caraBayarTerpilih && !semuaCaraBayar.some((cb) => String(cb.id) === caraBayarTerpilih.id)) {
                    caraBayarTerpilih = null;
                    elMetodeTerpilihLabel.textContent = 'Pilih ›';
                }
                renderGridMetode();
                segarkanKembalianDanTombol();
            }
        } catch (e) { /* abaikan -- gagal filter, tetap pakai daftar cara bayar sebelumnya */ }
    }

    async function segarkanSaldoMemberTerpilih() {
        if (!memberTerpilih) return;
        const idSaatDipanggil = memberTerpilih.id;
        try {
            const hasil = await window.electronAPI.posAPI.saldoMember({ id_member: idSaatDipanggil });
            if (!memberTerpilih || memberTerpilih.id !== idSaatDipanggil) return; // member sudah diganti/dihapus selagi menunggu
            if (hasil.ok) {
                const saldo = Number(hasil.data && hasil.data.data) || 0;
                let teks = 'Saldo: ' + formatRupiah(saldo);
                if (memberTerpilih.minSaldo) teks += ' · min. mengendap ' + formatRupiah(memberTerpilih.minSaldo);
                elMemberChipSaldo.textContent = teks;
            } else {
                elMemberChipSaldo.textContent = hasil.offline ? 'Saldo: tidak bisa diperiksa (offline)' : 'Saldo: gagal diperiksa';
            }
        } catch (e) {
            if (memberTerpilih && memberTerpilih.id === idSaatDipanggil) elMemberChipSaldo.textContent = 'Saldo: gagal diperiksa';
        }
    }

    elBtnHapusMember.addEventListener('click', () => {
        memberTerpilih = null;
        elMemberChip.style.display = 'none';
        elBtnTopupMember.style.display = 'none';
        elFormTopupMemberWrap.style.display = 'none';
        siarkanKeranjangKeLayarPelanggan();
        jadwalkanEvaluasiDiskon();
        muatCaraBayarUntukMember(null);
    });

    elBtnTopupMember.addEventListener('click', () => {
        elFormTopupMemberWrap.style.display = (elFormTopupMemberWrap.style.display === 'none') ? 'block' : 'none';
    });

    elBtnSubmitTopupMember.addEventListener('click', async () => {
        if (!memberTerpilih) return;
        const nominal = parseFloat(elInputNominalTopupMember.value) || 0;
        if (nominal <= 0) {
            tampilkanToast('error', 'Nominal top up harus lebih dari 0.');
            return;
        }
        const keterangan = elInputKetTopupMember.value || '';
        elBtnSubmitTopupMember.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.topupSaldo({ id_member: memberTerpilih.id, nominal: nominal, keterangan: keterangan });
            if (r.ok) {
                elFormTopupMemberWrap.style.display = 'none';
                elInputNominalTopupMember.value = '';
                elInputKetTopupMember.value = '';
                await segarkanSaldoMemberTerpilih();
                tampilkanToast('success', 'Top up berhasil.');
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSubmitTopupMember.disabled = false;
        }
    });

    // ==== Top Up mandiri (tombol topbar) ====
    // BEDA dari top-up inline di atas (yg terikat ke memberTerpilih -- member yg sedang dipilih utk
    // checkout): tombol topbar ini membuka pencarian member SENDIRI, independen dari status keranjang,
    // supaya kasir bisa mengisi saldo pelanggan mana pun kapan saja tanpa harus mulai transaksi dulu
    // (butir 4 spesifikasi "dashboard kasir": tombol Top Up berdiri sendiri, bukan cuma bagian alur bayar).

    /** Member yg sedang dilihat/diisi saldonya di modal Top Up mandiri -- state TERPISAH dari memberTerpilih (checkout). */
    let topUpMandiriMember = null;
    let topUpMandiriTimer = null;

    function renderIsiTopUpMandiri() {
        if (!topUpMandiriMember) {
            elIsiTopUpMandiri.innerHTML =
                '<div class="member-box">' +
                '  <input type="text" id="cariMemberMandiri" placeholder="Cari nama/kode member...">' +
                '  <div class="member-dropdown" id="hasilMemberMandiri"></div>' +
                '</div>';
            const elInput = document.getElementById('cariMemberMandiri');
            const elHasil = document.getElementById('hasilMemberMandiri');
            elInput.focus();
            elInput.addEventListener('input', () => {
                clearTimeout(topUpMandiriTimer);
                const keyword = elInput.value.trim();
                if (!keyword) { elHasil.className = 'member-dropdown'; elHasil.innerHTML = ''; return; }
                topUpMandiriTimer = setTimeout(() => cariMemberMandiri(keyword, elHasil), 350);
            });
        } else {
            elIsiTopUpMandiri.innerHTML =
                '<div class="member-chip" style="display:flex;margin-bottom:14px;">' +
                '  <span class="ico">&#128100;</span>' +
                '  <div class="info"><span class="teks" id="namaTopUpMandiri"></span><span class="saldo" id="saldoTopUpMandiri">Memeriksa saldo...</span></div>' +
                '  <button type="button" id="btnGantiMemberMandiri" title="Cari member lain">&#10005;</button>' +
                '</div>' +
                '<div class="field"><label>Nominal Top Up (Rp)</label><input type="number" min="1" id="inputNominalTopUpMandiri"></div>' +
                '<div class="field" style="margin-top:8px;"><input type="text" id="inputKetTopUpMandiri" placeholder="Keterangan (opsional)"></div>' +
                '<button type="button" class="btn-sesikas-aksi" id="btnSubmitTopUpMandiri" style="margin-top:12px;">Top Up</button>';
            document.getElementById('namaTopUpMandiri').textContent = topUpMandiriMember.nama;
            document.getElementById('btnGantiMemberMandiri').addEventListener('click', () => { topUpMandiriMember = null; renderIsiTopUpMandiri(); });
            document.getElementById('btnSubmitTopUpMandiri').addEventListener('click', submitTopUpMandiri);
            segarkanSaldoTopUpMandiri();
        }
    }

    async function cariMemberMandiri(keyword, elHasil) {
        let daftar = [];
        let pesanKosong = 'Tidak ada member yang cocok.';
        try {
            const hasil = await window.electronAPI.posAPI.cariMember({ keyword });
            if (hasil.ok) daftar = (hasil.data && hasil.data.member) || [];
            else pesanKosong = hasil.pesan || 'Gagal mencari member.';
        } catch (e) {
            pesanKosong = 'Gagal mencari member: ' + (e && e.message ? e.message : e);
        }
        elHasil.innerHTML = '';
        if (daftar.length === 0) {
            const kosong = document.createElement('div');
            kosong.className = 'kosong';
            kosong.textContent = pesanKosong;
            elHasil.appendChild(kosong);
        } else {
            daftar.forEach((m) => {
                const opsi = document.createElement('div');
                opsi.className = 'opsi';
                opsi.innerHTML = '<div class="nama"></div><div class="info"></div>';
                opsi.querySelector('.nama').textContent = m.nama;
                opsi.querySelector('.info').textContent = m.kodeIdentitas || '-';
                opsi.addEventListener('click', () => { topUpMandiriMember = m; renderIsiTopUpMandiri(); });
                elHasil.appendChild(opsi);
            });
        }
        elHasil.className = 'member-dropdown tampil';
    }

    async function segarkanSaldoTopUpMandiri() {
        if (!topUpMandiriMember) return;
        const idSaatDipanggil = topUpMandiriMember.id;
        const elSaldo = document.getElementById('saldoTopUpMandiri');
        try {
            const hasil = await window.electronAPI.posAPI.saldoMember({ id_member: idSaatDipanggil });
            if (!topUpMandiriMember || topUpMandiriMember.id !== idSaatDipanggil || !elSaldo) return;
            elSaldo.textContent = hasil.ok ? ('Saldo: ' + formatRupiah(Number(hasil.data && hasil.data.data) || 0)) : (hasil.offline ? 'Saldo: tidak bisa diperiksa (offline)' : 'Saldo: gagal diperiksa');
        } catch (e) {
            if (elSaldo) elSaldo.textContent = 'Saldo: gagal diperiksa';
        }
    }

    async function submitTopUpMandiri() {
        if (!topUpMandiriMember) return;
        const elBtn = document.getElementById('btnSubmitTopUpMandiri');
        const nominal = parseFloat(document.getElementById('inputNominalTopUpMandiri').value) || 0;
        if (nominal <= 0) { tampilkanToast('error', 'Nominal top up harus lebih dari 0.'); return; }
        const keterangan = document.getElementById('inputKetTopUpMandiri').value || '';
        elBtn.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.topupSaldo({ id_member: topUpMandiriMember.id, nominal: nominal, keterangan: keterangan });
            if (r.ok) {
                tampilkanToast('success', 'Top up untuk ' + topUpMandiriMember.nama + ' berhasil.');
                document.getElementById('inputNominalTopUpMandiri').value = '';
                document.getElementById('inputKetTopUpMandiri').value = '';
                segarkanSaldoTopUpMandiri();
                // Kalau member yg sama SEDANG dipilih di keranjang aktif, segarkan juga saldo yg
                // tampil di sana -- supaya kasir tak melihat angka basi kalau lanjut checkout member ini.
                if (memberTerpilih && memberTerpilih.id === topUpMandiriMember.id) segarkanSaldoMemberTerpilih();
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtn.disabled = false;
        }
    }

    elBtnTopUpTopbar.addEventListener('click', () => {
        topUpMandiriMember = null;
        renderIsiTopUpMandiri();
        elOverlayTopUpMandiri.className = 'overlay tampil';
    });
    elBtnTutupTopUpMandiri.addEventListener('click', () => { elOverlayTopUpMandiri.className = 'overlay'; });

    // ==== Akun Saya: ganti kata sandi (siapa pun) + tambah akun kasir (admin/manager saja) ====
    // Butir 11 spesifikasi "dashboard kasir". Gerbang "tambah akun" HANYA visual di sini (tombol
    // disembunyikan bila !isAdminAkun) -- penegakan SEBENARNYA ada di server (KantinHelper.tambahAkunKasir),
    // konsisten dgn prinsip "jangan percaya klien" yg dipakai di seluruh PosApi.

    function renderIsiAkunSaya() {
        elIsiAkunSaya.innerHTML =
            '<div style="font-weight:800;font-size:12.5px;margin-bottom:8px;">Ganti Kata Sandi</div>' +
            '<div class="field"><label>Kata Sandi Lama</label><input type="password" id="inputPasswordLama"></div>' +
            '<div class="field" style="margin-top:8px;"><label>Kata Sandi Baru (min. 6 karakter)</label><input type="password" id="inputPasswordBaru"></div>' +
            '<button type="button" class="btn-sesikas-aksi" id="btnSubmitGantiPassword" style="margin-top:10px;">Ganti Kata Sandi</button>' +
            (isAdminAkun ?
                '<div style="border-top:1px dashed var(--border);margin:18px 0 12px;"></div>' +
                '<div style="font-weight:800;font-size:12.5px;margin-bottom:8px;">Tambah Akun Kasir Baru</div>' +
                '<div class="field"><label>Userid</label><input type="text" id="inputAkunBaruUserid"></div>' +
                '<div class="field" style="margin-top:8px;"><label>Nama</label><input type="text" id="inputAkunBaruNama"></div>' +
                '<div class="field" style="margin-top:8px;"><label>Kata Sandi (min. 6 karakter)</label><input type="password" id="inputAkunBaruPassword"></div>' +
                '<div class="field" style="margin-top:8px;"><label>ID Toko</label><input type="number" id="inputAkunBaruTokoId" placeholder="Lihat daftar toko di aplikasi web"></div>' +
                '<div class="field" style="margin-top:8px;"><label>Keterangan (opsional)</label><input type="text" id="inputAkunBaruKeterangan"></div>' +
                '<button type="button" class="btn-sesikas-aksi" id="btnSubmitTambahAkun" style="margin-top:10px;">Tambah Akun Kasir</button>'
                : '');
        document.getElementById('btnSubmitGantiPassword').addEventListener('click', submitGantiPassword);
        if (isAdminAkun) document.getElementById('btnSubmitTambahAkun').addEventListener('click', submitTambahAkun);
    }

    async function submitGantiPassword() {
        const lama = document.getElementById('inputPasswordLama').value;
        const baru = document.getElementById('inputPasswordBaru').value;
        if (!lama || !baru) { tampilkanToast('error', 'Kata sandi lama dan baru wajib diisi.'); return; }
        const btn = document.getElementById('btnSubmitGantiPassword');
        btn.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.akun.gantiPassword({ password_lama: lama, password_baru: baru });
            if (r.ok) {
                tampilkanToast('success', 'Kata sandi berhasil diganti.');
                document.getElementById('inputPasswordLama').value = '';
                document.getElementById('inputPasswordBaru').value = '';
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            btn.disabled = false;
        }
    }

    async function submitTambahAkun() {
        const userid = document.getElementById('inputAkunBaruUserid').value.trim();
        const nama = document.getElementById('inputAkunBaruNama').value.trim();
        const password = document.getElementById('inputAkunBaruPassword').value;
        const tokoIdBaru = document.getElementById('inputAkunBaruTokoId').value;
        const keterangan = document.getElementById('inputAkunBaruKeterangan').value;
        if (!userid || !nama || !password || !tokoIdBaru) {
            tampilkanToast('error', 'Userid, nama, kata sandi, dan ID toko wajib diisi.');
            return;
        }
        const btn = document.getElementById('btnSubmitTambahAkun');
        btn.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.akun.tambah({ userid, nama, password, toko_id: tokoIdBaru, keterangan });
            if (r.ok) {
                tampilkanToast('success', 'Akun kasir "' + nama + '" berhasil dibuat.');
                document.getElementById('inputAkunBaruUserid').value = '';
                document.getElementById('inputAkunBaruNama').value = '';
                document.getElementById('inputAkunBaruPassword').value = '';
                document.getElementById('inputAkunBaruTokoId').value = '';
                document.getElementById('inputAkunBaruKeterangan').value = '';
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            btn.disabled = false;
        }
    }

    elBtnAkunSaya.addEventListener('click', () => {
        renderIsiAkunSaya();
        elOverlayAkunSaya.className = 'overlay tampil';
    });
    elBtnTutupAkunSaya.addEventListener('click', () => { elOverlayAkunSaya.className = 'overlay'; });

    async function segarkanStatusLayarPelanggan() {
        try {
            const st = await window.electronAPI.posAPI.layarPelanggan.status();
            elBtnLayarPelanggan.classList.toggle('aktif-lp', !!st.terbuka);
            elBtnLayarPelanggan.innerHTML = st.terbuka ? '&#128421;&#65039; Layar Pelanggan (Aktif)' : '&#128421;&#65039; Layar Pelanggan';
        } catch (e) { /* abaikan -- indikator status bukan jalur kritis */ }
    }

    /**
     * Buka Laci Kasir -- SENGAJA manual SAJA (tombol topbar {@code elBtnBukaLaci}/{@code
     * elBtnBukaLaciAlt}, atau tombol {@code elBtnBukaLaciSukses} di layar sukses sesudah bayar).
     * SEBELUMNYA otomatis terpicu begitu transaksi TUNAI berhasil -- dihapus per keluhan lapangan
     * (Toko Al-Bahjah) aplikasi POS suka "keluar sendiri"/macet; perintah laci dibungkus PowerShell
     * (lihat JavaDoc {@code main.js} sekitar {@code pos:buka-laci-kasir}) yg berisiko menggantung kalau
     * printer/OS lambat merespons TEPAT saat proses render sedang berpindah ke layar sukses -- kasir
     * kini SELALU menekan tombol sendiri, menghilangkan pemicu otomatis itu tanpa menghapus fiturnya.
     */
    async function bukaLaciKasir(diam, pinAlternatif) {
        // Gap-closure "aplikasi sering exit saat Buka Laci": nonaktifkan KETIGA tombol (topbar,
        // pin-alternatif, layar sukses) selama satu percobaan berjalan -- mencegah kasir menekan
        // berkali-kali cepat kalau laci tak kunjung terbuka, yg tiap tekanannya men-spawn proses
        // PowerShell baru (lihat JavaDoc main.js pos:buka-laci-kasir soal risiko tekanan memori dari
        // tumpang-tindih percobaan di mesin RAM 8GB). Server sisi main.js SUDAH punya penjaga yg sama
        // (janjiBukaLaciBerjalan) -- ini lapisan pertama di sisi kasir supaya UI jg terasa responsif
        // (tombol terlihat nonaktif, bukan diam2 tak bereaksi thd klik berulang).
        elBtnBukaLaci.disabled = true;
        elBtnBukaLaciAlt.disabled = true;
        elBtnBukaLaciSukses.disabled = true;
        try {
            const hasil = await window.electronAPI.posAPI.bukaLaciKasir({ pinAlternatif: !!pinAlternatif });
            // Gap-closure keluhan lapangan "muncul 'perintah terkirim ke printer' tapi laci tak
            // terbuka" -- SETIAP percobaan dicatat ke Log Error (disinkron ke server, lihat
            // errorLogKirim) supaya admin pusat punya jejak lengkap pin mana saja yg sudah dicoba di
            // mesin ini, bukan cuma toast sekilas yg hilang begitu ditutup. "OK dari OS" SENGAJA
            // dicatat sbg 'peringatan' (bukan 'error') -- itu cuma berarti Windows menerima perintah,
            // BUKAN bukti laci fisik benar-benar terbuka (tak ada sensor umpan-balik).
            if (window.electronAPI.posAPI.errorLog) {
                window.electronAPI.posAPI.errorLog.catat({
                    sumber: 'renderer:buka-laci' + (pinAlternatif ? ':pin-alternatif' : ':pin-default'),
                    tingkat: hasil.ok ? 'peringatan' : 'error',
                    pesan: hasil.pesan || (hasil.ok ? 'Perintah buka laci terkirim (diterima OS).' : 'Gagal membuka laci.'),
                    detail: 'pinAlternatif=' + !!pinAlternatif + (hasil.detailTeknis ? (' ' + hasil.detailTeknis) : ''),
                    layar: 'pos.html (Kasir)'
                }).catch(() => {});
            }
            if (!diam) {
                const saran = pinAlternatif ? '' : ' Jika laci TETAP tidak terbuka, coba tombol \u{1F527} di sebelahnya (pin kabel alternatif).';
                tampilkanToast(hasil.ok ? 'info' : 'error', (hasil.pesan || (hasil.ok ? 'Perintah buka laci terkirim.' : 'Gagal membuka laci.')) + (hasil.ok ? saran : ''));
            } else if (!hasil.ok) {
                tampilkanToast('error', 'Laci kasir tidak terbuka otomatis: ' + (hasil.pesan || 'periksa printer.'));
            }
        } catch (e) {
            if (!diam) tampilkanToast('error', 'Gagal membuka laci: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnBukaLaci.disabled = false;
            elBtnBukaLaciAlt.disabled = false;
            elBtnBukaLaciSukses.disabled = false;
        }
    }
    elBtnBukaLaci.addEventListener('click', () => bukaLaciKasir(false, false));
    elBtnBukaLaciAlt.addEventListener('click', () => bukaLaciKasir(false, true));

    elBtnLayarPelanggan.addEventListener('click', async () => {
        const st = await window.electronAPI.posAPI.layarPelanggan.status();
        if (st.terbuka) {
            window.electronAPI.posAPI.layarPelanggan.tutup();
        } else {
            const hasil = await window.electronAPI.posAPI.layarPelanggan.buka();
            if (hasil.ok && !hasil.adaMonitorKedua) {
                tampilkanToast('info', 'Hanya 1 monitor terdeteksi -- Layar Pelanggan dibuka sbg jendela biasa (mode uji).');
            }
            siarkanKeranjangKeLayarPelanggan();
        }
        segarkanStatusLayarPelanggan();
    });

    /** Mengirim keadaan keranjang terkini ke Layar Pelanggan (no-op aman bila jendela itu belum terbuka -- lihat main.js). */
    function siarkanKeranjangKeLayarPelanggan() {
        const { subtotal, totalDiskon, pajak, total } = hitungRingkasanKeranjang();
        window.electronAPI.posAPI.layarPelanggan.kirim({
            tipe: 'keranjang',
            namaToko: tokoNama,
            memberNama: memberTerpilih ? memberTerpilih.nama : null,
            items: cart.map((c) => ({ nama: c.nama, harga: c.harga, jumlah: c.jumlah, diskon: c.diskon || 0 })),
            subtotal: subtotal, totalDiskon: totalDiskon, pajak: pajak, total: total
        });
    }

    /** Resolver Promise modal PIN layar utama yg sedang menunggu -- lihat {@link #mintaPinDiLayarUtama}. */
    let pinKasirPendingResolve = null;

    /**
     * Fallback verifikasi PIN member di LAYAR UTAMA Kasir -- dipakai {@link #gerbangSaldoDanPin} saat
     * Layar Pelanggan (monitor kedua) tidak/belum dibuka. Beda dari jalur Layar Pelanggan: PIN
     * diverifikasi LANGSUNG lewat {@code posAPI.verifikasiPin} (bukan relay lintas-jendela), PIN salah
     * TIDAK menutup modal (kasir bisa coba lagi, sama spt pola numpad Layar Pelanggan), dan tidak ada
     * timeout otomatis (kasir mengetik di layarnya sendiri, tak ada pihak lain yg perlu ditunggu).
     * @param {string} memberNama
     * @param {number} memberId
     * @return {Promise<{ok:boolean}>}
     */
    function mintaPinDiLayarUtama(memberNama, memberId) {
        return new Promise((resolve) => {
            pinKasirPendingResolve = resolve;
            elKeteranganPinKasir.textContent = 'Layar Pelanggan tidak terbuka -- minta ' + memberNama + ' memasukkan PIN di sini.';
            elInputPinKasir.value = '';
            elErrorPinKasir.textContent = '';
            elBtnSubmitPinKasir.disabled = false;
            elBtnSubmitPinKasir.textContent = 'Verifikasi';
            elOverlayPinKasir.className = 'overlay tampil';
            elInputPinKasir.focus();

            const selesai = (hasil) => {
                if (!pinKasirPendingResolve) return;
                pinKasirPendingResolve = null;
                elOverlayPinKasir.className = 'overlay';
                resolve(hasil);
            };

            elBtnBatalPinKasir.onclick = () => selesai({ ok: false });
            elBtnSubmitPinKasir.onclick = async () => {
                const pin = elInputPinKasir.value.trim();
                if (!pin) { elInputPinKasir.focus(); return; }
                elBtnSubmitPinKasir.disabled = true;
                elBtnSubmitPinKasir.textContent = 'Memeriksa...';
                elErrorPinKasir.textContent = '';
                try {
                    const hasil = await window.electronAPI.posAPI.verifikasiPin({ memberId: memberId, pin: pin });
                    if (hasil.ok && hasil.cocok) {
                        selesai({ ok: true });
                    } else {
                        elErrorPinKasir.textContent = hasil.ok ? 'PIN salah, coba lagi.' : (hasil.pesan || 'Gagal memeriksa PIN -- periksa koneksi.');
                        elInputPinKasir.value = '';
                        elInputPinKasir.focus();
                    }
                } catch (e) {
                    elErrorPinKasir.textContent = 'Gagal memeriksa PIN: ' + (e && e.message ? e.message : e);
                } finally {
                    elBtnSubmitPinKasir.disabled = false;
                    elBtnSubmitPinKasir.textContent = 'Verifikasi';
                }
            };
        });
    }

    // Hasil PIN dari Layar Pelanggan diteruskan proses utama ke sini -- diselesaikan lewat Promise
    // yg dibuat gerbangSaldoDanPin() (pola pinPendingResolve sama persis versi web/_pos.jsp).
    window.electronAPI.posAPI.layarPelanggan.onDariPelanggan((payload) => {
        if (payload && payload.tipe === 'pin_hasil' && pinPendingResolve) {
            const resolve = pinPendingResolve;
            pinPendingResolve = null;
            if (pinPendingTimeoutId) { clearTimeout(pinPendingTimeoutId); pinPendingTimeoutId = null; }
            resolve(payload);
        }
    });

    /**
     * Gerbang validasi+PIN sebelum checkout pakai metode "saldo" ({@code caraBayarTerpilih.manual
     * === false}) -- dipanggil dari handler {@code elBtnBayar} SEBELUM membangun payload {@code bayar}.
     * Urutan PERSIS versi web ({@code initiatePembayaran()} di _pos.jsp): member wajib terpilih ->
     * saldo REAL-TIME dicek ulang (bukan dari hasil pencarian yg bisa basi) -> saldo cukup -> saldo
     * sisa tidak di bawah batas mengendap -> BARU (bila member wajib-PIN) minta verifikasi PIN via
     * Layar Pelanggan, menunggu maks 90 detik sebelum otomatis membatalkan (mencegah kasir/pembeli
     * "menggantung" transaksi tanpa batas bila layar kedua diabaikan).
     *
     * <p>Balikan memakai {@code kode} (BUKAN teks pesan langsung) yg cocok dgn entri
     * {@code pesan-detail.js} KAMUS -- lihat {@link #tampilkanErrorGerbang} yg menerjemahkannya jadi
     * modal detail lengkap (penjelasan+langkah+pencegahan), bukan sekadar toast singkat.</p>
     * @param {number} total
     * @return {Promise<{lolos:boolean, kode?:string, pesanTambahan?:string}>}
     */
    async function gerbangSaldoDanPin(total) {
        if (!memberTerpilih) return { lolos: false, kode: 'MEMBER_BELUM_DIPILIH' };

        let saldoTerbaru = 0;
        try {
            const hasilSaldo = await window.electronAPI.posAPI.saldoMember({ id_member: memberTerpilih.id });
            if (!hasilSaldo.ok) return { lolos: false, kode: 'GAGAL_CEK_SALDO', pesanTambahan: hasilSaldo.pesan };
            saldoTerbaru = Number(hasilSaldo.data && hasilSaldo.data.data) || 0;
        } catch (e) {
            return { lolos: false, kode: 'GAGAL_CEK_SALDO', pesanTambahan: e && e.message ? e.message : String(e) };
        }
        if (saldoTerbaru < total) {
            return {
                lolos: false, kode: 'SALDO_TIDAK_CUKUP',
                pesanTambahan: 'Saldo ' + memberTerpilih.nama + ' saat ini: ' + formatRupiah(saldoTerbaru) + ' -- kurang ' + formatRupiah(total - saldoTerbaru) + ' dari total belanja ' + formatRupiah(total) + '.'
            };
        }
        if ((saldoTerbaru - total) < (memberTerpilih.minSaldo || 0)) {
            return {
                lolos: false, kode: 'SALDO_MENGENDAP_KURANG',
                pesanTambahan: 'Saldo ' + memberTerpilih.nama + ' akan tersisa ' + formatRupiah(saldoTerbaru - total) + ', sedangkan batas minimal yang harus tersisa adalah ' + formatRupiah(memberTerpilih.minSaldo) + '.'
            };
        }

        if (!memberTerpilih.wajibPin) return { lolos: true };

        const statusLp = await window.electronAPI.posAPI.layarPelanggan.status();
        if (!statusLp.terbuka) {
            // Layar Pelanggan (monitor kedua) tak dibuka -- fallback: PIN diketik LANGSUNG di layar
            // utama Kasir (butir 5 spesifikasi "dashboard kasir": "jika layarnya hanya satu maka bisa
            // di entry dilayar utama"). BEDA dari jalur Layar Pelanggan: verifikasi di sini memanggil
            // posAPI.verifikasiPin langsung (bukan relay minta_pin/pin_hasil lintas-jendela), tanpa
            // timeout 90 detik (kasir mengetik di layarnya sendiri, tak ada pihak lain yg ditunggu).
            const hasilPinUtama = await mintaPinDiLayarUtama(memberTerpilih.nama, memberTerpilih.id);
            if (!hasilPinUtama.ok) return { lolos: false, kode: 'PIN_DIBATALKAN' };
            return { lolos: true };
        }

        elBtnBayar.textContent = 'Menunggu PIN di Layar Pelanggan...';
        window.electronAPI.posAPI.layarPelanggan.kirim({ tipe: 'minta_pin', memberId: memberTerpilih.id, memberNama: memberTerpilih.nama });
        const hasilPin = await new Promise((resolve) => {
            pinPendingResolve = resolve;
            pinPendingTimeoutId = setTimeout(() => { pinPendingResolve = null; resolve({ ok: false, timeout: true }); }, 90000);
        });
        if (!hasilPin.ok) {
            return { lolos: false, kode: hasilPin.timeout ? 'PIN_TIMEOUT' : 'PIN_DIBATALKAN' };
        }
        return { lolos: true };
    }

    /**
     * Menampilkan modal detail (judul/penjelasan/langkah/pencegahan) dari hasil {@link #gerbangSaldoDanPin}
     * -- ambil entri KAMUS sesuai {@code kode}, tempel {@code pesanTambahan} (angka rupiah spesifik
     * transaksi ini, mis. "kurang Rp 5.000") ke akhir paragraf penjelasan supaya kasir langsung lihat
     * angka konkretnya, bukan cuma penjelasan umum.
     * @param {{kode?:string, pesanTambahan?:string}} gerbang
     */
    function tampilkanErrorGerbang(gerbang) {
        const entri = window.PesanDetail.KAMUS[gerbang.kode];
        if (!entri) { tampilkanToast('error', gerbang.pesanTambahan || 'Transaksi tidak bisa dilanjutkan.'); return; }
        const info = Object.assign({}, entri);
        if (gerbang.pesanTambahan) info.penjelasan = info.penjelasan + ' ' + gerbang.pesanTambahan;
        // Butir 6 spesifikasi "dashboard kasir": popup saldo tak cukup langsung menawarkan jalan
        // pintas ke top-up (bukan cuma teks saran) -- tombol ini membuka form top-up INLINE yg sudah
        // ada di panel keranjang (bolehTopup=true & member masih terpilih di keranjang ini, BUKAN
        // modal Top Up mandiri topbar yg independen dari checkout).
        if (gerbang.kode === 'SALDO_TIDAK_CUKUP' && bolehTopup && memberTerpilih) {
            info.aksi = {
                label: 'Isi Saldo ' + memberTerpilih.nama,
                onClick: () => {
                    elFormTopupMemberWrap.style.display = 'block';
                    elInputNominalTopupMember.focus();
                }
            };
        }
        window.PesanDetail.tampilkan(info);
    }

    // ==== Update Sistem (versi APLIKASI, BUKAN data/katalog -- itu tombol "Sinkronkan") ====
    // Status berjalan (memeriksa/tersedia/terkini/unduh/siap/error) datang lewat event
    // window.electronAPI.posAPI.update.onStatus -- lihat JavaDoc lengkap arsitektur+konsekuensi
    // operasional (admin WAJIB unggah rilis ke folder "pos-desktop-updates/" di server) di main.js.

    /** @type {'awal'|'memeriksa'|'terkini'|'tersedia'|'mengunduh'|'siap'|'error'} */
    let updateState = 'awal';

    function aturTombolUpdate(label, aktif, sekunder) {
        elBtnUpdateAksi.textContent = label;
        elBtnUpdateAksi.disabled = !aktif;
        elBtnUpdateAksi.className = 'btn-update-aksi' + (sekunder ? ' sekunder' : '');
    }

    elBtnUpdateSistem.addEventListener('click', async () => {
        elOverlayUpdate.className = 'overlay tampil';
        try {
            elUpdateVersiSaatIni.textContent = await window.electronAPI.posAPI.update.versiSaatIni();
        } catch (e) { elUpdateVersiSaatIni.textContent = '-'; }
    });
    elBtnTutupUpdate.addEventListener('click', () => { elOverlayUpdate.className = 'overlay'; });
    elOverlayUpdate.addEventListener('click', (event) => { if (event.target === elOverlayUpdate) elOverlayUpdate.className = 'overlay'; });

    elBtnUpdateAksi.addEventListener('click', async () => {
        if (updateState === 'awal' || updateState === 'terkini' || updateState === 'error') {
            elUpdateStatusArea.className = 'update-status';
            elUpdateStatusArea.textContent = 'Memeriksa versi terbaru ke server...';
            aturTombolUpdate('Memeriksa...', false);
            const hasil = await window.electronAPI.posAPI.update.cek();
            if (!hasil.ok) {
                updateState = 'error';
                elUpdateStatusArea.className = 'update-status error';
                elUpdateStatusArea.textContent = hasil.pesan || 'Gagal memeriksa pembaruan.';
                aturTombolUpdate('Coba Lagi', true);
            }
            // Hasil sukses (tersedia/terkini) datang lewat event onStatus di bawah, bukan di sini.
        } else if (updateState === 'tersedia') {
            elUpdateProgressWrap.style.display = 'block';
            aturTombolUpdate('Mengunduh...', false);
            const hasil = await window.electronAPI.posAPI.update.unduh();
            if (!hasil.ok) {
                updateState = 'error';
                elUpdateStatusArea.className = 'update-status error';
                elUpdateStatusArea.textContent = hasil.pesan || 'Gagal mengunduh pembaruan.';
                aturTombolUpdate('Coba Unduh Lagi', true);
            }
        } else if (updateState === 'siap') {
            window.electronAPI.posAPI.update.instal();
        }
    });

    /** Menyembunyikan blok catatan rilis HTML -- dipanggil di setiap status SELAIN 'tersedia' supaya catatan lama tak nyangkut tampil di konteks yg tak relevan. */
    function sembunyikanCatatanRilis() {
        elUpdateCatatanRilis.className = 'update-catatan';
        elUpdateCatatanRilis.innerHTML = '';
    }

    // Tautan di dalam catatan rilis (mis. link "Full Changelog" dari GitHub) dibuka di BROWSER SISTEM,
    // BUKAN dinavigasikan di jendela Electron ini sendiri (yg akan gagal/aneh krn origin file://) --
    // event delegation krn innerHTML catatan rilis dibangun ulang tiap kali status 'tersedia' masuk.
    elUpdateCatatanRilis.addEventListener('click', (event) => {
        const a = event.target.closest('a');
        if (!a) return;
        event.preventDefault();
        let href = a.getAttribute('href') || '';
        if (href.indexOf('/') === 0) href = 'https://github.com' + href; // link relatif hasil render markdown GitHub (mis. "/pemilik/repo/releases")
        if (/^https:\/\//i.test(href)) window.electronAPI.bukaLinkEksternal(href);
    });

    window.electronAPI.posAPI.update.onStatus((status) => {
        if (!status || !status.tipe) return;
        if (status.tipe === 'memeriksa') {
            updateState = 'memeriksa';
            elUpdateStatusArea.className = 'update-status';
            elUpdateStatusArea.textContent = 'Memeriksa versi terbaru ke server...';
            sembunyikanCatatanRilis();
            aturTombolUpdate('Memeriksa...', false);
        } else if (status.tipe === 'terkini') {
            updateState = 'terkini';
            elBtnUpdateSistem.classList.remove('ada-update');
            elUpdateStatusArea.className = 'update-status sukses';
            elUpdateStatusArea.textContent = 'Aplikasi ini sudah versi TERBARU (v' + status.versi + ').';
            sembunyikanCatatanRilis();
            aturTombolUpdate('Cek Lagi', true, true);
        } else if (status.tipe === 'tersedia') {
            updateState = 'tersedia';
            elBtnUpdateSistem.classList.add('ada-update');
            elUpdateStatusArea.className = 'update-status';
            elUpdateStatusArea.textContent = 'Versi baru tersedia: v' + status.versiBaru + '. Klik "Unduh Sekarang" untuk mengunduhnya -- aplikasi TETAP bisa dipakai selama proses unduh.';
            // Catatan rilis (deskripsi dari GitHub Release) SUDAH berbentuk HTML dari electron-updater
            // -- innerHTML disengaja (BUKAN textContent) supaya heading/daftar/tautan tampil rapi,
            // bukan tag mentah spt "<h2>...</h2>" apa adanya. Aman dari eksekusi skrip krn CSP halaman
            // ini (script-src 'self', tanpa unsafe-inline) tetap memblokir <script>/atribut onclick dsb
            // walau disuntik lewat innerHTML -- dan sumber kontennya (rilis repo ini sendiri) memang
            // hanya bisa ditulis pengelola aplikasi ini, bukan sembarang pihak luar.
            if (status.catatan) {
                elUpdateCatatanRilis.innerHTML = status.catatan;
                elUpdateCatatanRilis.className = 'update-catatan tampil';
            } else {
                sembunyikanCatatanRilis();
            }
            aturTombolUpdate('Unduh Sekarang', true);
            // Pemeriksaan ini bisa dipicu OTOMATIS berkala (lihat mulaiAutoCekUpdate di main.js, tiap
            // 3 jam) -- bukan cuma saat kasir sendiri buka modal. Tampilkan toast SETIAP kali terdeteksi
            // (termasuk pengulangan berkala selama belum di-update) HANYA bila modal-nya belum terbuka,
            // supaya kasir yg sedang tidak melihat modal tetap sadar ada pembaruan -- badge oranye di
            // tombol (di atas) tetap menyala terus sbg pengingat visual permanen sampai di-update.
            if (elOverlayUpdate.className.indexOf('tampil') < 0) {
                tampilkanToast('info', '\u{2B06}\u{FE0F} Versi baru v' + status.versiBaru + ' tersedia -- klik "Update Sistem" di pojok kanan atas untuk memperbarui.');
            }
        } else if (status.tipe === 'unduh') {
            updateState = 'mengunduh';
            elUpdateProgressWrap.style.display = 'block';
            elUpdateProgressBar.style.width = (status.persen || 0) + '%';
            elUpdateProgressTeks.textContent = (status.persen || 0) + '% -- ' + (status.ditransferMb || 0) + ' MB / ' + (status.totalMb || 0) + ' MB';
            elUpdateStatusArea.textContent = 'Sedang mengunduh pembaruan, jangan tutup aplikasi...';
            aturTombolUpdate('Mengunduh...', false);
        } else if (status.tipe === 'siap') {
            updateState = 'siap';
            elUpdateStatusArea.className = 'update-status sukses';
            elUpdateStatusArea.textContent = 'Pembaruan v' + status.versiBaru + ' sudah siap dipasang. Aplikasi akan RESTART otomatis saat memasangnya -- pastikan tidak sedang melayani transaksi sebelum menekan tombol di bawah.';
            aturTombolUpdate('Instal & Restart Sekarang', true);
        } else if (status.tipe === 'error') {
            updateState = 'error';
            elUpdateStatusArea.className = 'update-status error';
            elUpdateStatusArea.textContent = status.pesan || 'Terjadi kesalahan saat memproses pembaruan.';
            aturTombolUpdate('Coba Lagi', true);
        }
        prosesUpdateOtomatis(status);
    });

    // ==== Update Otomatis (mirip Windows Update) ====
    // Preferensi "jangan tanya lagi" tersimpan lintas-sesi lewat update-preferensi.json (main.js).
    // Bila aktif: unduhan dipicu SENDIRI begitu status 'tersedia' masuk, TANPA menampilkan popup
    // tawaran -- tapi restart/pasang TETAP butuh konfirmasi eksplisit kasir (popup #overlayUpdateRestart)
    // begitu status 'siap' masuk, persis pola Windows Update ("unduh sendiri, tanya sebelum restart").
    let preferensiUpdateOtomatis = false;
    let versiTawaranDitutup = null; // versi terakhir yg sudah ditawarkan+ditutup manual ("Nanti") sesi ini -- cegah nagging berulang tiap siklus cek-berkala 3 jam.
    let versiSedangDitawarkan = null;

    window.electronAPI.posAPI.update.preferensiBaca().then((p) => {
        preferensiUpdateOtomatis = !!(p && p.otomatis);
        elChkUpdateOtomatis.checked = preferensiUpdateOtomatis;
    }).catch(() => {});

    elChkUpdateOtomatis.addEventListener('change', () => {
        preferensiUpdateOtomatis = elChkUpdateOtomatis.checked;
        window.electronAPI.posAPI.update.preferensiSet(preferensiUpdateOtomatis).catch(() => {});
    });

    function tutupTawaranUpdate() { elOverlayTawaranUpdate.className = 'overlay'; }
    elBtnTutupTawaranUpdate.addEventListener('click', tutupTawaranUpdate);
    elOverlayTawaranUpdate.addEventListener('click', (event) => { if (event.target === elOverlayTawaranUpdate) tutupTawaranUpdate(); });
    elBtnTawaranNanti.addEventListener('click', () => {
        versiTawaranDitutup = versiSedangDitawarkan;
        tutupTawaranUpdate();
    });

    /** Memicu unduhan pembaruan di latar (dipakai baik oleh tombol popup tawaran maupun jalur Update Otomatis). */
    async function mulaiUnduhOtomatis() {
        elUpdateProgressWrap.style.display = 'block';
        aturTombolUpdate('Mengunduh...', false);
        const hasil = await window.electronAPI.posAPI.update.unduh();
        if (!hasil.ok) {
            updateState = 'error';
            elUpdateStatusArea.className = 'update-status error';
            elUpdateStatusArea.textContent = hasil.pesan || 'Gagal mengunduh pembaruan.';
            aturTombolUpdate('Coba Unduh Lagi', true);
            tampilkanToast('error', 'Gagal mengunduh pembaruan otomatis: ' + (hasil.pesan || '-'));
        }
    }

    elBtnTawaranUpdateSekarang.addEventListener('click', () => {
        tutupTawaranUpdate();
        tampilkanToast('info', 'Mengunduh pembaruan di latar...');
        mulaiUnduhOtomatis();
    });

    function tutupUpdateRestart() { elOverlayUpdateRestart.className = 'overlay'; }
    elBtnTutupUpdateRestart.addEventListener('click', tutupUpdateRestart);
    elOverlayUpdateRestart.addEventListener('click', (event) => { if (event.target === elOverlayUpdateRestart) tutupUpdateRestart(); });
    elBtnRestartNanti.addEventListener('click', tutupUpdateRestart);
    elBtnRestartSekarang.addEventListener('click', () => { window.electronAPI.posAPI.update.instal(); });

    /**
     * Dipanggil di SETIAP status update masuk (lihat pemanggilan di akhir {@code onStatus} di atas) --
     * menawarkan/menjalankan alur otomatis TANPA mengganggu modal "Update Sistem" manual bila kasir
     * SEDANG membukanya (dicek via class 'tampil' -- popup otomatis TIDAK pernah tampil bertumpuk di
     * atas modal yg sudah terbuka, karena tombol/status di modal itu sendiri sudah cukup).
     */
    function prosesUpdateOtomatis(status) {
        const modalUtamaTerbuka = elOverlayUpdate.className.indexOf('tampil') >= 0;
        if (status.tipe === 'tersedia') {
            if (modalUtamaTerbuka || elOverlayTawaranUpdate.className.indexOf('tampil') >= 0) return;
            if (preferensiUpdateOtomatis) {
                tampilkanToast('info', 'Update Otomatis aktif -- mengunduh v' + status.versiBaru + ' di latar...');
                mulaiUnduhOtomatis();
            } else if (versiTawaranDitutup !== status.versiBaru) {
                versiSedangDitawarkan = status.versiBaru;
                elTawaranUpdateTeks.textContent = 'Versi baru v' + status.versiBaru + ' tersedia. Update sekarang?';
                elChkUpdateOtomatis.checked = preferensiUpdateOtomatis;
                elOverlayTawaranUpdate.className = 'overlay tampil';
            }
        } else if (status.tipe === 'siap') {
            if (modalUtamaTerbuka) return;
            elUpdateRestartTeks.textContent = 'Pembaruan v' + status.versiBaru + ' sudah selesai diunduh. Restart aplikasi sekarang untuk memasangnya? (pastikan tidak sedang melayani transaksi)';
            elOverlayUpdateRestart.className = 'overlay tampil';
        }
    }

    // ==== Status koneksi & antrean pending ====

    async function segarkanStatus() {
        try {
            if (sedangModeOffline) {
                // Mode Offline SENGAJA tak pernah punya token (lihat JavaDoc login:coba-offline) --
                // pill "Tidak Ada Sesi" akan menyesatkan (terkesan error) padahal ini kondisi normal
                // yg memang dipilih kasir, jadi ditampilkan beda ("Mode Offline", bukan merah "offline").
                elStatusPill.className = 'status-pill offline';
                elStatusTeks.textContent = 'Mode Offline';
            } else {
                const status = await window.electronAPI.posAPI.status();
                const tersedia = !!(status && status.tersedia);
                elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
                elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
            }
        } catch (e) { /* biarkan status lama tampil -- kegagalan cek status bukan hal fatal */ }

        try {
            const pending = await window.electronAPI.localDb.listPending();
            if (pending && pending.length > 0) {
                elPendingBadge.style.display = 'flex';
                elPendingBadge.textContent = '\u{1F4E4} ' + pending.length + ' belum sinkron';
            } else {
                elPendingBadge.style.display = 'none';
            }
        } catch (e) { /* abaikan -- panel status bukan jalur kritis */ }
    }

    elBtnSync.addEventListener('click', async () => {
        elBtnSync.disabled = true;
        elBtnSync.textContent = 'Menyinkronkan...';
        try {
            const hasil = await window.electronAPI.posAPI.syncNow();
            if (hasil.disinkron > 0) {
                tampilkanToast('success', hasil.disinkron + ' transaksi berhasil disinkronkan.' + (hasil.gagal > 0 ? (' ' + hasil.gagal + ' gagal, coba lagi nanti.') : ''));
            } else if (hasil.gagal > 0) {
                tampilkanToast('error', hasil.gagal + ' transaksi gagal disinkronkan -- periksa detail di halaman web lengkap.');
            } else if (hasil.pesan) {
                tampilkanToast('error', hasil.pesan);
            } else {
                tampilkanToast('info', 'Tidak ada transaksi yang perlu disinkronkan.');
            }
        } catch (e) {
            tampilkanToast('error', 'Gagal menyinkronkan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSync.disabled = false;
            elBtnSync.innerHTML = '\u{1F504} Sinkronkan';
            segarkanStatus();
        }
    });

    // ==== Katalog & konfigurasi ====

    function renderKategori() {
        elKategoriRow.innerHTML = '';
        const semuaBtn = document.createElement('button');
        semuaBtn.className = 'kategori-pill' + (kategoriAktifId === null ? ' aktif' : '');
        semuaBtn.innerHTML = '✨ Semua';
        semuaBtn.addEventListener('click', () => { kategoriAktifId = null; stateProdukKasir.page = 1; renderKategori(); renderProduk(); });
        elKategoriRow.appendChild(semuaBtn);

        semuaKategori.forEach((k) => {
            const btn = document.createElement('button');
            btn.className = 'kategori-pill' + (kategoriAktifId === k.id ? ' aktif' : '');
            btn.textContent = tebakIkonKategori(k.nama) + ' ' + k.nama;
            btn.addEventListener('click', () => { kategoriAktifId = k.id; stateProdukKasir.page = 1; renderKategori(); renderProduk(); });
            elKategoriRow.appendChild(btn);
        });
    }

    function renderProduk() {
        const keyword = (elCariProduk.value || '').trim().toLowerCase();
        const daftar = semuaProduk.filter((p) => {
            if (kategoriAktifId !== null && p.kategoriId !== kategoriAktifId) return false;
            if (keyword && p.nama.toLowerCase().indexOf(keyword) < 0 && (p.kode || '').toLowerCase().indexOf(keyword) < 0 && (p.barcode || '').toLowerCase().indexOf(keyword) < 0) return false;
            return true;
        });

        const totalHal = Math.max(1, Math.ceil(daftar.length / stateProdukKasir.pageSize));
        if (stateProdukKasir.page > totalHal) stateProdukKasir.page = totalHal;
        if (stateProdukKasir.page < 1) stateProdukKasir.page = 1;
        const awal = (stateProdukKasir.page - 1) * stateProdukKasir.pageSize;
        const halamanIni = daftar.slice(awal, awal + stateProdukKasir.pageSize);

        elProdukGrid.innerHTML = '';
        renderPaginasiProdukKasir(daftar.length, totalHal);
        if (daftar.length === 0) {
            const kosong = document.createElement('div');
            kosong.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--faint);padding:40px;font-size:12.5px;';
            kosong.textContent = 'Tidak ada produk yang cocok.';
            elProdukGrid.appendChild(kosong);
            return;
        }

        halamanIni.forEach((p) => {
            const diKeranjang = cart.find((c) => c.id === p.id);
            const warna = warnaDariNama(p.nama);

            // Badge stok LIVE -- "Habis" (stok<=0) atau "Stok N" (stok<=5), pola sama persis dgn
            // ambang batas versi web (_pos.jsp/PosKantinAction) supaya kasir sadar barang mau habis
            // langsung dari kartu produk, tanpa harus buka tab "Produk & Inventaris" terpisah dulu.
            const stok = Number(p.stok) || 0;
            let badgeStokHtml = '';
            if (stok <= 0) badgeStokHtml = '<span class="badge-stok habis">Habis</span>';
            else if (stok <= 5) badgeStokHtml = '<span class="badge-stok kritis">Stok ' + stok + '</span>';

            const kartu = document.createElement('button');
            kartu.className = 'kartu-produk';
            kartu.innerHTML =
                (diKeranjang ? '<span class="badge-di-keranjang"></span>' : '') +
                badgeStokHtml +
                '<div class="avatar" style="background:' + warna + '"></div>' +
                '<div class="kategori-label"></div><div class="nama"></div><div class="harga"></div>';
            if (diKeranjang) kartu.querySelector('.badge-di-keranjang').textContent = diKeranjang.jumlah;
            kartu.querySelector('.avatar').textContent = inisialDariNama(p.nama);
            lampirkanGambarKeAvatar(kartu.querySelector('.avatar'), p.gambarUrl);
            kartu.querySelector('.kategori-label').textContent = p.kategoriNama || '';
            kartu.querySelector('.nama').textContent = p.nama;
            kartu.querySelector('.harga').textContent = formatRupiah(p.hargaJual);
            kartu.addEventListener('click', () => tambahKeKeranjang(p));
            elProdukGrid.appendChild(kartu);
        });
    }

    /** Footer "Sebelumnya/Berikutnya" utk grid produk Kasir, 25 produk/halaman (lihat stateProdukKasir). */
    function renderPaginasiProdukKasir(totalItem, totalHal) {
        if (!elPaginasiProdukKasir) return;
        elPaginasiProdukKasir.innerHTML = '';
        if (totalItem === 0) return;
        const halIni = stateProdukKasir.page;
        const info = document.createElement('span');
        info.textContent = 'Hal ' + halIni + '/' + totalHal + ' (' + totalItem + ' produk)';
        info.style.cssText = 'font-size:11.5px;color:var(--faint);margin-right:auto;';
        const wrapTombol = document.createElement('div');
        wrapTombol.className = 'tombol-hal';
        const btnMundur = document.createElement('button');
        btnMundur.className = 'btn-kecil';
        btnMundur.textContent = '‹ Sebelumnya';
        btnMundur.disabled = halIni <= 1;
        btnMundur.addEventListener('click', () => { stateProdukKasir.page--; renderProduk(); });
        const btnMaju = document.createElement('button');
        btnMaju.className = 'btn-kecil';
        btnMaju.textContent = 'Berikutnya ›';
        btnMaju.disabled = halIni >= totalHal;
        btnMaju.addEventListener('click', () => { stateProdukKasir.page++; renderProduk(); });
        wrapTombol.appendChild(btnMundur);
        wrapTombol.appendChild(btnMaju);
        elPaginasiProdukKasir.appendChild(info);
        elPaginasiProdukKasir.appendChild(wrapTombol);
    }

    /**
     * Fitur "Popup Pesanan Online Baru" -- dipoll berkala (bukan push) supaya kasir langsung tahu
     * begitu pembeli checkout online lewat {@code toko_online.jsp}, lihat JavaDoc lengkap di
     * {@code KantinHelper.pesananOnlineBaru} (server) utk penjelasan cara membedakan pesanan online
     * dari keranjang yang ditahan kasir sendiri. Panggilan PERTAMA hanya merekam baseline (id
     * tertinggi SAAT INI) -- TIDAK menampilkan popup, supaya kasir tak dibanjiri notifikasi utk
     * pesanan lama yang sudah menumpuk sebelum aplikasi ini dibuka.
     */
    async function cekPesananOnlineBaru() {
        try {
            const r = await window.electronAPI.posAPI.pesananOnlineBaru({ id_toko: tokoId, sejak_id: sejakIdPesananBaru || 0 });
            if (!r.ok || !r.data) return; // kegagalan (termasuk offline) diam-diam dicoba lagi siklus berikutnya
            const adalahBaseline = (sejakIdPesananBaru === null);
            sejakIdPesananBaru = Number(r.data.maksId) || 0;
            if (adalahBaseline) return;
            const daftar = r.data.pesanan || [];
            if (daftar.length === 0) return;

            elIsiPesananBaru.innerHTML = '';
            daftar.forEach((p) => {
                const item = document.createElement('div');
                item.className = 'pesanan-baru-item';
                item.innerHTML = '<div class="baris1"><span class="pembeli"></span><span class="waktu"></span></div>' +
                    '<div class="kode"></div><div class="barang"></div>';
                item.querySelector('.pembeli').textContent = p.pembeli || '-';
                item.querySelector('.waktu').textContent = p.waktu || '';
                item.querySelector('.kode').textContent = 'Kode: ' + (p.kode || '-');
                item.querySelector('.barang').textContent = p.barang || '-';
                elIsiPesananBaru.appendChild(item);
            });
            elOverlayPesananBaru.classList.add('tampil');
            tampilkanToast('info', 'Ada ' + daftar.length + ' pesanan online baru!');
        } catch (e) { /* diam-diam gagal -- coba lagi siklus berikutnya */ }
    }

    function mulaiPollingPesananBaru() {
        cekPesananOnlineBaru();
        setInterval(cekPesananOnlineBaru, 20000);
    }

    elBtnTutupPesananBaru.addEventListener('click', () => elOverlayPesananBaru.classList.remove('tampil'));
    elBtnLihatPesananBaru.addEventListener('click', () => { window.location.href = 'pesanan.html'; });

    /**
     * Kasir SEKARANG SELALU membaca katalog dari cache lokal (SQLite {@code produk_cache}, lihat
     * {@code local-db.js} fungsi {@code produkCacheUntukKasir} + IPC {@code pos:produk-cache-kasir})
     * -- BUKAN lagi memanggil server secara langsung -- supaya layar Kasir tetap ringan & tetap jalan
     * biar pun sedang offline. Kesegaran data dijamin oleh sinkron otomatis berkala (setiap 10 menit,
     * {@code mulaiSinkronProdukCacheBerkala} di main.js) yang berjalan app-wide sejak aplikasi dibuka,
     * jadi strip info di sini murni informatif, bukan peringatan seperti versi lama (fromCache).
     */
    function tampilkanInfoSumberData() {
        elInfoStrip.className = 'info-strip';
        elInfoStrip.textContent = 'Produk dimuat dari database lokal perangkat ini (disinkron otomatis tiap 10 menit).';
    }

    /**
     * Perbarui teks/progress-bar overlay {@code #layarMuat} sesuai event {@code pos:katalog-status}
     * (lihat JavaDoc {@code kirimStatusKatalog}/{@code unduhCacheGambarProduk} di main.js) -- inilah
     * jawaban langsung atas keluhan "loading lama tanpa keterangan apa pun, apakah dari lokal atau
     * server": teks & progress bar di bawah SELALU mencerminkan tahap yang SEDANG berjalan saat ini.
     * @param {{tipe:string, totalPerluUnduh?:number, sudahTercache?:number, selesai?:number, total?:number}} status
     */
    function segarkanLayarMuatDariStatus(status) {
        if (!status) return;
        switch (status.tipe) {
            case 'server-mulai':
                elLayarMuatTeks.textContent = 'Menghubungi server...';
                elLayarMuatProgressWrap.style.display = 'none';
                elLayarMuatProgressTeks.textContent = '';
                break;
            case 'cache-lokal':
                elLayarMuatTeks.textContent = 'Offline -- memuat data tersimpan terakhir dari perangkat ini...';
                elLayarMuatProgressWrap.style.display = 'none';
                elLayarMuatProgressTeks.textContent = '';
                break;
            case 'server-selesai':
                elLayarMuatTeks.textContent = 'Data diterima -- memeriksa gambar produk...';
                break;
            case 'gambar-mulai':
                if (!status.totalPerluUnduh) {
                    elLayarMuatTeks.textContent = 'Semua gambar produk sudah tersimpan di perangkat ini.';
                    elLayarMuatProgressWrap.style.display = 'none';
                    elLayarMuatProgressTeks.textContent = '';
                } else {
                    elLayarMuatTeks.textContent = 'Mengunduh gambar produk baru...';
                    elLayarMuatProgressWrap.style.display = 'block';
                    elLayarMuatProgressBar.style.width = '0%';
                    elLayarMuatProgressTeks.textContent = '0 / ' + status.totalPerluUnduh
                        + (status.sudahTercache ? ' (' + status.sudahTercache + ' lainnya sudah tersimpan lokal)' : '');
                }
                break;
            case 'gambar-progres': {
                const persen = status.total > 0 ? Math.round((status.selesai / status.total) * 100) : 100;
                elLayarMuatProgressBar.style.width = persen + '%';
                elLayarMuatProgressTeks.textContent = status.selesai + ' / ' + status.total + ' gambar diunduh (' + persen + '%)';
                break;
            }
            case 'gambar-selesai':
                elLayarMuatTeks.textContent = 'Menyiapkan tampilan kasir...';
                elLayarMuatProgressWrap.style.display = 'none';
                elLayarMuatProgressTeks.textContent = '';
                break;
        }
    }
    if (window.electronAPI && window.electronAPI.posAPI && window.electronAPI.posAPI.onKatalogStatus) {
        window.electronAPI.posAPI.onKatalogStatus(segarkanLayarMuatDariStatus);
    }

    /**
     * Terapkan field2 respons {@code konfigurasi} (baik dari cache TERSIMPAN maupun hasil live) ke
     * elemen2 UI Kasir -- dipisah dari alur fetch supaya logika yg SAMA bisa dipakai ulang baik utk
     * paint instan dari cache (lihat {@code muatKatalogDanKonfigurasi}) maupun refresh diam2 di latar
     * belakang begitu server benar2 terjangkau (lihat {@code segarkanKonfigurasiDiam}).
     * @param {object} data
     */
    function terapkanDataKonfigurasi(data) {
        pajakPersen = Number(data.pajakPersen) || 0;
        tokoId = data.tokoId;
        tokoNama = data.tokoNama || '';
        pesanTerimaKasih = data.pesanTerimaKasih || '';
        userId = data.userId || '';
        semuaCaraBayar = data.caraBayar || [];
        bolehTopup = !!data.bolehTopup;
        elBtnTopUpTopbar.style.display = bolehTopup ? 'flex' : 'none';
        isAdminAkun = !!data.isAdmin;
        elNamaToko.textContent = tokoNama || (userId ? ('Kasir - ' + userId) : 'Kasir');
        elLabelPajak.textContent = 'Pajak (' + pajakPersen + '%)';
        renderGridMetode();
    }

    /**
     * Gap-closure "layar Kasir masih terjebak di overlay 'Memuat...' saat server sedang restart":
     * {@code posAPI.konfigurasi()} live HARUS mencoba jaringan dulu (perlu percobaan gagal utk tahu
     * "offline") sebelum boleh jatuh ke cache -- selama server restart, percobaan itu bisa menggantung
     * sampai batas waktu penuh. Dipanggil TANPA di-await oleh {@code muatKatalogDanKonfigurasi} (fire
     * lalu lupakan) SETELAH overlay sudah ditutup, supaya sinkron live/daftar toko/status sesi kas
     * berjalan murni di latar belakang -- tidak pernah lagi menahan tampilan awal Kasir.
     */
    async function segarkanKonfigurasiDiam() {
        try {
            const hasilKonfig = await window.electronAPI.posAPI.konfigurasi();
            if (!hasilKonfig.ok) return;
            terapkanDataKonfigurasi(hasilKonfig.data);
            // Multi-Toko: gagal/offline diamkan sepenuhnya -- daftarTokoSaya tetap [] (kosong), yg
            // berarti Kasir jatuh ke perilaku toko-tunggal lama tanpa kombo sama sekali, BUKAN
            // memblokir layar hanya krn fitur tambahan ini tak terjangkau.
            try {
                const hasilDaftarToko = await window.electronAPI.posAPI.daftarTokoSaya();
                if (hasilDaftarToko.ok && hasilDaftarToko.data) {
                    daftarTokoSaya = hasilDaftarToko.data.data || [];
                    // Belum pernah pilih toko (tokoAktifId server masih null) -- topbar jangan
                    // menampilkan nama toko "rumah" lama yg berpotensi menyesatkan, ganti label
                    // netral sampai kasir benar-benar memilih lewat overlay Buka Kas.
                    if (daftarTokoSaya.length > 1 && hasilDaftarToko.data.tokoAktifId == null) {
                        elNamaToko.textContent = 'Pilih Toko';
                    }
                }
            } catch (eDaftarToko) { /* diamkan, lihat komentar di atas */ }
            muatStatusSesiKas();
            mulaiPollingPesananBaru();
        } catch (e) { /* offline/gagal -- diam2, cache/UI lama (bila ada) tetap dipakai apa adanya */ }
    }

    async function muatKatalogDanKonfigurasi() {
        // Paint SEGERA dari data LOKAL SAJA (produk_cache + konfigurasi cache tersimpan) -- TIDAK
        // pernah menunggu jaringan di sini, supaya Kasir tetap langsung terpakai walau server sedang
        // restart/offline. Sinkron live (konfigurasi terbaru + daftar toko + status sesi kas) tetap
        // berjalan, tapi di LATAR BELAKANG setelah overlay ini ditutup -- lihat segarkanKonfigurasiDiam.
        elLayarMuat.className = 'layar-penuh';
        elLayarMuatTeks.textContent = 'Memuat data tersimpan...';
        elLayarMuatProgressWrap.style.display = 'none';
        elLayarMuatProgressTeks.textContent = '';
        try {
            const [hasilKatalog, hasilKonfigCache] = await Promise.all([
                window.electronAPI.posAPI.katalogKasirLokal(),
                window.electronAPI.posAPI.konfigurasiCacheBaca()
            ]);

            if (!hasilKatalog.ok) {
                window.PesanDetail.tampilkanDariHasil(hasilKatalog);
            } else {
                semuaKategori = hasilKatalog.data.kategori || [];
                semuaProduk = hasilKatalog.data.produk || [];
                stateProdukKasir.page = 1;
                tampilkanInfoSumberData();
                renderKategori();
                renderProduk();
            }

            if (hasilKonfigCache.ok && hasilKonfigCache.data) {
                terapkanDataKonfigurasi(hasilKonfigCache.data);
            }
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
        // Gap-closure "kotak pencarian belum fokus saat layar Kasir pertama kali dibuka": panggilan
        // {@code pastikanFokusPencarian()} yg SUDAH ADA (dipanggil dari {@code terapkanModeLayout} saat
        // boot) terjadi SEBELUM ini -- pada saat itu overlay {@code #layarMuat} MASIH tampil (baru saja
        // di-set di atas fungsi ini), jadi {@link adaOverlayAktif} membatalkannya. Begitu overlay
        // BENAR2 tertutup (baris di atas), WAJIB dipanggil ULANG di sini -- kalau tidak, kotak
        // pencarian baru dapat fokus setelah kasir tak sengaja memicu suatu focusout di tempat lain.
        pastikanFokusPencarian();

        segarkanKonfigurasiDiam();
    }

    /**
     * Segarkan katalog produk di LATAR BELAKANG, TANPA layar muat penuh -- {@code
     * muatKatalogDanKonfigurasi} di atas hanya dipanggil SEKALI saat boot, jadi {@code semuaProduk}
     * yang dipegang renderer ini jadi snapshot beku selama sesi kasir berjalan (produk baru/diedit
     * admin di layar Produk -- termasuk toggle "Boleh Dijual Walau Stok Minus" atau perubahan
     * kode/barcode -- tidak pernah terlihat sampai aplikasi ditutup-buka ulang). Dipanggil berkala
     * (lihat {@code setInterval} di bawah) supaya kartu produk + hasil scan barcode selalu mengikuti
     * data terbaru tanpa mengganggu kasir yang sedang melayani transaksi (tidak ada overlay/loading,
     * tidak mereset keranjang/pencarian yang sedang diketik -- {@code renderProduk}/{@code
     * renderSearchDropdown} membaca ulang {@code elCariProduk.value} scr langsung jadi filter yg
     * sedang aktif otomatis tetap terjaga). Gagal (mis. sedang offline) diam-diam diabaikan -- ini
     * bukan jalur kritis, percobaan berikutnya akan mencoba lagi.
     */
    async function segarkanKatalogDiam() {
        try {
            const hasilKatalog = await window.electronAPI.posAPI.katalogKasirLokal();
            if (!hasilKatalog.ok) return;
            semuaKategori = hasilKatalog.data.kategori || [];
            semuaProduk = hasilKatalog.data.produk || [];
            renderKategori();
            renderProduk();
            renderSearchDropdown();
        } catch (e) { /* abaikan -- bukan jalur kritis, coba lagi siklus berikutnya */ }
    }
    setInterval(segarkanKatalogDiam, 60000);

    elCariProduk.addEventListener('input', () => { renderProduk(); renderSearchDropdown(); });
    elCariProduk.addEventListener('focus', renderSearchDropdown);
    // Delay singkat sebelum menyembunyikan dropdown saat blur -- supaya klik pada baris hasil (yg
    // juga memicu blur pada input) sempat terdaftar oleh browser SEBELUM dropdown-nya hilang.
    elCariProduk.addEventListener('blur', () => setTimeout(sembunyikanSearchDropdown, 150));
    elCariProduk.addEventListener('keydown', (event) => { if (event.key === 'Escape') sembunyikanSearchDropdown(); });

    /**
     * Fitur "Scan Barcode" -- pemindai barcode/USB-HID mengetik karakter kode SUPER cepat lalu
     * mengirim Enter di akhir (perilaku standar semua scanner kelas kasir) -- dideteksi lewat event
     * {@code keydown} pada kotak cari yg SAMA (bukan input terpisah, supaya kasir bisa scan ATAU
     * ketik cari manual dari kotak yg sama persis). Kalau kode yg discan cocok PERSIS (bukan
     * sekadar mengandung) dgn {@code kode} SATU produk, produk itu langsung masuk keranjang DAN
     * kotak cari langsung dikosongkan -- kasir bisa langsung scan barang berikutnya tanpa perlu
     * menghapus teks lama secara manual dulu.
     *
     * <p>Kalau tak ada yg cocok PERSIS, kotak TETAP dikosongkan bila teksnya "berbentuk barcode"
     * (murni digit, &gt;=8 karakter -- ciri khas EAN-8/UPC-A/EAN-13 yg dipakai scanner kelas kasir),
     * supaya kasir tak perlu pencet backspace manual tiap kali scan barang yg kebetulan belum ada di
     * katalog/blm sempat disinkron. Hasil filter "Tidak ada produk yang cocok" tetap sempat tampil
     * sesaat sebelum dikosongkan, jadi kasir masih lihat notifnya. Kalau teksnya BUKAN pola barcode
     * (mis. kasir memang lagi mengetik cari manual lalu tak sengaja menekan Enter), kotak TIDAK
     * dikosongkan -- hasil filter pencarian tetap ditampilkan spt biasa supaya teks ketikan tak hilang.
     */
    elCariProduk.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const kodeScan = (elCariProduk.value || '').trim().toLowerCase();
        if (!kodeScan) return;
        const cocokPersis = semuaProduk.find((p) => (p.kode || '').toLowerCase() === kodeScan || (p.barcode || '').toLowerCase() === kodeScan);
        const berbentukBarcode = /^[0-9]{8,}$/.test(kodeScan);
        if (cocokPersis) {
            tambahKeKeranjang(cocokPersis);
        }
        if (cocokPersis || berbentukBarcode) {
            elCariProduk.value = '';
            renderProduk();
            sembunyikanSearchDropdown();
        }
        // Gap-closure: scanner barcode fisik cuma "mengetik" karakter ke kotak yg sedang fokus, TANPA
        // pernah mengosongkannya sendiri -- kalau baris di atas TIDAK mengosongkan (kode tak cocok
        // produk manapun DAN bukan pola barcode angka, mis. kasir sedang mengetik cari manual atau
        // scan barcode alfanumerik yg belum lolos regex), teks lama itu tertinggal di kotak. Scan
        // BERIKUTNYA lalu numpuk NYAMBUNG di belakang teks lama (mis. "KOPIBARANG2" bukan "BARANG2"
        // yg sungguhan dipindai) krn scanner tidak tahu soal "replace", ia cuma "ketik lalu Enter".
        // Select-all di sini membuat karakter scan berikutnya OTOMATIS menimpa seleksi ini (perilaku
        // baku elemen <input> saat mengetik sementara ada teks terseleksi) -- aman dipanggil juga saat
        // kotak sudah kosong (no-op, tak menyeleksi apa pun).
        elCariProduk.focus();
        elCariProduk.select();
    });

    /**
     * "Banbox" pencarian di mode Fokus Keranjang -- kotak produk (yg biasanya JADI hasil pencarian
     * visual) disembunyikan di mode ini, jadi kotak cari BUTUH cara lain menampilkan hasil selain
     * kartu barcode-scan-langsung yg sudah ada (lihat listener {@code keydown} elCariProduk di atas).
     * Dropdown ini murni tampilan tambahan -- filter kata kuncinya SAMA PERSIS dgn {@link renderProduk}
     * (nama ATAU kode), cuma dirender sbg daftar klik-tambah, bukan grid kartu.
     *
     * DIDEKLARASIKAN DI SINI (sebelum {@code terapkanModeLayout} di bawah) SENGAJA -- fungsi itu
     * memanggil {@code sembunyikanSearchDropdown()} langsung saat inisialisasi halaman (baris
     * {@code terapkanModeLayout(modeLayoutTersimpan)}), jadi {@code elSearchDropdown} WAJIB sudah
     * terinisialisasi (bukan cuma di-hoist spt deklarasi function) sebelum titik panggilan itu --
     * kalau dipindah ke bawah, meledak {@code ReferenceError: Cannot access 'elSearchDropdown' before
     * initialization} (TDZ {@code const}, pernah terjadi -- jangan diulang).
     */
    const elSearchDropdown = document.getElementById('searchDropdown');

    /**
     * Hasil dropdown pencarian yg SEDANG tampil, urutan sama persis dgn baris yg dirender -- disimpan di
     * luar {@code renderSearchDropdown} supaya listener {@code keydown} pintasan angka (di bawah) bisa
     * merujuk baris ke-N tanpa merender ulang/query ulang produk.
     * @type {object[]}
     */
    let daftarHasilPencarianTerkini = [];

    function sembunyikanSearchDropdown() {
        elSearchDropdown.classList.remove('tampil');
        elSearchDropdown.innerHTML = '';
        daftarHasilPencarianTerkini = [];
    }

    function pilihHasilPencarian(p) {
        tambahKeKeranjang(p);
        elCariProduk.value = '';
        sembunyikanSearchDropdown();
        elCariProduk.focus();
    }

    function renderSearchDropdown() {
        if (modeLayoutAktif !== 'keranjang-penuh') { sembunyikanSearchDropdown(); return; }
        const keyword = (elCariProduk.value || '').trim().toLowerCase();
        if (!keyword) { sembunyikanSearchDropdown(); return; }
        const daftar = semuaProduk.filter((p) => {
            if (kategoriAktifId !== null && p.kategoriId !== kategoriAktifId) return false;
            return p.nama.toLowerCase().indexOf(keyword) >= 0 || (p.kode || '').toLowerCase().indexOf(keyword) >= 0;
        }).slice(0, 30);
        daftarHasilPencarianTerkini = daftar;

        if (daftar.length === 0) {
            elSearchDropdown.innerHTML = '<div class="kosong-hasil">Tidak ada produk yang cocok.</div>';
        } else {
            elSearchDropdown.innerHTML = '';
            daftar.forEach((p, idx) => {
                // Pintasan angka HANYA utk 10 baris teratas (1-9 lalu 0 utk baris ke-10) -- satu tombol
                // = satu tekan, tanpa perlu Enter/jeda. Baris ke-11 dst tetap bisa dipilih via klik/mouse
                // apa adanya, cukup jarang perlu dijangkau lewat keyboard.
                const nomorPintasan = idx < 9 ? String(idx + 1) : (idx === 9 ? '0' : '');
                const baris = document.createElement('button');
                baris.type = 'button';
                baris.className = 'baris-hasil';
                baris.innerHTML = '<div class="nomor-hasil"></div><div class="avatar-mini-hasil"></div><div class="info-hasil"><div class="n"></div><div class="k"></div></div><div class="harga-hasil"></div>';
                baris.querySelector('.nomor-hasil').textContent = nomorPintasan;
                baris.querySelector('.avatar-mini-hasil').style.background = warnaDariNama(p.nama);
                baris.querySelector('.avatar-mini-hasil').textContent = inisialDariNama(p.nama);
                baris.querySelector('.n').textContent = p.nama;
                baris.querySelector('.k').textContent = (p.kode || '') + (Number(p.stok) <= 0 ? ' · Habis' : '');
                baris.querySelector('.harga-hasil').textContent = formatRupiah(p.hargaJual);
                // Gap-closure "klik mouse tidak memilih (padahal Ctrl+angka bisa)": dipasang di {@code
                // mousedown} + {@code preventDefault()} (BUKAN {@code click}) -- mousedown pada
                // <button> SECARA DEFAULT merebut fokus dari elCariProduk lebih dulu, memicu blur/
                // focusout yg lalu berlomba dgn {@link pastikanFokusPencarian} (kotak pencarian selalu
                // fokus, lihat JavaDoc di sana) utk merebut fokus balik -- pada mesin/koneksi tertentu
                // perlombaan itu bisa menang SEBELUM event {@code click} sempat terdaftar, membuat baris
                // terlihat responsif (hover jalan) tapi klik tak berefek. preventDefault() di mousedown
                // mencegah fokus berpindah SAMA SEKALI, jadi tak ada blur yg perlu dilombakan.
                baris.addEventListener('mousedown', (event) => { event.preventDefault(); pilihHasilPencarian(p); });
                elSearchDropdown.appendChild(baris);
            });
        }
        elSearchDropdown.classList.add('tampil');
    }

    /**
     * Pintasan Ctrl+angka ("Ctrl+1".."Ctrl+9","Ctrl+0") di kotak pencarian -- begitu dropdown hasil
     * tampil, tekan Ctrl+angka yg tertera di baris (lihat {@code nomor-hasil} di atas) utk langsung
     * menambahkannya ke keranjang, tanpa mouse. Dipilih Ctrl+angka (BUKAN angka polos) supaya TIDAK
     * PERNAH bentrok dgn ketikan biasa -- kotak ini jg dipakai cari produk BY KODE NUMERIK, jadi angka
     * polos wajib selalu bisa diketik apa adanya. Pola yg SAMA dipakai jg di Pilih Member ({@code
     * elCariMemberModal}) dan Metode Pembayaran ({@code elOverlayMetode}) di bawah -- konsisten di
     * SEMUA pencarian/pemilihan di layar Kasir.
     */
    elCariProduk.addEventListener('keydown', (event) => {
        if (!event.ctrlKey) return;
        if (!elSearchDropdown.classList.contains('tampil')) return;
        if (!/^[0-9]$/.test(event.key)) return;
        const idx = event.key === '0' ? 9 : (Number(event.key) - 1);
        const p = daftarHasilPencarianTerkini[idx];
        if (!p) return;
        event.preventDefault();
        pilihHasilPencarian(p);
    });

    /**
     * Mode tampilan "Fokus Keranjang" vs "Normal" -- permintaan kasir yg mengoperasikan layar kecil/
     * ingin fokus penuh ke keranjang tanpa kotak produk mengganggu. HANYA memindah kelas CSS + kotak
     * pencarian (elCariProduk) SECARA FISIK (bukan duplikat) antara topbar dan slot di dalam panel
     * keranjang -- listener scan barcode yg sudah terpasang di elCariProduk (di atas) TETAP jalan apa
     * adanya di kedua mode karena node DOM-nya sama persis, cuma pindah induk. Preferensi disimpan di
     * localStorage (murni UI, tak perlu ikut config server) supaya tetap dalam mode yg sama tiap buka
     * aplikasi.
     */
    const elBodyPos = document.getElementById('bodyPos');
    const elSearchBoxWrap = document.getElementById('searchBoxWrap');
    const elSearchBoxSlotKeranjang = document.getElementById('searchBoxSlotKeranjang');
    const elBtnModeKeranjangPenuh = document.getElementById('btnModeKeranjangPenuh');
    const elBtnModeNormal = document.getElementById('btnModeNormal');
    const elBtnToggleFullLayarHeader = document.getElementById('btnToggleFullLayarHeader');
    const KUNCI_MODE_LAYOUT = 'pos_mode_layout';
    let modeLayoutAktif = 'normal';

    function terapkanModeLayout(mode) {
        const penuh = mode === 'keranjang-penuh';
        modeLayoutAktif = mode;
        elBodyPos.classList.toggle('mode-keranjang-penuh', penuh);
        elBtnModeKeranjangPenuh.style.display = penuh ? 'none' : 'inline-flex';
        elBtnModeNormal.style.display = penuh ? 'inline-flex' : 'none';
        elBtnToggleFullLayarHeader.innerHTML = '<span class="tombol-fkey">F7</span>' + (penuh ? '&#9638; <span data-i18n="Tampilan Normal">Tampilan Normal</span>' : '&#128722; <span data-i18n="Full Layar">Full Layar</span>');
        elBtnToggleFullLayarHeader.title = penuh ? 'Tampilan normal -- produk + keranjang' : 'Tampilan keranjang penuh -- sembunyikan kotak produk, cari lewat scan/nama/kode';
        // Pindahkan NODE ASLI (bukan klona) -- listener scan barcode yg sudah terpasang tetap ikut.
        (penuh ? elSearchBoxSlotKeranjang : document.querySelector('.topbar')).insertBefore(
            elSearchBoxWrap,
            penuh ? null : elBtnModeKeranjangPenuh
        );
        sembunyikanSearchDropdown();
        try { localStorage.setItem(KUNCI_MODE_LAYOUT, mode); } catch (e) { /* abaikan -- murni preferensi tampilan */ }
        pastikanFokusPencarian();
    }

    /**
     * Ramah barcode scanner: kotak pencarian WAJIB selalu siap menerima ketikan scanner TANPA kasir
     * perlu klik dulu -- scanner fisik mengetik karakter+Enter ke elemen manapun yg SEDANG fokus, jadi
     * begitu fokus "lepas" ke sesuatu yg bukan field isian (klik area kosong/kartu produk/tombol),
     * kotak pencarian segera direbut fokusnya kembali. Berlaku di KEDUA mode tampilan (Normal maupun
     * Fokus Keranjang) -- awalnya hanya mode Fokus Keranjang, diperluas krn kasir yg pakai mode Normal
     * pun ingin pengalaman scan yg sama tanpa perlu klik field dulu. SENGAJA tidak mengganggu field lain
     * yg memang sedang diisi kasir (mis. Uang Diterima, kolom modal Alasan Pembatalan/Top Up) -- hanya
     * bertindak kalau elemen yg baru menerima fokus BUKAN input/textarea/select/contenteditable, DAN
     * tidak ada overlay/modal yg sedang terbuka (lihat {@link adaOverlayAktif}).
     */
    function pastikanFokusPencarian() {
        if (adaOverlayAktif()) return;
        const aktif = document.activeElement;
        if (aktif === elCariProduk) return;
        const tag = aktif ? aktif.tagName : '';
        const sedangDiInputLain = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (aktif && aktif.isContentEditable);
        if (!sedangDiInputLain) elCariProduk.focus();
    }
    document.addEventListener('focusout', () => setTimeout(pastikanFokusPencarian, 50));

    elBtnModeKeranjangPenuh.addEventListener('click', () => terapkanModeLayout('keranjang-penuh'));
    elBtnModeNormal.addEventListener('click', () => terapkanModeLayout('normal'));
    elBtnToggleFullLayarHeader.addEventListener('click', () => terapkanModeLayout(modeLayoutAktif === 'keranjang-penuh' ? 'normal' : 'keranjang-penuh'));

    let modeLayoutTersimpan = 'normal';
    try { modeLayoutTersimpan = localStorage.getItem(KUNCI_MODE_LAYOUT) || 'normal'; } catch (e) { /* abaikan */ }
    terapkanModeLayout(modeLayoutTersimpan);

    // ==== Pintasan Keyboard F1-F9 -- kasir bekerja cepat tanpa mouse (label "F1".."F9" ditampilkan
    // langsung di tombol masing2, lihat pos.html) ====

    /**
     * Deteksi modal/overlay APA PUN yg sedang terbuka di layar Kasir -- dipakai pintasan F1-F9 + auto-
     * fokus pencarian ({@link pastikanFokusPencarian}) supaya TIDAK ikut memicu aksi atau mencuri fokus
     * saat kasir sedang mengisi modal lain (Pilih Metode, Picker Member, Sesi Kas, Update Sistem, dst --
     * semuanya memakai class bersama {@code .overlay.tampil}), atau saat layar sukses/muat penuh sedang
     * tampil.
     */
    function adaOverlayAktif() {
        if (document.querySelector('.overlay.tampil')) return true;
        if (elLayarSukses.classList.contains('tampil')) return true;
        if (elLayarMuat.className.indexOf('tersembunyi') === -1) return true;
        return false;
    }

    /**
     * Peta tombol F1-F9 -- fungsi (bukan elemen langsung) supaya tombol yg elemennya dipindah-pindah DOM
     * (mis. {@code elCariProduk}, tidak relevan di sini tapi pola sama) atau baru dirender belakangan
     * tetap ambil rujukan TERBARU. F1 Bantuan, F2 Bayar, F3 Tahan Keranjang, F4 Pilih Metode Pembayaran,
     * F5 Pilih Member, F6 Buka Laci, F7 Full Layar/Tampilan Normal, F8 Sinkronkan, F9 Layar Pelanggan --
     * urutan mengikuti alur kerja kasir yg paling sering dipakai duluan (checkout) ke yg jarang.
     */
    const PINTASAN_F_KEY = {
        F1: () => document.getElementById('btnBantuan'),
        F2: () => elBtnBayar,
        F3: () => elBtnTahanKeranjang,
        F4: () => elBtnPilihMetode,
        F5: () => elBtnBukaPickerMember,
        F6: () => elBtnBukaLaci,
        F7: () => elBtnToggleFullLayarHeader,
        F8: () => elBtnSync,
        F9: () => elBtnLayarPelanggan
    };
    document.addEventListener('keydown', (event) => {
        const ambilTombol = PINTASAN_F_KEY[event.key];
        if (!ambilTombol) return;
        event.preventDefault();
        if (adaOverlayAktif()) return;
        const tombol = ambilTombol();
        if (tombol && !tombol.disabled) tombol.click();
    });

    /**
     * ESC batal / Enter OK -- SEMUA popup (elemen {@code .overlay}) di layar Kasir, biar konsisten
     * (permintaan kasir: "semua popup kalau klik ESC harus keluar/batal, kalau klik Enter lalu OK").
     * Dipetakan per-overlay krn tiap modal beda tombol "tutup"/"OK"-nya -- modal berbasis pilih-dari-
     * daftar (Pilih Member, Pilih Metode Pembayaran) SENGAJA tidak dipetakan {@code ok}-nya di sini krn
     * "OK"-nya justru pintasan Ctrl+angka yg sudah ada sendiri (lihat listener keydown {@code
     * elCariMemberModal}/{@code elOverlayMetode} masing2) -- Enter polos di kotak cari situ dibiarkan
     * TANPA efek supaya tidak salah pilih member/metode secara tak sengaja.
     */
    const PETA_OVERLAY_ESC_ENTER = [
        { overlay: elOverlayMetode, tutup: elBtnTutupMetode },
        { overlay: elOverlayPickerMember, tutup: elBtnTutupPickerMember },
        { overlay: elOverlayUpdate, tutup: elBtnTutupUpdate, ok: elBtnUpdateAksi },
        { overlay: elOverlayTawaranUpdate, tutup: elBtnTutupTawaranUpdate, ok: elBtnTawaranUpdateSekarang },
        { overlay: elOverlayUpdateRestart, tutup: elBtnTutupUpdateRestart, ok: elBtnRestartSekarang },
        { overlay: elOverlaySesiKas, tutup: elBtnTutupSesiKas },
        { overlay: elOverlayPinKasir, tutup: elBtnBatalPinKasir, ok: elBtnSubmitPinKasir },
        { overlay: elOverlayAkunSaya, tutup: elBtnTutupAkunSaya },
        { overlay: elOverlayTopUpMandiri, tutup: elBtnTutupTopUpMandiri },
        { overlay: elOverlayPesananBaru, tutup: elBtnTutupPesananBaru, ok: elBtnLihatPesananBaru }
    ];
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' && event.key !== 'Enter') return;
        const overlayAktif = document.querySelector('.overlay.tampil');
        if (!overlayAktif) return;
        const peta = PETA_OVERLAY_ESC_ENTER.find((p) => p.overlay === overlayAktif);
        if (!peta) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (peta.tutup) peta.tutup.click();
            return;
        }
        // Enter -- JANGAN dipicu kalau fokus sedang di textarea (Enter dipakai utk baris baru di sana)
        // atau tombol (Enter di tombol yg fokus sudah otomatis memicu klik native, tak perlu campur
        // tangan lagi -- kalau tetap dipaksa, dobel-klik).
        const aktif = document.activeElement;
        if (aktif && (aktif.tagName === 'TEXTAREA' || aktif.tagName === 'BUTTON')) return;
        if (peta.ok && !peta.ok.disabled) { event.preventDefault(); peta.ok.click(); }
    });

    // ==== Fitur "Sesi Kasir" (Buka/Tutup Kas) -- mesin sama dgn versi JSP/ZK (SesiKasUtil di server) ====

    async function muatStatusSesiKas() {
        try {
            const r = await window.electronAPI.posAPI.sesiKas.status({ id_toko: tokoId });
            sesiKasInfo = (r.ok && r.data) ? r.data : { terbuka: false };
        } catch (e) {
            sesiKasInfo = { terbuka: false };
        }
        if (sesiKasInfo.terbuka) {
            // belumSinkron: sesi ini masih tersimpan LOKAL saja (lihat JavaDoc "Sesi Kasir offline-first"
            // di main.js) -- angka kasSaatIni sementara cuma modal awal (belum termasuk penjualan
            // berjalan, itu baru terisi setelah server berhasil disinkron di latar) -- diberi tanda kecil
            // spy kasir tak bingung kalau angkanya "berubah sendiri" begitu sinkron tuntas.
            elBtnSesiKas.textContent = '💰 ' + formatRupiah(sesiKasInfo.kasSaatIni) + (sesiKasInfo.belumSinkron ? ' ⏳' : '');
            elBtnSesiKas.title = sesiKasInfo.belumSinkron
                ? 'Sesi kas tersimpan di perangkat ini, menunggu tersinkron ke server (otomatis begitu online).'
                : '';
            elBtnSesiKas.classList.remove('ada-update');
            // Sesi kas RESMI sudah terbuka -- override darurat (kalau sempat dipakai) tidak relevan lagi.
            if (overrideDaruratTanpaSesiKas) {
                overrideDaruratTanpaSesiKas = false;
                elBannerDaruratKas.className = 'banner-darurat-kas';
            }
        } else {
            // Reuse gaya "ada-update" (oranye) -- kas tertutup butuh perhatian kasir, sama spt update tersedia.
            elBtnSesiKas.textContent = '💰 Kas Tertutup';
            elBtnSesiKas.classList.add('ada-update');
        }
        if (elOverlaySesiKas.classList.contains('tampil')) renderIsiSesiKas();

        // Butir 1/7 spesifikasi "dashboard kasir": kasir WAJIB buka sesi kas dulu sebelum bisa
        // berjualan, dan tampilan barang jadi terkunci lagi begitu sesi ditutup -- overlay ini
        // menutup TOTAL area kartu produk (bukan cuma memberi peringatan) selama kas tertutup.
        // `overrideDaruratTanpaSesiKas` sengaja BISA melewati overlay ini (tombol "Tutup" darurat),
        // TAPI tidak mengubah `sesiKasInfo.terbuka` itu sendiri -- lihat guard lain yg memakai flag ini.
        elKasTertutupOverlay.className = 'kas-tertutup-overlay' + ((sesiKasInfo.terbuka || overrideDaruratTanpaSesiKas) ? '' : ' tampil');
        segarkanKembalianDanTombol();
    }

    elBtnTutupOverlayKasDarurat.addEventListener('click', () => {
        const lanjut = confirm(
            'Lewati pengecekan sesi kas sementara?\n\n' +
            'Transaksi selama mode ini TIDAK akan tercatat dalam sesi kas resmi -- total penjualan ' +
            'tunai/non-tunai dan selisih kasir saat "Tutup Kas" nanti TIDAK akan menghitung transaksi ' +
            'periode ini.\n\nGunakan HANYA utk keadaan mendesak (mis. server belum bisa dihubungi utk ' +
            'membuka sesi kas resmi), lalu buka sesi kas resmi begitu memungkinkan.'
        );
        if (!lanjut) return;
        overrideDaruratTanpaSesiKas = true;
        elKasTertutupOverlay.className = 'kas-tertutup-overlay';
        elBannerDaruratKas.className = 'banner-darurat-kas tampil';
        segarkanKembalianDanTombol();
    });

    /**
     * `<input type="number">` di beberapa lingkungan Windows (kombinasi driver keyboard/IME
     * tertentu) pernah dilaporkan diam-diam menolak keystroke digit biasa walau tombol
     * spinner naik/turun bawaan browser tetap berfungsi (spinner tidak lewat jalur keyboard
     * sama sekali). Supaya kasir tidak pernah terjebak kondisi itu, field nominal di modal
     * Sesi Kasir dipakaikan `type="text" inputmode="numeric"` + penyaring karakter non-digit
     * ini -- tidak bergantung pada validasi bawaan `type="number"` yang bisa berperilaku
     * berbeda antar lingkungan.
     * @param {HTMLInputElement} el
     */
    function escapeHtmlLokal(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function jadikanInputAngka(el) {
        el.addEventListener('input', () => {
            const bersih = el.value.replace(/[^0-9]/g, '');
            if (bersih !== el.value) el.value = bersih;
        });
    }

    function renderIsiSesiKas() {
        if (!sesiKasInfo.terbuka) {
            // Multi-Toko: kombo WAJIB dipilih dulu (tidak ada opsi kosong/default) sebelum "Buka Kas"
            // bisa ditekan -- lihat JavaDoc `daftarTokoSaya`. Kasir toko-tunggal (kasus umum) sama
            // sekali tidak melihat baris ini (daftarTokoSaya.length <= 1).
            const htmlPilihToko = daftarTokoSaya.length > 1
                ? '<div class="field"><label>Toko</label><select id="selectTokoSesiKas">' +
                    '<option value="">-- Pilih Toko --</option>' +
                    daftarTokoSaya.map((t) => '<option value="' + t.id + '"' + (String(t.id) === String(tokoId) ? ' selected' : '') + '>' + escapeHtmlLokal(t.nama) + '</option>').join('') +
                    '</select></div>'
                : '';
            elIsiSesiKas.innerHTML =
                '<div class="sesikas-status tutup">Kas sedang tertutup. Isi modal awal untuk memulai sesi kas.</div>' +
                htmlPilihToko +
                '<div class="field"><label>Modal Awal (Rp)</label><input type="text" inputmode="numeric" id="inputModalAwalSesiKas" value="0"></div>' +
                '<div class="field"><label>Keterangan</label><input type="text" id="inputKetSesiKas"></div>' +
                '<button type="button" class="btn-sesikas-aksi" id="btnSubmitSesiKas">Buka Kas</button>';
            document.getElementById('btnSubmitSesiKas').addEventListener('click', submitBukaKas);
            const elModalAwal = document.getElementById('inputModalAwalSesiKas');
            jadikanInputAngka(elModalAwal);
            if (daftarTokoSaya.length > 1) {
                document.getElementById('selectTokoSesiKas').focus();
            } else {
                elModalAwal.focus();
                elModalAwal.select();
            }
        } else {
            const waktu = sesiKasInfo.waktuBuka ? new Date(sesiKasInfo.waktuBuka) : null;
            const waktuStr = (waktu && !isNaN(waktu.getTime())) ? (' sejak ' + waktu.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : '';
            const seharusnya = (Number(sesiKasInfo.modalAwal) || 0) + (Number(sesiKasInfo.totalTunai) || 0);
            elIsiSesiKas.innerHTML =
                '<div class="sesikas-status buka">Kas terbuka' + waktuStr + '</div>' +
                '<div class="sesikas-kpi">' +
                '<div><div class="lbl">Modal Awal</div><div class="val">' + formatRupiah(sesiKasInfo.modalAwal) + '</div></div>' +
                '<div><div class="lbl">Penjualan Tunai</div><div class="val">' + formatRupiah(sesiKasInfo.totalTunai) + '</div></div>' +
                '<div><div class="lbl">Non Tunai</div><div class="val">' + formatRupiah(sesiKasInfo.totalNonTunai) + '</div></div>' +
                '<div><div class="lbl">Kas Seharusnya</div><div class="val">' + formatRupiah(seharusnya) + '</div></div>' +
                '</div>' +
                '<div class="field"><label>Uang Fisik (Rp)</label><input type="text" inputmode="numeric" id="inputUangFisikSesiKas" value="' + Math.round(seharusnya) + '"></div>' +
                '<div class="field"><label>Keterangan</label><input type="text" id="inputKetSesiKas"></div>' +
                '<button type="button" class="btn-sesikas-aksi tutup" id="btnSubmitSesiKas">Tutup Kas</button>';
            document.getElementById('btnSubmitSesiKas').addEventListener('click', submitTutupKas);
            const elUangFisik = document.getElementById('inputUangFisikSesiKas');
            jadikanInputAngka(elUangFisik);
            elUangFisik.focus();
            elUangFisik.select();
        }
    }

    /**
     * Setelah server membalas {@code sesi_kas_buka}/{@code sesi_kas_tutup} "berhasil", pengecekan
     * {@code sesi_kas_status} BERIKUTNYA seharusnya langsung mencerminkan kondisi baru -- tapi di
     * lapangan pernah ditemukan (dgn bukti log server menunjukkan commit SUKSES) status re-check
     * SEGERA setelahnya masih melaporkan kondisi LAMA. Ini bukan bug penyimpanan (baris sudah
     * permanen di database, terbukti dari log server) melainkan DUGAAN latensi visibilitas
     * baca-setelah-tulis di sisi infrastruktur (mis. connection pool/replika baca) -- sesuatu yg TAK
     * BISA diperbaiki dari kode klien, tapi BISA diserap dgn mencoba ulang beberapa kali sebelum
     * menyerah, drpd langsung memvonis "anomali" dan membiarkan overlay "Kas Belum Dibuka" macet
     * walau server sudah sukses. Dipakai baik oleh {@link #submitBukaKas} maupun
     * {@link #submitTutupKas} -- keduanya sama-sama rentan simtom yg sama.
     * @param {boolean} terbukaDiharapkan status {@code .terbuka} yg diharapkan muncul.
     * @return {Promise<boolean>} true bila status akhirnya sesuai harapan dlm batas percobaan (~5.4 detik total).
     */
    async function tungguStatusSesiKasSesuai(terbukaDiharapkan) {
        const jedaMs = [300, 600, 1000, 1500, 2000];
        for (let i = 0; i < jedaMs.length; i++) {
            await new Promise((r) => setTimeout(r, jedaMs[i]));
            await muatStatusSesiKas();
            if (sesiKasInfo.terbuka === terbukaDiharapkan) return true;
        }
        return false;
    }

    async function submitBukaKas() {
        // Multi-Toko: kombo WAJIB dipilih -- lihat JavaDoc `daftarTokoSaya`. Toko-tunggal (kasus
        // umum) langsung memakai `tokoId` modul spt sebelumnya, tanpa perubahan perilaku sama sekali.
        let idTokoDipakai = tokoId;
        if (daftarTokoSaya.length > 1) {
            const elSelectToko = document.getElementById('selectTokoSesiKas');
            const dipilih = elSelectToko ? elSelectToko.value : '';
            if (!dipilih) {
                tampilkanToast('error', 'Pilih toko terlebih dahulu sebelum membuka kas.');
                return;
            }
            idTokoDipakai = Number(dipilih);
        }
        if (!idTokoDipakai) {
            tampilkanToast('error', 'Toko belum diketahui -- coba muat ulang aplikasi.');
            return;
        }
        const modalAwal = parseFloat(document.getElementById('inputModalAwalSesiKas').value) || 0;
        const keterangan = document.getElementById('inputKetSesiKas').value || '';
        const btn = document.getElementById('btnSubmitSesiKas');
        btn.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.sesiKas.buka({ id_toko: idTokoDipakai, modal_awal: modalAwal, keterangan: keterangan });
            if (r.ok) {
                // Toko baru saja dikunci server-side (Tbmuser.tokoAktifMultiToko) -- cerminkan SEGERA
                // di topbar+state lokal tanpa menunggu muat-ulang konfigurasi berikutnya.
                if (daftarTokoSaya.length > 1) {
                    tokoId = idTokoDipakai;
                    const tokoDipilih = daftarTokoSaya.find((t) => t.id === idTokoDipakai);
                    if (tokoDipilih) {
                        tokoNama = tokoDipilih.nama;
                        elNamaToko.textContent = tokoNama;
                    }
                }
                await muatStatusSesiKas();
                if (!sesiKasInfo.terbuka) {
                    btn.textContent = 'Menunggu server memperbarui status...';
                    const akhirnyaTerbuka = await tungguStatusSesiKasSesuai(true);
                    if (!akhirnyaTerbuka) {
                        // Sudah dicoba ulang beberapa kali (lihat JavaDoc tungguStatusSesiKasSesuai) dan TETAP
                        // tidak sesuai -- ANOMALI (bukan exception biasa, tak akan tertangkap try-catch mana
                        // pun) yg pernah benar-benar terjadi. Dicatat eksplisit ke menu Log Error supaya
                        // kasir/admin punya bukti konkret saat melaporkan, bukan cuma "kok gak kebuka" tanpa jejak.
                        try {
                            window.electronAPI.posAPI.errorLog.catat({
                                sumber: 'pos.html:anomali-sesi-kas-buka',
                                tingkat: 'error',
                                pesan: 'Server membalas sesi_kas_buka BERHASIL, tapi sesi_kas_status tetap melaporkan kas tertutup setelah dicoba ulang beberapa kali (toko=' + tokoId + ').',
                                detail: 'Baris sesi kas kemungkinan besar SUDAH tersimpan permanen di server (server membalas sukses) -- '
                                    + 'ini murni soal status re-check yg belum ikut memperbarui. Coba tekan "Buka Kas" sekali lagi atau muat ulang aplikasi; '
                                    + 'bila tetap terjadi, laporkan ke admin/IT untuk diperiksa sisi infrastruktur server (mis. connection pool/replika baca). '
                                    + 'modalAwal dikirim=' + modalAwal
                            });
                        } catch (eLog) { /* logging gagal jangan sampai mengganggu alur utama */ }
                        tampilkanToast('error', 'Kas sudah tersimpan di server, tapi tampilan belum ikut memperbarui -- coba tekan "Buka Kas" sekali lagi atau muat ulang aplikasi.');
                        return;
                    }
                }
                elOverlaySesiKas.classList.remove('tampil');
                tampilkanToast('success', 'Kas berhasil dibuka.');
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            btn.disabled = false;
        }
    }

    async function submitTutupKas() {
        if (!confirm('Yakin ingin menutup kas kasir sekarang? Selisih terhadap kas seharusnya akan dicatat secara permanen.')) return;
        const uangFisik = parseFloat(document.getElementById('inputUangFisikSesiKas').value) || 0;
        const keterangan = document.getElementById('inputKetSesiKas').value || '';
        const btn = document.getElementById('btnSubmitSesiKas');
        btn.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.sesiKas.tutup({ id_toko: tokoId, uang_fisik: uangFisik, keterangan: keterangan });
            if (r.ok) {
                await muatStatusSesiKas();
                if (sesiKasInfo.terbuka) {
                    // Simtom sama dgn submitBukaKas (lihat JavaDoc tungguStatusSesiKasSesuai) -- serap
                    // latensi visibilitas baca-setelah-tulis sebelum menganggap ada yg salah.
                    await tungguStatusSesiKasSesuai(false);
                }
                elOverlaySesiKas.classList.remove('tampil');
                const selisih = Number(r.data && r.data.selisih) || 0;
                if (r.data && r.data.belumSinkron) {
                    // Belum sempat sinkron ke server saat ini (mis. offline) -- selisih FINAL baru
                    // dihitung server, akan tersedia otomatis setelah sinkron latar berhasil (lihat
                    // JavaDoc "Sesi Kasir offline-first" main.js). Jangan tampilkan angka 0 seolah final.
                    tampilkanToast('info', 'Kas ditutup (tersimpan di perangkat ini) -- selisih akan dihitung otomatis begitu tersinkron ke server.');
                } else {
                    tampilkanToast(selisih < 0 ? 'error' : 'success', 'Kas ditutup. Selisih: ' + formatRupiah(selisih));
                }

                // Butir 10 spesifikasi "dashboard kasir": stok dicek otomatis SETELAH close session --
                // tampilkan daftar produk yg sudah turun di bawah ambang stok minimumnya (diisi admin
                // lewat menu "Stok Minimum & Kadaluarsa") supaya langsung terlihat perlu direstok/
                // dipesan ke Gudang Pusat, tanpa menunggu kasir buka laporan terpisah.
                const stokMenipis = (r.data && r.data.stokMenipis) || [];
                if (stokMenipis.length > 0) {
                    window.PesanDetail.tampilkan({
                        tingkat: 'peringatan',
                        judul: 'Ada ' + stokMenipis.length + ' Produk Perlu Direstok',
                        penjelasan: 'Stok produk berikut sudah turun ke/di bawah ambang minimum yang dikonfigurasi admin -- perlu ditindaklanjuti dengan permintaan barang ke Gudang Pusat.',
                        langkah: stokMenipis.map((p) => p.nama + ' -- sisa ' + p.stok + ' (ambang ' + p.stokMinimum + ')')
                    });
                }
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            btn.disabled = false;
        }
    }

    elBtnSesiKas.addEventListener('click', () => {
        renderIsiSesiKas();
        elOverlaySesiKas.classList.add('tampil');
    });
    elBtnTutupSesiKas.addEventListener('click', () => elOverlaySesiKas.classList.remove('tampil'));
    elBtnBukaKasDariOverlay.addEventListener('click', () => elBtnSesiKas.click());

    // ==== Modal metode pembayaran ====

    function pilihMetodeBayar(cb) {
        caraBayarTerpilih = { id: String(cb.id), nama: cb.nama, manual: !!cb.manual };
        elMetodeTerpilihLabel.textContent = tebakIkonMetode(cb.nama) + ' ' + cb.nama;
        elOverlayMetode.className = 'overlay';
        segarkanKembalianDanTombol();
    }

    function renderGridMetode() {
        elGridMetode.innerHTML = '';
        if (semuaCaraBayar.length === 0) {
            const kosong = document.createElement('div');
            kosong.className = 'metode-kosong';
            kosong.textContent = 'Tidak ada metode pembayaran aktif -- hubungi admin untuk mengaktifkannya di Konfigurasi.';
            elGridMetode.appendChild(kosong);
            return;
        }
        semuaCaraBayar.forEach((cb, idx) => {
            // Ctrl+angka -- lihat listener keydown document di bawah, sama pola dgn Pilih Member/cari produk.
            const nomorPintasan = idx < 9 ? String(idx + 1) : (idx === 9 ? '0' : '');
            const kartu = document.createElement('button');
            kartu.type = 'button';
            kartu.className = 'kartu-metode' + (caraBayarTerpilih && caraBayarTerpilih.id === String(cb.id) ? ' aktif' : '');
            kartu.innerHTML = '<div class="nomor-hasil"></div><span class="ico"></span><span class="label"></span><span class="ket"></span>';
            kartu.querySelector('.nomor-hasil').textContent = nomorPintasan;
            kartu.querySelector('.ico').textContent = tebakIkonMetode(cb.nama);
            kartu.querySelector('.label').textContent = cb.nama;
            kartu.querySelector('.ket').textContent = cb.manual ? 'Verifikasi manual' : 'Langsung tuntas';
            kartu.addEventListener('click', () => pilihMetodeBayar(cb));
            elGridMetode.appendChild(kartu);
        });
    }

    elBtnPilihMetode.addEventListener('click', () => { elOverlayMetode.className = 'overlay tampil'; });
    elBtnTutupMetode.addEventListener('click', () => { elOverlayMetode.className = 'overlay'; });
    elOverlayMetode.addEventListener('click', (event) => { if (event.target === elOverlayMetode) elOverlayMetode.className = 'overlay'; });

    /**
     * Pintasan Ctrl+angka utk kartu Metode Pembayaran -- ditaruh di {@code document} (bukan elemen
     * tertentu) krn modal ini TIDAK punya kotak teks sendiri utk difokuskan (murni kartu klik) -- aman
     * krn digerbangi cek overlay tampil, jadi tak bentrok dgn pintasan Ctrl+angka lain (Pilih Member/
     * cari produk) yg masing2 sudah digerbangi kondisi overlay/dropdown-nya sendiri.
     */
    document.addEventListener('keydown', (event) => {
        if (!event.ctrlKey) return;
        if (!elOverlayMetode.classList.contains('tampil')) return;
        if (!/^[0-9]$/.test(event.key)) return;
        const idx = event.key === '0' ? 9 : (Number(event.key) - 1);
        const cb = semuaCaraBayar[idx];
        if (!cb) return;
        event.preventDefault();
        pilihMetodeBayar(cb);
    });

    // ==== Keranjang ====

    function tambahKeKeranjang(p) {
        // Jaga-jaga di luar overlay visual kasTertutupOverlay (mis. race saat status sesi kas baru
        // saja berubah tapi overlay belum sempat digambar ulang) -- tetap TOLAK penjualan saat kas tertutup.
        if (!sesiKasInfo.terbuka && !overrideDaruratTanpaSesiKas) { tampilkanToast('error', 'Kas sedang tertutup -- buka sesi kas dulu sebelum berjualan.'); return; }
        const existing = cart.find((c) => c.id === p.id);
        if (existing) existing.jumlah += 1;
        else cart.push({ id: p.id, kode: p.kode, nama: p.nama, harga: Number(p.hargaJual) || 0, jumlah: 1, gambarUrl: p.gambarUrl || null, diskon: 0, cashback: 0, aturanDiskon: null });
        renderCart();
        renderProduk();
        jadwalkanEvaluasiDiskon();
    }

    function ubahJumlah(id, delta) {
        const item = cart.find((c) => c.id === id);
        if (!item) return;
        item.jumlah += delta;
        if (item.jumlah <= 0) cart = cart.filter((c) => c.id !== id);
        renderCart();
        renderProduk();
        jadwalkanEvaluasiDiskon();
    }

    function hapusDariKeranjang(id) {
        cart = cart.filter((c) => c.id !== id);
        renderCart();
        renderProduk();
        jadwalkanEvaluasiDiskon();
    }

    /**
     * Fase 4 -- evaluasi Aturan Diskon otomatis, lihat JavaDoc server {@code KantinHelper.diskonEvaluasi}
     * (porting 1:1 dari mesin {@code evaluateDiscount}/{@code recalculateCart} JSP & {@code
     * PosKantinAction.evaluasiDiskon} ZK). Dipanggil via {@link jadwalkanEvaluasiDiskon} (debounced)
     * setiap keranjang/member berubah -- MURNI mengisi field {@code diskon}/{@code cashback}/{@code
     * aturanDiskon} pada item {@code cart} yg SUDAH ADA, lalu render ULANG supaya kasir langsung lihat
     * potongannya. Kegagalan (offline/error) DIBIARKAN diam-diam sbg "tidak ada diskon" -- checkout
     * TETAP bisa dilanjutkan tanpa diskon, bukan diblokir oleh kegagalan mengevaluasi diskon.
     */
    let diskonDebounceTimer = null;
    function jadwalkanEvaluasiDiskon() {
        clearTimeout(diskonDebounceTimer);
        if (cart.length === 0) return;
        diskonDebounceTimer = setTimeout(async () => {
            await evaluasiDiskonKeranjang();
            renderCart();
        }, 250);
    }

    async function evaluasiDiskonKeranjang() {
        if (cart.length === 0) return;
        try {
            const items = cart.map((c) => ({ id: c.id, harga: c.harga, jumlah: c.jumlah }));
            const hasil = await window.electronAPI.posAPI.diskonEvaluasi({ id_member: memberTerpilih ? memberTerpilih.id : null, items });
            const byId = {};
            if (hasil.ok && hasil.data && Array.isArray(hasil.data.items)) {
                hasil.data.items.forEach((it) => { byId[it.id] = it; });
            }
            cart.forEach((c) => {
                const it = byId[c.id];
                c.diskon = it ? (Number(it.diskon) || 0) : 0;
                c.cashback = it ? (Number(it.cashback) || 0) : 0;
                c.aturanDiskon = it && it.aturanDiskon != null ? it.aturanDiskon : null;
            });
        } catch (e) {
            cart.forEach((c) => { c.diskon = 0; c.cashback = 0; c.aturanDiskon = null; });
        }
    }

    /**
     * Ringkasan lengkap keranjang SUDAH memperhitungkan diskon otomatis (Fase 4) -- rumus IDENTIK
     * dgn JSP {@code _pos.jsp} (fungsi {@code renderCart}): {@code basePajak = subtotal - totalDiskon},
     * pajak dihitung dari {@code basePajak} (BUKAN subtotal mentah), {@code total = basePajak + pajak}.
     * Cashback SENGAJA tidak mengurangi total -- itu reward terpisah (saldo yg dicairkan lewat alur
     * admin lain), bukan potongan harga langsung. Satu-satunya sumber kebenaran perhitungan total di
     * layar ini -- dipakai renderCart/segarkanKembalianDanTombol/checkout/Layar Pelanggan supaya
     * angka yg ditampilkan ke kasir, ke pelanggan, dan yg dikirim ke server SELALU sinkron.
     */
    function hitungRingkasanKeranjang() {
        let subtotal = 0, totalDiskon = 0, totalCashback = 0;
        cart.forEach((c) => {
            subtotal += c.harga * c.jumlah;
            totalDiskon += (c.diskon || 0);
            totalCashback += (c.cashback || 0);
        });
        const basePajak = subtotal - totalDiskon;
        const pajak = basePajak * (pajakPersen / 100);
        const total = basePajak + pajak;
        return { subtotal, totalDiskon, totalCashback, pajak, total };
    }

    function renderCart() {
        elCartItems.innerHTML = '';
        if (cart.length === 0) {
            elJumlahItemBadge.style.display = 'none';
            const kosong = document.createElement('div');
            kosong.className = 'cart-kosong';
            kosong.innerHTML = '<span class="ico">\u{1F6D2}</span>Belum ada produk dipilih.';
            elCartItems.appendChild(kosong);
        } else {
            elJumlahItemBadge.style.display = 'inline-block';
            elJumlahItemBadge.textContent = cart.length + ' item';
            cart.forEach((c) => {
                const row = document.createElement('div');
                row.className = 'cart-item';
                const promo = (c.diskon > 0 ? ('<span class="badge-promo-item potong">-' + formatRupiah(c.diskon) + '</span>') : '')
                    + (c.cashback > 0 ? ('<span class="badge-promo-item cashback">+' + formatRupiah(c.cashback) + ' cashback</span>') : '');
                row.innerHTML =
                    '<div class="avatar-mini" style="background:' + warnaDariNama(c.nama) + '"></div>' +
                    '<div class="nama"><span class="n"></span><span class="h"></span>' + (promo ? '<div class="baris-promo-item">' + promo + '</div>' : '') + '</div>' +
                    '<div class="qty-stepper"><button data-aksi="kurang">-</button><span class="n"></span><button data-aksi="tambah">+</button></div>' +
                    '<button class="btn-hapus-item" title="Hapus">✕</button>';
                row.querySelector('.avatar-mini').textContent = inisialDariNama(c.nama);
                lampirkanGambarKeAvatar(row.querySelector('.avatar-mini'), c.gambarUrl);
                row.querySelector('.n').textContent = c.nama;
                row.querySelector('.h').textContent = formatRupiah(c.harga);
                row.querySelector('.qty-stepper .n').textContent = c.jumlah;
                row.querySelector('[data-aksi="kurang"]').addEventListener('click', () => ubahJumlah(c.id, -1));
                row.querySelector('[data-aksi="tambah"]').addEventListener('click', () => ubahJumlah(c.id, 1));
                row.querySelector('.btn-hapus-item').addEventListener('click', () => hapusDariKeranjang(c.id));
                elCartItems.appendChild(row);
            });
        }

        const { subtotal, totalDiskon, totalCashback, pajak, total } = hitungRingkasanKeranjang();
        elRingkasSubtotal.textContent = formatRupiah(subtotal);
        elBarisRingkasDiskon.style.display = totalDiskon > 0 ? 'flex' : 'none';
        elRingkasDiskon.textContent = '- ' + formatRupiah(totalDiskon);
        elBarisRingkasCashback.style.display = totalCashback > 0 ? 'flex' : 'none';
        elRingkasCashback.textContent = '+ ' + formatRupiah(totalCashback);
        elRingkasPajak.textContent = formatRupiah(pajak);
        elRingkasTotal.textContent = formatRupiah(total);

        // Uang diterima default = total (kasus umum non-tunai/uang pas) -- kasir tinggal ubah kalau
        // pelanggan bayar tunai dgn nominal lebih besar (utk hitung kembalian).
        if (!elInputUangTunai.dataset.disentuh) {
            elInputUangTunai.value = total > 0 ? String(Math.round(total)) : '';
        }
        segarkanKembalianDanTombol();
        siarkanKeranjangKeLayarPelanggan();
    }

    elInputUangTunai.addEventListener('input', () => {
        elInputUangTunai.dataset.disentuh = '1';
        segarkanKembalianDanTombol();
    });

    function segarkanKembalianDanTombol() {
        const { total } = hitungRingkasanKeranjang();
        const diterima = Number((elInputUangTunai.value || '').replace(/[^0-9]/g, '')) || 0;
        const kembalian = diterima - total;

        if (total > 0 && diterima > 0) {
            elKembalianBox.style.display = 'block';
            elKembalianBox.className = 'kembalian ' + (kembalian >= 0 ? 'cukup' : 'kurang');
            elKembalianNilai.textContent = formatRupiah(Math.abs(kembalian));
            if (kembalian < 0) elKembalianNilai.textContent = '- ' + elKembalianNilai.textContent + ' (kurang)';
        } else {
            elKembalianBox.style.display = 'none';
        }

        elBtnBayar.disabled = !(cart.length > 0 && total > 0 && diterima >= total && caraBayarTerpilih != null && (sesiKasInfo.terbuka || overrideDaruratTanpaSesiKas));
        elBtnTahanKeranjang.disabled = !(cart.length > 0 && (sesiKasInfo.terbuka || overrideDaruratTanpaSesiKas));
    }

    // ==== Tahan (Fase 5 -- simpan keranjang sbg draft belum-lunas, resume lewat layar Pesanan) ====

    /**
     * Tombol "Tahan" -- simpan keranjang saat ini sbg draft belum-lunas (aksi {@code draft_bayar} yg
     * SAMA dipakai fitur Pesanan Online, lihat JavaDoc server {@code prosesPesananList}), lalu
     * kosongkan keranjang lokal. Kasir bisa melanjutkannya lagi kapan saja lewat layar "Pesanan"
     * (tombol "Muat ke Keranjang", lihat pesanan-renderer.js + {@link #lanjutkanKeranjangTertahan}) --
     * pola SAMA PERSIS dgn Android (app.js elBtnTahanKeranjang) dan resume yg sudah ada di JSP
     * _pos.jsp. Metode bayar WAJIB diisi backend walau belum menagih siapa pun -- pakai yg sedang
     * dipilih kasir, atau opsi pertama yg tersedia.
     */
    elBtnTahanKeranjang.addEventListener('click', async () => {
        if (cart.length === 0) return;
        if (!tokoId) { tampilkanToast('error', 'Toko tidak diketahui, coba lagi.'); return; }
        const idCaraBayar = caraBayarTerpilih ? caraBayarTerpilih.id : (semuaCaraBayar[0] ? String(semuaCaraBayar[0].id) : null);
        if (!idCaraBayar) { tampilkanToast('error', 'Belum ada metode pembayaran yang bisa dipakai utk menahan keranjang.'); return; }

        elBtnTahanKeranjang.disabled = true;
        const oriHtml = elBtnTahanKeranjang.innerHTML;
        elBtnTahanKeranjang.textContent = '...';
        const kodeUnikTahan = buatKodeUnik();
        const { total: totalTahan } = hitungRingkasanKeranjang();
        const payload = {
            id: draftAktifId || null,
            kodeUnik: kodeUnikTahan,
            clientTrxId: kodeUnikTahan,
            idToko: tokoId,
            tokoId: tokoId,
            kasir: userId,
            waktu: formatWaktuServer(new Date()),
            id_member: memberTerpilih ? memberTerpilih.id : null,
            caraBayar: idCaraBayar,
            total: totalTahan,
            transaksi: cart.map((c) => ({
                id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah,
                diskon: c.diskon || 0, aturanDiskon: c.aturanDiskon || null, cashback: c.cashback || 0
            }))
        };
        try {
            const hasil = await window.electronAPI.posAPI.draftBayar(payload);
            if (hasil.ok) {
                tampilkanToast('success', 'Keranjang ditahan -- lanjutkan lewat menu Pesanan.');
                selesaikanTransaksi();
            } else {
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Menahan Keranjang',
                teknis: e && e.message ? e.message : String(e)
            }));
        } finally {
            elBtnTahanKeranjang.innerHTML = oriHtml;
            segarkanKembalianDanTombol();
        }
    });

    // ==== Checkout ====

    elBtnBayar.addEventListener('click', async () => {
        const { total } = hitungRingkasanKeranjang();
        const diterima = Number((elInputUangTunai.value || '').replace(/[^0-9]/g, '')) || 0;
        const kembalian = Math.max(0, diterima - total);

        const pakaiSaldo = caraBayarTerpilih && caraBayarTerpilih.manual === false;
        if (pakaiSaldo) {
            elBtnBayar.disabled = true;
            elBtnBayar.textContent = 'Memeriksa saldo...';
            const gerbang = await gerbangSaldoDanPin(total);
            if (!gerbang.lolos) {
                tampilkanErrorGerbang(gerbang);
                elBtnBayar.textContent = 'Bayar';
                segarkanKembalianDanTombol();
                return;
            }
        }

        const kodeUnik = buatKodeUnik();
        const sekarang = new Date();

        const payload = {
            kodeUnik: kodeUnik,
            clientTrxId: kodeUnik,
            idToko: tokoId,
            tokoId: tokoId,
            kasir: userId,
            waktu: formatWaktuServer(sekarang),
            caraBayar: caraBayarTerpilih.id,
            total: total,
            id_member: memberTerpilih ? memberTerpilih.id : null,
            draftPembelianAnggotaKoperasi: draftAktifId || null,
            transaksi: cart.map((c) => ({
                id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah,
                diskon: c.diskon || 0, aturanDiskon: c.aturanDiskon || null, cashback: c.cashback || 0
            }))
        };

        elBtnBayar.disabled = true;
        elBtnBayar.textContent = 'Memproses...';
        try {
            const hasil = await window.electronAPI.posAPI.bayar(payload);
            if (hasil.ok) {
                window.electronAPI.posAPI.layarPelanggan.kirim({ tipe: 'sukses', totalBayar: total, metode: caraBayarTerpilih.nama, pesanTerimaKasih: pesanTerimaKasih });
                // Data struk diambil dari keranjang IN-MEMORY yg barusan dibayar (bukan round-trip
                // server) -- sama dgn pola in-memory cetakStruk() versi web _pos.jsp, lihat JavaDoc struk.js.
                strukTerakhir = {
                    tokoNama: tokoNama, kode: kodeUnik, waktu: formatWaktuServer(sekarang), pesanTerimaKasih: pesanTerimaKasih,
                    item: cart.map((c) => ({ nama: c.nama, qty: c.jumlah, harga: c.harga, diskon: c.diskon || 0, cashback: c.cashback || 0 })),
                    totalDiskon: cart.reduce((s, c) => s + (c.diskon || 0), 0),
                    totalCashback: cart.reduce((s, c) => s + (c.cashback || 0), 0),
                    totalBiaya: total, bayarTunai: diterima, kembalian: kembalian
                };
                tampilkanLayarSukses({ offline: !!hasil.offline, total: total, diterima: diterima, kembalian: kembalian, metode: caraBayarTerpilih.nama, pesan: hasil.pesan });
                // Laci TIDAK lagi dibuka otomatis di sini -- lihat JavaDoc bukaLaciKasir. Kasir memakai
                // tombol "Buka Laci" (elBtnBukaLaciSukses) di layar sukses ini kalau perlu.
            } else {
                // Lihat JavaDoc PosApi.normalisasiStatusKantinHelper (server) -- hasil.kode SEKARANG
                // terstruktur (mis. DUPLIKAT_KODE_TRANSAKSI/DATA_TIDAK_LENGKAP/SERVER_ERROR), jadi modal
                // ini bisa memberi langkah PERSIS sesuai penyebabnya, bukan toast generik "ditolak server".
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Mengirim Transaksi ke Server',
                penjelasan: 'Terjadi kesalahan tak terduga saat aplikasi mencoba mengirim transaksi ini. Selama pesan ini muncul SEBELUM ada respons dari server, kemungkinan besar transaksi TIDAK tersimpan di server sama sekali.',
                teknis: e && e.message ? e.message : String(e)
            }));
        } finally {
            elBtnBayar.textContent = 'Bayar';
            segarkanStatus();
            segarkanKembalianDanTombol();
        }
    });

    /**
     * @param {{offline:boolean, total:number, diterima:number, kembalian:number, metode:string, pesan?:string}} info
     * Teks penjelasan diambil dari {@code pesan-detail.js} KAMUS (OFFLINE_CHECKOUT/SUKSES_ONLINE) --
     * SATU sumber kebenaran yg sama dgn modal error, supaya kasir baru paham konsekuensi "offline" ini
     * (bukan sekadar kalimat pendek "akan disinkron nanti" tanpa detail apa yg perlu dilakukan).
     */
    function tampilkanLayarSukses(info) {
        if (info.offline) {
            elIkonSukses.className = 'centang offline';
            elIkonSukses.innerHTML = '\u{1F4E4}';
            elJudulSukses.textContent = 'Tersimpan Offline -- Belum Terkirim ke Server';
            elSubSukses.textContent = window.PesanDetail.KAMUS.OFFLINE_CHECKOUT.penjelasan;
        } else {
            elIkonSukses.className = 'centang';
            elIkonSukses.innerHTML = '✓';
            elJudulSukses.textContent = 'Transaksi Berhasil & Tersinkron';
            elSubSukses.textContent = window.PesanDetail.KAMUS.SUKSES_ONLINE.penjelasan;
        }
        elRincianMetode.textContent = info.metode;
        elRincianDiterima.textContent = formatRupiah(info.diterima);
        elRincianKembalian.textContent = formatRupiah(info.kembalian);
        elRincianTotal.textContent = formatRupiah(info.total);
        elLayarSukses.className = 'layar-sukses tampil';
    }

    elBtnCetakStruk.addEventListener('click', () => {
        // Munculkan pratinjau + dialog cetak native ("Print") dulu -- BUKAN cetak diam-diam langsung,
        // per permintaan: kasir ingin memeriksa struk dulu sebelum benar-benar tercetak.
        if (strukTerakhir && window.Struk) window.Struk.cetakDenganPreview(strukTerakhir);
    });

    elBtnBukaLaciSukses.addEventListener('click', () => bukaLaciKasir(false));

    elBtnTransaksiBaru.addEventListener('click', () => {
        elLayarSukses.className = 'layar-sukses';
        selesaikanTransaksi();
    });

    /**
     * Pintasan keyboard layar "Transaksi Berhasil" -- gap-closure "form ini belum ada pintasan
     * keyboard-nya". Layar ini SALING EKSKLUSIF dgn kotak Kasir biasa (begitu tampil, tak ada lagi yg
     * bisa dikerjakan di keranjang) DAN sudah otomatis mematikan pintasan F1-F9 global (lihat {@code
     * adaOverlayAktif} yg mengecek {@code elLayarSukses.classList.contains('tampil')}), jadi aman
     * memakai ulang F6 (arti SAMA -- Buka Laci) dan F2 (konteks BEDA drpd F2=Bayar di layar Kasir,
     * krn Bayar sudah tak relevan setelah transaksi selesai -- lihat catatan menu Bantuan).
     */
    document.addEventListener('keydown', (event) => {
        if (!elLayarSukses.classList.contains('tampil')) return;
        if (event.key === 'F6') { event.preventDefault(); elBtnBukaLaciSukses.click(); return; }
        if (event.key === 'F2') { event.preventDefault(); elBtnCetakStruk.click(); return; }
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); elBtnTransaksiBaru.click(); }
    });

    function selesaikanTransaksi() {
        cart = [];
        draftAktifId = null;
        caraBayarTerpilih = null;
        memberTerpilih = null;
        elMemberChip.style.display = 'none';
        elMetodeTerpilihLabel.textContent = 'Pilih ›';
        elInputUangTunai.value = '';
        delete elInputUangTunai.dataset.disentuh;
        renderCart();
        renderProduk();
        renderGridMetode();
        window.electronAPI.posAPI.layarPelanggan.kirim({ tipe: 'reset' });
    }

    /**
     * "Muat" Keranjang Tertahan ke layar Kasir aktif -- dipicu via key {@code pos_draft_resume} di
     * localStorage, ditulis layar Pesanan (pesanan-renderer.js, tombol "Muat ke Keranjang") SEBELUM
     * navigasi ke pos.html. Desktop BUKAN SPA (tiap layar adalah halaman HTML terpisah) jadi tidak ada
     * state in-memory yg bisa dioper langsung antar layar -- localStorage jadi jembatan satu-kali,
     * dibaca+dihapus lagi begitu tiba di sini (lihat pemanggilan di init di bawah). {@code
     * draftAktifId} disetel supaya "Bayar"/"Tahan" berikutnya menuntaskan/menahan ULANG draft yg SAMA
     * (bukan bikin baris duplikat) -- SAMA PERSIS pola {@code lanjutkanKeranjangTertahan} di app.js
     * Android. Field {@code anggotaId}/{@code caraBayarId} dipulihkan dari JSON {@code p} yg sudah
     * dikembalikan lengkap oleh {@code prosesPesananList} (Fase 5).
     * @param {{id:number, kode?:string, anggotaId?:number|null, caraBayarId?:number|null, items:Array<object>}} p
     */
    async function lanjutkanKeranjangTertahan(p) {
        cart = (p.items || []).map((it) => ({
            id: it.id, kode: it.kode || '', nama: it.nama, harga: it.harga, jumlah: it.jumlah,
            diskon: it.diskon || 0, cashback: it.cashback || 0, aturanDiskon: (it.aturanDiskon != null ? it.aturanDiskon : null)
        }));
        draftAktifId = p.id;

        let memberGagalDipulihkan = false;
        if (p.anggotaId != null) {
            try {
                const hasilMember = await window.electronAPI.posAPI.cariMember({ id: p.anggotaId });
                const m = (hasilMember.ok && hasilMember.data && hasilMember.data.member) ? hasilMember.data.member[0] : null;
                if (m) { await pilihMember(m); } else { memberGagalDipulihkan = true; await muatCaraBayarUntukMember(null); }
            } catch (e) { memberGagalDipulihkan = true; await muatCaraBayarUntukMember(null); }
        } else {
            await muatCaraBayarUntukMember(null);
        }

        if (p.caraBayarId != null) {
            const cb = semuaCaraBayar.filter((x) => String(x.id) === String(p.caraBayarId))[0];
            if (cb) {
                caraBayarTerpilih = cb;
                elMetodeTerpilihLabel.textContent = cb.nama;
            }
        }

        renderCart();
        renderProduk();
        renderGridMetode();
        jadwalkanEvaluasiDiskon();
        segarkanKembalianDanTombol();
        if (memberGagalDipulihkan) {
            tampilkanToast('error', 'Keranjang "' + (p.kode || '') + '" dimuat, TAPI member semula tidak bisa dipulihkan (mis. sedang offline & belum tersinkron ke cache) -- pilih ulang member secara manual bila perlu.');
        } else {
            tampilkanToast('success', 'Keranjang tertahan "' + (p.kode || '') + '" dimuat -- lanjutkan transaksi.');
        }
    }

    /** Hint "Tambah Pesanan" dari layar Pesanan (?tambahPesanan=1, lihat JavaDoc pesanan-renderer.js btnTambahPesanan) -- SEKALI tampil, tak perlu localStorage krn cukup dibaca dari URL saat ini. */
    function cobaTampilkanHintTambahPesanan() {
        try {
            if (new URLSearchParams(window.location.search).get('tambahPesanan') === '1') {
                tampilkanToast('info', 'Tambahkan produk ke keranjang, lalu tekan "Tahan" untuk menyimpannya sebagai pesanan baru.');
                history.replaceState(null, '', 'pos.html');
            }
        } catch (e) { /* abaikan -- hint bukan jalur kritis */ }
    }

    /** Cek+konsumsi key {@code pos_draft_resume} sekali saja saat layar Kasir dibuka -- lihat JavaDoc {@link #lanjutkanKeranjangTertahan}. */
    function cobaLanjutkanKeranjangTertahan() {
        try {
            const raw = localStorage.getItem('pos_draft_resume');
            if (!raw) return;
            localStorage.removeItem('pos_draft_resume');
            const p = JSON.parse(raw);
            lanjutkanKeranjangTertahan(p);
        } catch (e) { /* payload korup -- abaikan, jangan blokir layar Kasir */ }
    }

    // ==== Inisialisasi ====
    window.electronAPI.posAPI.modeOffline().then((offline) => {
        sedangModeOffline = !!offline;
        if (sedangModeOffline) {
            elBannerModeOffline.className = 'banner-mode-offline tampil';
            segarkanStatus();
        }
    }).catch(() => {});
    muatKatalogDanKonfigurasi().then(cobaLanjutkanKeranjangTertahan).then(cobaTampilkanHintTambahPesanan);
    segarkanStatus();
    segarkanStatusLayarPelanggan();
    setInterval(segarkanStatus, 30000);
    setInterval(segarkanStatusLayarPelanggan, 15000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
