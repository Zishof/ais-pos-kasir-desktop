/**
 * pesanan-renderer.js -- Logika layar Pesanan & Keranjang Tertahan LOKAL (pesanan.html, Fase 3+5).
 * Pola SAMA PERSIS dgn pos-renderer.js: TIDAK ADA fetch()/XHR di sini sama sekali, seluruh komunikasi
 * (termasuk fallback cache offline utk daftar pesanan) dilakukan proses utama lewat
 * window.electronAPI.posAPI.* (lihat JavaDoc handler 'pos:pesanan-*' di main.js).
 *
 * Daftar {@code pesananList()} berisi DUA jenis draft belum-lunas yg dibedakan via field {@code
 * dariPembeliOnline} (lihat JavaDoc server PosApi.prosesPesananList): (1) Pesanan Online -- dibuat
 * pembeli sendiri, ditawarkan "Verifikasi & Selesaikan" (bayar langsung, delegasi ke aksi "bayar");
 * (2) Keranjang Tertahan -- ditahan KASIR sendiri lewat tombol "Tahan" di layar Kasir (Fase 5),
 * ditawarkan "Muat ke Keranjang" (dibuka lagi utk diedit/dilanjutkan di pos.html, lewat jembatan
 * localStorage key {@code pos_draft_resume} -- lihat JavaDoc {@code lanjutkanKeranjangTertahan} di
 * pos-renderer.js) -- BUKAN dibayar langsung dari sini, krn maksud "menahan" adalah menunda utk
 * diedit lagi nanti. Kedua jenis tetap bisa dibatalkan.
 *
 * CAKUPAN (gap-closure -- sekarang paritas dgn JSP _draft_pesanan_anggota.jsp "Monitor Pesanan
 * Online (Draft)"): lihat daftar pesanan (lunas & belum) dgn filter Mulai/Akhir/Kode/Pembeli/Pedagang,
 * verifikasi/selesaikan pesanan online yg belum lunas (satu-satu ATAU massal lewat "Bayar Semua",
 * admin), muat keranjang tertahan kembali ke Kasir, batalkan yg belum lunas, lihat rincian
 * (Detail/Monitor -- read-only), cetak struk (baris lunas), hitung ulang diskon/cashback (baris draft
 * MAUPUN yg sudah lunas, memakai aturan diskon terkini -- lihat JavaDoc server
 * KantinHelper.pesananHitungUlang).
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elCariPesanan = document.getElementById('cariPesanan');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');
    const elInfoStrip = document.getElementById('infoStrip');
    const elDaftarPesanan = document.getElementById('daftarPesanan');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');
    const elOverlayMetode = document.getElementById('overlayMetode');
    const elGridMetode = document.getElementById('gridMetode');
    const elBtnTutupMetode = document.getElementById('btnTutupMetode');

    const elFilterMulai = document.getElementById('filterMulai');
    const elFilterAkhir = document.getElementById('filterAkhir');
    const elFilterKode = document.getElementById('filterKode');
    const elFilterPembeli = document.getElementById('filterPembeli');
    const elFilterPedagang = document.getElementById('filterPedagang');
    const elWrapFilterPedagang = document.getElementById('wrapFilterPedagang');
    const elBtnSaring = document.getElementById('btnSaring');
    const elBtnBayarSemua = document.getElementById('btnBayarSemua');
    const elWrapProgressBayarSemua = document.getElementById('wrapProgressBayarSemua');
    const elProgressBayarSemuaBar = document.getElementById('progressBayarSemuaBar');
    const elProgressBayarSemuaTeks = document.getElementById('progressBayarSemuaTeks');
    const elOverlayDetail = document.getElementById('overlayDetail');
    const elJudulDetail = document.getElementById('judulDetail');
    const elIsiDetail = document.getElementById('isiDetail');
    const elBtnTutupDetail = document.getElementById('btnTutupDetail');
    const elPaginasiPesanan = document.getElementById('paginasiPesanan');
    const elInfoCachePesanan = document.getElementById('infoCachePesanan');

    const statePesanan = { page: 1, pageSize: 20 };
    let namaMesinSayaPesanan = null;
    async function muatIdentitasMesinSayaPesanan() {
        try {
            const r = await window.electronAPI.posAPI.identitasMesinBaca();
            if (r.ok && r.data) namaMesinSayaPesanan = r.data.namaMesin && r.data.namaMesin.trim() ? r.data.namaMesin.trim() : ('Mesin-' + r.data.idMesin.slice(0, 8));
        } catch (e) { /* abaikan */ }
    }
    function badgeMesinPesanan(namaMesin) {
        if (!namaMesin) return '';
        const punyaSaya = namaMesinSayaPesanan && namaMesin === namaMesinSayaPesanan;
        return '<span class="badge-mesin' + (punyaSaya ? ' punya-saya' : '') + '">' + (punyaSaya ? 'Mesin Ini &middot; ' : '') + namaMesin + '</span>';
    }

    function tampilkanKpiPesanan(daftar) {
        const total = daftar.length;
        const menunggu = daftar.filter((p) => !p.lunas);
        const online = daftar.filter((p) => p.dariPembeliOnline).length;
        const tertahan = total - online;
        const nilaiMenunggu = menunggu.reduce((s, p) => s + (Number(p.totalBiaya) || 0), 0);
        document.getElementById('kpiTotalPesanan').textContent = String(total);
        document.getElementById('kpiPesananMenunggu').textContent = String(menunggu.length);
        document.getElementById('kpiPesananOnline').textContent = String(online);
        document.getElementById('kpiKeranjangTertahan').textContent = String(tertahan);
        document.getElementById('kpiNilaiMenunggu').textContent = formatRupiah(nilaiMenunggu);
    }

    let semuaPesanan = [];
    let semuaCaraBayar = [];
    let tokoId = null;
    let userId = '';
    let isAdminAkun = false;
    let supervisorPedagang = false;

    function formatRupiah(n) {
        return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
    }
    function formatWaktuServer(d) {
        const pad = (x) => String(x).padStart(2, '0');
        return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    function buatKodeUnik() {
        return 'PESANAN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    function tebakIkonMetode(nama) {
        const n = String(nama || '').toLowerCase();
        if (n.indexOf('tunai') >= 0 || n.indexOf('cash') >= 0) return '\u{1F4B5}';
        if (n.indexOf('qris') >= 0 || n.indexOf('qr') >= 0) return '\u{1F4F1}';
        if (n.indexOf('kartu') >= 0 || n.indexOf('debit') >= 0 || n.indexOf('kredit') >= 0) return '\u{1F4B3}';
        if (n.indexOf('transfer') >= 0 || n.indexOf('bank') >= 0) return '\u{1F3E6}';
        return '\u{1F4B0}';
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan -- bukan jalur kritis */ }
    }

    function formatWaktuCachePesanan(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /** Indikator cache SELALU tampil (bukan cuma saat offline spt infoStrip) -- gap-closure paritas Produk/Anggota "N tersimpan, terakhir disinkron ...". */
    async function muatInfoCachePesanan() {
        if (!elInfoCachePesanan) return;
        try {
            const r = await window.electronAPI.posAPI.pesananCacheInfo();
            if (!r.ok || !r.ada) { elInfoCachePesanan.textContent = '\u{1F4E6} Belum ada cache lokal -- klik "Segarkan Data" saat online.'; return; }
            const waktu = formatWaktuCachePesanan(r.disimpanPada);
            elInfoCachePesanan.textContent = '\u{1F4E6} ' + (r.total || 0) + ' pesanan tersimpan di cache lokal (dipakai saat offline)' + (waktu ? ' -- terakhir disinkron ' + waktu : '.');
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }

    /** @param {{fromCache:boolean, cachedAt?:string}} meta */
    function tampilkanInfoSumberData(meta) {
        if (meta && meta.fromCache) {
            const waktu = meta.cachedAt ? new Date(meta.cachedAt).toLocaleString('id-ID') : '-';
            elInfoStrip.className = 'info-strip cache';
            elInfoStrip.textContent = '⚠ Sedang offline -- menampilkan daftar tersimpan terakhir (' + waktu + '). Verifikasi/pembatalan TIDAK bisa dilakukan sampai online kembali.';
        } else {
            elInfoStrip.className = 'info-strip';
            elInfoStrip.textContent = 'Daftar pesanan terbaru dari server.';
        }
    }

    /** Kumpulkan nilai filter aktif di layar -- dipakai baik oleh muat-daftar biasa maupun "Bayar Semua". */
    function bacaFilter() {
        const f = {};
        if (elFilterMulai.value) f.sejak = elFilterMulai.value;
        if (elFilterAkhir.value) f.sampai = elFilterAkhir.value;
        if (elFilterKode.value.trim()) f.kode = elFilterKode.value.trim();
        if (elFilterPembeli.value.trim()) f.pembeli = elFilterPembeli.value.trim();
        if (isAdminAkun && elFilterPedagang.value.trim()) f.pedagang = elFilterPedagang.value.trim();
        return f;
    }

    async function muatSemua() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const [hasilPesanan, hasilKonfig] = await Promise.all([
                window.electronAPI.posAPI.pesananList(bacaFilter()),
                window.electronAPI.posAPI.konfigurasi()
            ]);

            if (hasilPesanan.ok) {
                semuaPesanan = hasilPesanan.data.pesanan || [];
                tampilkanInfoSumberData(hasilPesanan);
                renderDaftar();
                muatInfoCachePesanan();
            } else {
                window.PesanDetail.tampilkanDariHasil(hasilPesanan);
            }

            if (hasilKonfig.ok) {
                tokoId = hasilKonfig.data.tokoId;
                userId = hasilKonfig.data.userId || '';
                semuaCaraBayar = hasilKonfig.data.caraBayar || [];
                elNamaToko.textContent = hasilKonfig.data.tokoNama || (userId ? ('Kasir - ' + userId) : 'Kasir');
                // "Pedagang" (filter) & "Bayar Semua" -- KHUSUS admin lintas-toko, sama seperti JSP
                // (isAdmin<%=rnd%> di _draft_pesanan_anggota.jsp): supervisor toko biasa sudah otomatis
                // terkunci ke tokonya sendiri di server, tak perlu filter pedagang lagi.
                isAdminAkun = !!hasilKonfig.data.isAdmin;
                supervisorPedagang = !!hasilKonfig.data.supervisorPedagang;
                elWrapFilterPedagang.style.display = isAdminAkun ? 'flex' : 'none';
                elBtnBayarSemua.style.display = isAdminAkun ? 'inline-flex' : 'none';
            }
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    elBtnSaring.addEventListener('click', () => { statePesanan.page = 1; muatSemua(); });

    function renderDaftar() {
        const keyword = (elCariPesanan.value || '').trim().toLowerCase();
        const daftarUtuh = semuaPesanan.filter((p) => {
            if (!keyword) return true;
            return (p.kode || '').toLowerCase().indexOf(keyword) >= 0 || (p.pemesan || '').toLowerCase().indexOf(keyword) >= 0;
        });
        tampilkanKpiPesanan(daftarUtuh);

        elDaftarPesanan.innerHTML = '';
        if (daftarUtuh.length === 0) {
            const kosong = document.createElement('div');
            kosong.className = 'daftar-kosong';
            kosong.innerHTML = '<span class="ico">\u{1F4E5}</span>' + (semuaPesanan.length === 0 ? 'Belum ada pesanan online atau keranjang tertahan.' : 'Tidak ada pesanan yang cocok.');
            elDaftarPesanan.appendChild(kosong);
            elPaginasiPesanan.innerHTML = '';
            return;
        }

        const totalHal = Math.max(1, Math.ceil(daftarUtuh.length / statePesanan.pageSize));
        if (statePesanan.page > totalHal) statePesanan.page = totalHal;
        const awal = (statePesanan.page - 1) * statePesanan.pageSize;
        const daftar = daftarUtuh.slice(awal, awal + statePesanan.pageSize);

        daftar.forEach((p) => {
            const items = (p.items || []).map((it) => it.nama + ' (' + it.jumlah + ')').join(', ') || '-';
            const kartu = document.createElement('div');
            kartu.className = 'kartu-pesanan';
            kartu.innerHTML =
                '<div class="baris-atas"><span class="kode"></span><span class="badge-status"></span><span class="badge-sumber"></span><span class="badge-mesin-wrap"></span><span class="waktu"></span></div>' +
                '<div class="pemesan"></div>' +
                '<div class="item-list"></div>' +
                '<div class="baris-bawah"><span class="total"></span><div class="aksi"></div></div>';
            kartu.querySelector('.kode').textContent = p.kode || ('#' + p.id);
            const badge = kartu.querySelector('.badge-status');
            badge.className = 'badge-status ' + (p.lunas ? 'lunas' : 'menunggu');
            badge.textContent = p.lunas ? 'Lunas' : 'Menunggu';
            kartu.querySelector('.badge-sumber').textContent = p.dariPembeliOnline ? '\u{1F310} Pesanan Online' : '\u{1F4BC} Keranjang Tertahan';
            kartu.querySelector('.badge-mesin-wrap').innerHTML = badgeMesinPesanan(p.namaMesin);
            kartu.querySelector('.waktu').textContent = p.tanggalPembayaran || '';
            kartu.querySelector('.pemesan').textContent = '\u{1F464} ' + (p.pemesan || 'Pelanggan umum') + (p.kasirLoginNama ? (' · kasir: ' + p.kasirLoginNama) : '') + (p.keterangan ? (' — ' + p.keterangan) : '');
            kartu.querySelector('.item-list').textContent = items
                + (p.tokoNama ? ('\n\u{1F3EA} ' + p.tokoNama) : '')
                + (p.totalDiskon > 0 ? ('\nDiskon: -' + formatRupiah(p.totalDiskon)) : '')
                + (p.totalCashback > 0 ? ('\nCashback: +' + formatRupiah(p.totalCashback)) : '');
            kartu.querySelector('.item-list').style.whiteSpace = 'pre-line';
            kartu.querySelector('.total').textContent = formatRupiah(p.totalBiaya);

            // Aksi SELALU tersedia (gap-closure, padanan JSP -- Detail/Cetak Struk/Hitung Ulang tampil
            // di SEMUA baris, bukan cuma yg belum lunas), ditaruh SEBELUM aksi khusus belum-lunas di
            // bawah (Verifikasi/Muat ke Keranjang/Batalkan).
            const aksiSelalu = kartu.querySelector('.aksi');
            const btnDetail = document.createElement('button');
            btnDetail.className = 'btn-detail';
            btnDetail.type = 'button';
            btnDetail.textContent = '\u{1F4CB} Detail';
            btnDetail.addEventListener('click', () => bukaModalDetail(p));
            aksiSelalu.appendChild(btnDetail);
            if (p.lunas) {
                const btnCetak = document.createElement('button');
                btnCetak.className = 'btn-cetak';
                btnCetak.type = 'button';
                btnCetak.textContent = '\u{1F5A8}️ Cetak Struk';
                btnCetak.addEventListener('click', () => cetakStrukPesanan(p));
                aksiSelalu.appendChild(btnCetak);
            }
            if (isAdminAkun || supervisorPedagang) {
                const btnHitungUlang = document.createElement('button');
                btnHitungUlang.className = 'btn-hitung-ulang';
                btnHitungUlang.type = 'button';
                btnHitungUlang.textContent = '\u{1F9EE} Hitung Ulang';
                btnHitungUlang.addEventListener('click', () => hitungUlangPesanan(p, btnHitungUlang));
                aksiSelalu.appendChild(btnHitungUlang);
            }

            if (!p.lunas) {
                const aksi = kartu.querySelector('.aksi');
                if (p.dariPembeliOnline) {
                    const btnVerifikasi = document.createElement('button');
                    btnVerifikasi.className = 'btn-verifikasi';
                    btnVerifikasi.type = 'button';
                    btnVerifikasi.textContent = 'Verifikasi & Selesaikan';
                    btnVerifikasi.addEventListener('click', () => bukaModalVerifikasi(p));
                    aksi.appendChild(btnVerifikasi);
                } else {
                    const btnMuat = document.createElement('button');
                    btnMuat.className = 'btn-muat';
                    btnMuat.type = 'button';
                    btnMuat.textContent = 'Muat ke Keranjang';
                    btnMuat.addEventListener('click', () => muatKeKeranjang(p));
                    aksi.appendChild(btnMuat);
                }
                // Gerbang "supervisor-only" (gap-closure "edit/hapus/batal hanya supervisor") --
                // gerbang SEBENARNYA ditegakkan server-side (PosApi.bolehSupervisorAtauAdmin di
                // prosesBatalPesanan), ini murni UX (jangan tampilkan tombol yg toh akan ditolak).
                if (isAdminAkun || supervisorPedagang) {
                    const btnBatal = document.createElement('button');
                    btnBatal.className = 'btn-batal';
                    btnBatal.type = 'button';
                    btnBatal.textContent = 'Batalkan';
                    btnBatal.addEventListener('click', () => batalkanPesanan(p));
                    aksi.appendChild(btnBatal);
                }
            }
            elDaftarPesanan.appendChild(kartu);
        });

        elPaginasiPesanan.innerHTML = '';
        const info = document.createElement('span');
        info.textContent = 'Halaman ' + statePesanan.page + ' dari ' + totalHal + ' (' + daftarUtuh.length + ' pesanan)';
        const tombolWrap = document.createElement('div');
        tombolWrap.className = 'tombol-hal';
        const btnMundur = document.createElement('button');
        btnMundur.type = 'button'; btnMundur.className = 'btn-sync'; btnMundur.textContent = '< Sebelumnya';
        btnMundur.disabled = statePesanan.page <= 1;
        btnMundur.addEventListener('click', () => { statePesanan.page--; renderDaftar(); });
        const btnMaju = document.createElement('button');
        btnMaju.type = 'button'; btnMaju.className = 'btn-sync'; btnMaju.textContent = 'Berikutnya >';
        btnMaju.disabled = statePesanan.page >= totalHal;
        btnMaju.addEventListener('click', () => { statePesanan.page++; renderDaftar(); });
        tombolWrap.appendChild(btnMundur); tombolWrap.appendChild(btnMaju);
        elPaginasiPesanan.appendChild(info); elPaginasiPesanan.appendChild(tombolWrap);
    }

    elCariPesanan.addEventListener('input', () => { statePesanan.page = 1; renderDaftar(); });
    elBtnMuatUlang.addEventListener('click', muatSemua);

    /**
     * "Tambah Pesanan" -- gap-closure permintaan staff bisa membuat pesanan baru LANGSUNG dari layar
     * ini, BUKAN membangun mini-keranjang kedua yg terpisah (duplikasi logika cari produk/diskon/PIN
     * member yg SUDAH ADA & teruji di Kasir). Sebagai gantinya arahkan ke pos.html dgn penanda query
     * {@code ?tambahPesanan=1} yg dibaca pos-renderer.js saat init utk menampilkan hint "isi keranjang
     * lalu tekan Tahan" -- tombol "Tahan" yg sudah ada di sana MEMANGGIL aksi server {@code draft_bayar}
     * yg SAMA PERSIS menghasilkan baris pesanan baru di layar ini.
     */
    document.getElementById('btnTambahPesanan').addEventListener('click', () => {
        window.location.href = 'pos.html?tambahPesanan=1';
    });

    /**
     * "Muat ke Keranjang" -- kirim draft Keranjang Tertahan ini ke layar Kasir aktif utk
     * dilanjutkan/diedit (Fase 5). Desktop bukan SPA (tiap layar HTML terpisah) jadi jembatannya
     * lewat localStorage key {@code pos_draft_resume}, dibaca+dihapus lagi oleh pos-renderer.js
     * (lihat JavaDoc {@code lanjutkanKeranjangTertahan} di sana) begitu tiba di pos.html.
     */
    function muatKeKeranjang(p) {
        try {
            localStorage.setItem('pos_draft_resume', JSON.stringify(p));
        } catch (e) {
            tampilkanToast('error', 'Gagal menyiapkan keranjang: ' + (e && e.message ? e.message : e));
            return;
        }
        window.location.href = 'pos.html';
    }

    // ==== Verifikasi (pilih metode bayar lalu selesaikan) ====

    function bukaModalVerifikasi(p) {
        elGridMetode.innerHTML = '';
        if (semuaCaraBayar.length === 0) {
            const kosong = document.createElement('div');
            kosong.style.cssText = 'padding:0 4px;font-size:12.5px;color:var(--muted);';
            kosong.textContent = 'Tidak ada metode pembayaran aktif -- hubungi admin.';
            elGridMetode.appendChild(kosong);
        } else {
            semuaCaraBayar.forEach((cb) => {
                const kartu = document.createElement('button');
                kartu.type = 'button';
                kartu.className = 'kartu-metode';
                kartu.innerHTML = '<span class="ico"></span><span class="label"></span><span class="ket"></span>';
                kartu.querySelector('.ico').textContent = tebakIkonMetode(cb.nama);
                kartu.querySelector('.label').textContent = cb.nama;
                kartu.querySelector('.ket').textContent = cb.manual ? 'Verifikasi manual' : 'Langsung tuntas';
                kartu.addEventListener('click', () => selesaikanVerifikasi(p, cb));
                elGridMetode.appendChild(kartu);
            });
        }
        elOverlayMetode.className = 'overlay tampil';
    }
    elBtnTutupMetode.addEventListener('click', () => { elOverlayMetode.className = 'overlay'; });
    elOverlayMetode.addEventListener('click', (event) => { if (event.target === elOverlayMetode) elOverlayMetode.className = 'overlay'; });

    /**
     * Inti pembayaran satu pesanan -- DIEKSTRAK dari {@code selesaikanVerifikasi} (dipakai jalur
     * satu-per-satu via modal) supaya "Bayar Semua" (di bawah) memakai jalur SAMA PERSIS, bukan
     * salinan kedua. Tidak toast/refresh sendiri -- itu tanggung jawab pemanggil.
     * @param {object} p baris pesanan (dari semuaPesanan).
     * @param {number|string} caraBayarId
     * @return {Promise<{ok:boolean, offline?:boolean, pesan?:string, butuhLoginUlang?:boolean}>}
     */
    async function prosesVerifikasiSatu(p, caraBayarId) {
        const payload = {
            kodeUnik: buatKodeUnik(),
            idToko: p.tokoId || tokoId,
            waktu: formatWaktuServer(new Date()),
            caraBayar: String(caraBayarId),
            draftPembelianAnggotaKoperasi: p.id,
            id_member: p.anggotaId != null ? p.anggotaId : null,
            transaksi: (p.items || []).map((it) => ({
                id: it.id, nama: it.nama, harga: it.harga, jumlah: it.jumlah,
                diskon: 0, aturanDiskon: null, cashback: 0
            }))
        };
        return window.electronAPI.posAPI.pesananVerifikasi(payload);
    }

    async function selesaikanVerifikasi(p, caraBayar) {
        elOverlayMetode.className = 'overlay';
        tampilkanToast('info', 'Memproses verifikasi pesanan ' + (p.kode || '') + '...');
        try {
            const hasil = await prosesVerifikasiSatu(p, caraBayar.id);
            if (hasil.ok) {
                tampilkanToast('success', 'Pesanan ' + (p.kode || '') + ' berhasil diverifikasi & diselesaikan.');
                muatSemua();
            } else {
                // Aksi ini delegasi ke aksi 'bayar' yg sama dgn Kasir -- lihat JavaDoc
                // PosApi.normalisasiStatusKantinHelper (server) soal kode gagal terstruktur.
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Memverifikasi Pesanan',
                teknis: e && e.message ? e.message : String(e)
            }));
        }
    }

    // ==== Detail (read-only, gabungan "Detail"+"Monitor" JSP -- lihat JavaDoc atas file) ====

    function bukaModalDetail(p) {
        elJudulDetail.textContent = 'Detail Pesanan ' + (p.kode || ('#' + p.id));
        const items = p.items || [];
        let html = '<div class="kepala">'
            + '<div><strong>' + (p.dariPembeliOnline ? '\u{1F310} Pesanan Online' : '\u{1F4BC} Keranjang Tertahan') + '</strong></div>'
            + '<div>Status: ' + (p.lunas ? 'Lunas' : 'Menunggu') + '</div>'
            + '<div>Pembeli: ' + (p.pemesan || 'Pelanggan umum') + '</div>'
            + (p.tokoNama ? ('<div>Toko: ' + p.tokoNama + '</div>') : '')
            + '<div>Waktu: ' + (p.tanggalPembayaran || '-') + '</div>'
            + (p.keterangan ? ('<div>Keterangan: ' + p.keterangan + '</div>') : '')
            + '</div>';
        html += items.map((it) =>
            '<div class="baris-item-detail"><span>' + (it.nama || '') + ' x' + (it.jumlah || 0) + '</span><span>' + formatRupiah((it.harga || 0) * (it.jumlah || 0)) + '</span></div>'
        ).join('');
        if (p.totalDiskon > 0) html += '<div class="baris-item-detail"><span>Diskon</span><span>-' + formatRupiah(p.totalDiskon) + '</span></div>';
        if (p.totalCashback > 0) html += '<div class="baris-item-detail"><span>Cashback</span><span>+' + formatRupiah(p.totalCashback) + '</span></div>';
        html += '<div class="baris-total-detail"><span>Total</span><span>' + formatRupiah(p.totalBiaya) + '</span></div>';
        elIsiDetail.innerHTML = html;
        elOverlayDetail.className = 'overlay tampil';
    }
    elBtnTutupDetail.addEventListener('click', () => { elOverlayDetail.className = 'overlay'; });
    elOverlayDetail.addEventListener('click', (event) => { if (event.target === elOverlayDetail) elOverlayDetail.className = 'overlay'; });

    // ==== Cetak Struk (baris lunas) -- pola SAMA PERSIS dgn ringkasan-renderer.js::cetakStrukTransaksi ====

    async function cetakStrukPesanan(p) {
        if (!p.lunasId) {
            tampilkanToast('error', 'Transaksi belum lunas -- tidak ada struk untuk dicetak.');
            return;
        }
        tampilkanToast('info', 'Menyiapkan struk...');
        try {
            const hasil = await window.electronAPI.posAPI.detailTransaksi({ id: p.lunasId });
            if (!hasil.ok) {
                window.PesanDetail.tampilkanDariHasil(hasil);
                return;
            }
            await window.Struk.cetakDenganPreview(hasil.data);
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Menyiapkan Struk',
                teknis: e && e.message ? e.message : String(e)
            }));
        }
    }

    // ==== Hitung Ulang (diskon/cashback, draft ATAU sudah lunas -- lihat JavaDoc server pesananHitungUlang) ====

    async function hitungUlangPesanan(p, btn) {
        const semulaTeks = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menghitung...';
        try {
            const hasil = await window.electronAPI.posAPI.pesananHitungUlang({ draft_id: p.id });
            if (hasil.ok) {
                const d = hasil.data || {};
                tampilkanToast('success', 'Pesanan ' + (p.kode || '') + ' dihitung ulang. Diskon: ' + formatRupiah(d.totalDiskon || 0) + ', Cashback: ' + formatRupiah(d.totalCashback || 0) + (d.lunasDiperbarui ? ' (transaksi lunas ikut diperbarui)' : ''));
                muatSemua();
            } else {
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Menghitung Ulang',
                teknis: e && e.message ? e.message : String(e)
            }));
        } finally {
            btn.disabled = false;
            btn.textContent = semulaTeks;
        }
    }

    // ==== Bayar Semua (admin, massal -- padanan prosesBayarkanSemua JSP) ====
    // TIDAK transaksional lintas-baris (sama seperti JSP): tiap baris diproses satu-satu lewat jalur
    // verifikasi yg SAMA (prosesVerifikasiSatu), gagal satu baris tidak membatalkan baris lain --
    // hasil akhir ditally sukses/gagal & ditampilkan.

    async function prosesBayarSemua() {
        elBtnBayarSemua.disabled = true;
        elWrapProgressBayarSemua.style.display = 'flex';
        elProgressBayarSemuaBar.style.width = '0%';
        elProgressBayarSemuaTeks.textContent = 'Mengambil daftar pesanan belum lunas...';
        try {
            const filter = Object.assign({}, bacaFilter(), { hanya_belum_lunas: true, limit: 500 });
            const hasilDaftar = await window.electronAPI.posAPI.pesananList(filter);
            if (!hasilDaftar.ok) {
                window.PesanDetail.tampilkanDariHasil(hasilDaftar);
                return;
            }
            const belumLunas = (hasilDaftar.data.pesanan || []).filter((p) => p.dariPembeliOnline && !p.lunas);
            const total = belumLunas.length;
            if (total === 0) {
                tampilkanToast('info', 'Tidak ada pesanan online yang menunggu pembayaran sesuai filter saat ini.');
                return;
            }
            let sukses = 0, gagal = 0;
            for (let i = 0; i < total; i++) {
                const p = belumLunas[i];
                elProgressBayarSemuaTeks.textContent = 'Memproses ' + (i + 1) + ' / ' + total + ' -- ' + (p.kode || ('#' + p.id));
                elProgressBayarSemuaBar.style.width = Math.round(((i) / total) * 100) + '%';
                const caraBayarId = (p.caraBayarId != null ? p.caraBayarId : (semuaCaraBayar[0] && semuaCaraBayar[0].id));
                if (caraBayarId == null) { gagal++; continue; }
                try {
                    const hasil = await prosesVerifikasiSatu(p, caraBayarId);
                    if (hasil.ok) sukses++; else gagal++;
                } catch (e) {
                    gagal++;
                }
                elProgressBayarSemuaBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
            }
            elProgressBayarSemuaTeks.textContent = 'Selesai: ' + sukses + ' berhasil' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + ' dari ' + total + '.';
            tampilkanToast(gagal > 0 ? 'error' : 'success', 'Bayar Semua selesai: ' + sukses + ' berhasil' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + '.');
            muatSemua();
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Memproses Bayar Semua',
                teknis: e && e.message ? e.message : String(e)
            }));
        } finally {
            elBtnBayarSemua.disabled = false;
            setTimeout(() => { elWrapProgressBayarSemua.style.display = 'none'; }, 4000);
        }
    }

    elBtnBayarSemua.addEventListener('click', () => {
        const yakin = confirm('Proses pembayaran SEMUA pesanan online yang belum lunas sesuai filter saat ini?\n\nTiap pesanan diproses satu-satu -- proses ini tidak bisa dibatalkan di tengah jalan.');
        if (!yakin) return;
        prosesBayarSemua();
    });

    // ==== Batalkan ====

    async function batalkanPesanan(p) {
        const yakin = confirm('Batalkan pesanan ' + (p.kode || ('#' + p.id)) + ' dari ' + (p.pemesan || 'pelanggan umum') + '?\n\nData akan dihapus permanen dan tidak bisa dikembalikan.');
        if (!yakin) return;

        tampilkanToast('info', 'Membatalkan pesanan...');
        try {
            const hasil = await window.electronAPI.posAPI.pesananBatal({ id: p.id });
            if (hasil.ok) {
                tampilkanToast('success', 'Pesanan dibatalkan.');
                muatSemua();
            } else {
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: 'Gagal Membatalkan Pesanan',
                teknis: e && e.message ? e.message : String(e)
            }));
        }
    }

    // ==== Inisialisasi ====
    muatIdentitasMesinSayaPesanan().then(muatSemua);
    muatInfoCachePesanan();
    segarkanStatus();
    setInterval(segarkanStatus, 30000);
    // Auto-sync (segarkan daftar+cache) tiap 10 menit -- pola sama produk-renderer.js.
    setInterval(() => { muatSemua(); }, 600000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
