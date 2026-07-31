/**
 * laporan-transaksi-renderer.js -- Layar "Laporan Transaksi" (Report Order/Sesi/Payment), dibangun
 * persis mengikuti spesifikasi klien "Flow Kasir.pdf": 3 tab (Order/Sesi/Payment), masing-masing tabel
 * berpaginasi + filter tanggal, dan tombol "Detail Penjualan" di tiap baris Order yang membuka posisi
 * fiskal (nama produk/qty/harga/diskon/pajak/subtotal per item).
 *
 * Sumber data: window.electronAPI.posAPI.laporanTransaksi.{order,sesi,payment} (IPC -> PosApi aksi
 * laporan_order_list/laporan_sesi_list/laporan_payment_list, lihat JavaDoc server
 * PosApi.daftarOrderDenganSesi/prosesLaporanSesiList). "Detail Penjualan" MEMAKAI ULANG aksi
 * detail_transaksi yang sudah ada (dipakai juga oleh struk.js utk cetak struk) -- server itu TIDAK
 * menyimpan pajak/subtotal per baris item (hanya level header), jadi kolom Pajak & Subtotal di modal
 * DIHITUNG DI SINI: subtotal = qty*harga-diskon, pajak per baris = pajak header * (subtotal baris /
 * total subtotal semua baris) -- proporsional, konsisten dgn bagaimana pajak dihitung sbg persentase
 * atas total keranjang saat checkout (bukan per-item), BUKAN dibaca dari kolom database baru.
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');
    const elBtnSinkronTransaksiCache = document.getElementById('btnSinkronTransaksiCache');
    const elInfoCacheTransaksi = document.getElementById('infoCacheTransaksi');

    function formatRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
    function formatWaktu(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
        } catch (e) { /* abaikan */ }
        try {
            const cfg = await window.electronAPI.posAPI.konfigurasi();
            if (cfg.ok) elNamaToko.textContent = cfg.data.tokoNama || (cfg.data.userId ? ('Kasir - ' + cfg.data.userId) : 'Kasir');
        } catch (e) { /* abaikan */ }
    }

    // ---- Identitas mesin POS ini -- dipakai membedakan badge "Mesin Ini" vs nama mesin lain di
    // kolom "Mesin" tabel Report Order (gap-closure "banyak mesin POS satu toko"). Dibaca sekali di
    // init, cukup -- nama mesin sendiri tak berubah selama layar ini terbuka. ----
    let namaMesinSaya = null;
    async function muatIdentitasMesinSaya() {
        try {
            const r = await window.electronAPI.posAPI.identitasMesinBaca();
            if (r.ok && r.data) namaMesinSaya = r.data.namaMesin && r.data.namaMesin.trim() ? r.data.namaMesin.trim() : ('Mesin-' + r.data.idMesin.slice(0, 8));
        } catch (e) { /* abaikan -- badge fallback ke "-" jika tak diketahui */ }
    }

    /** @param {string|null} namaMesin dari baris data server @return {string} HTML badge "Mesin Ini"/nama mesin lain/"-" */
    function badgeMesin(namaMesin) {
        if (!namaMesin) return '<span style="color:var(--muted);">-</span>';
        if (namaMesinSaya && namaMesin === namaMesinSaya) return '<span class="badge hijau">Mesin Ini &middot; ' + escHtml(namaMesin) + '</span>';
        return '<span class="badge abu">' + escHtml(namaMesin) + '</span>';
    }

    // ==== Tab switcher ====
    const elTabBtn = document.querySelectorAll('.tab-btn');
    const elTabPanel = {
        order: document.getElementById('tabOrder'),
        sesi: document.getElementById('tabSesi'),
        payment: document.getElementById('tabPayment')
    };
    const pemuatTab = { order: muatOrder, sesi: muatSesi, payment: muatPayment };
    const sudahDimuat = { order: false, sesi: false, payment: false };
    let tabAktif = 'order';

    elTabBtn.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            tabAktif = tab;
            elTabBtn.forEach((b) => b.classList.toggle('aktif', b === btn));
            Object.keys(elTabPanel).forEach((k) => elTabPanel[k].classList.toggle('aktif', k === tab));
            if (!sudahDimuat[tab]) { sudahDimuat[tab] = true; pemuatTab[tab](); }
        });
    });

    elBtnMuatUlang.addEventListener('click', () => pemuatTab[tabAktif]());

    // ==== Helper paginasi generik ====
    function renderPaginasi(el, state, onGanti) {
        const totalHal = Math.max(1, Math.ceil(state.total / state.pageSize));
        el.innerHTML = '';
        const info = document.createElement('span');
        info.textContent = 'Halaman ' + state.page + ' dari ' + totalHal + ' (' + state.total + ' baris)';
        const tombolWrap = document.createElement('div');
        tombolWrap.className = 'tombol-hal';
        const btnMundur = document.createElement('button');
        btnMundur.className = 'btn-kecil'; btnMundur.type = 'button'; btnMundur.textContent = '< Sebelumnya';
        btnMundur.disabled = state.page <= 1;
        btnMundur.addEventListener('click', () => { state.page--; onGanti(); });
        const btnMaju = document.createElement('button');
        btnMaju.className = 'btn-kecil'; btnMaju.type = 'button'; btnMaju.textContent = 'Berikutnya >';
        btnMaju.disabled = state.page >= totalHal;
        btnMaju.addEventListener('click', () => { state.page++; onGanti(); });
        tombolWrap.appendChild(btnMundur); tombolWrap.appendChild(btnMaju);
        el.appendChild(info); el.appendChild(tombolWrap);
    }

    function tabelKosong(el, colspan, teks) {
        el.innerHTML = '<tbody><tr><td colspan="' + colspan + '"><div class="daftar-kosong"><span class="ico">&#128203;</span>' + escHtml(teks) + '</div></td></tr></tbody>';
    }

    // ==== Tab: Report Order ====
    const elTabelOrder = document.getElementById('tabelOrder');
    const elPaginasiOrder = document.getElementById('paginasiOrder');
    const elOrderTglMulai = document.getElementById('orderTglMulai');
    const elOrderTglSampai = document.getElementById('orderTglSampai');
    const elOrderCariPembeli = document.getElementById('orderCariPembeli');
    const elBtnOrderFilter = document.getElementById('btnOrderFilter');
    const stateOrder = { page: 1, pageSize: 20, total: 0 };

    function renderTabelOrder(data) {
        if (!data || !data.length) { tabelKosong(elTabelOrder, 9, 'Belum ada order pada rentang ini.'); return; }
        let html = '<thead><tr><th>Nomor ID Order</th><th>Nomor Nota</th><th>Tanggal</th><th>Kasir</th><th>Mesin</th>'
            + '<th>Pembeli</th><th>Metode</th><th class="num">Total</th><th></th></tr></thead><tbody>';
        data.forEach((o) => {
            html += '<tr><td class="kode-mono">' + escHtml(o.sesiKode) + '</td>'
                + '<td class="kode-mono">' + escHtml(o.nomorNota) + '</td>'
                + '<td>' + escHtml(formatWaktu(o.waktu)) + '</td>'
                + '<td>' + escHtml(o.kasir) + '</td>'
                + '<td>' + badgeMesin(o.namaMesin) + '</td>'
                + '<td>' + escHtml(o.pembeli) + '</td>'
                + '<td><span class="badge biru">' + escHtml(o.metode) + '</span></td>'
                + '<td class="num">' + formatRupiah(o.totalBiaya) + '</td>'
                + '<td><button type="button" class="btn-kecil detail-order" data-id="' + o.idTransaksi + '" data-diskon="' + o.totalDiskon + '" data-pajak="' + o.pajak + '">Detail Penjualan</button></td></tr>';
        });
        html += '</tbody>';
        elTabelOrder.innerHTML = html;
        elTabelOrder.querySelectorAll('.detail-order').forEach((btn) => {
            btn.addEventListener('click', () => bukaDetailPenjualan(btn.getAttribute('data-id'), Number(btn.getAttribute('data-diskon')), Number(btn.getAttribute('data-pajak'))));
        });
    }

    // Gap-closure "layar Laporan Transaksi selalu blank+spinner" (deep-analysis performa RAM 8GB) --
    // pola sama pos:dashboard-umum: paint SEKETIKA dari potret sukses TERAKHIR (bisa dari filter/sesi
    // sebelumnya), TETAP SELALU diikuti panggilan live (TIDAK PERNAH digantikan) -- kontrak "data
    // WAJIB terkini" TIDAK berubah.
    let orderDimuatSekaliDariCache = false;
    async function muatOrderDariCache() {
        try {
            const rCache = await window.electronAPI.posAPI.laporanTransaksi.orderCacheBaca();
            if (!rCache.ok || !rCache.data) return;
            renderTabelOrder(rCache.data.data || []);
        } catch (eCache) { /* cache belum ada/rusak -- lanjut ke live spt biasa */ }
    }
    async function muatOrder() {
        const perluOverlay = !orderDimuatSekaliDariCache;
        if (!orderDimuatSekaliDariCache) await muatOrderDariCache();
        if (perluOverlay) elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.laporanTransaksi.order({
                tglMulai: elOrderTglMulai.value || '', tglSampai: elOrderTglSampai.value || '',
                cariPembeli: elOrderCariPembeli.value.trim(), page: stateOrder.page, pageSize: stateOrder.pageSize
            });
            if (!r.ok) {
                if (perluOverlay) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelOrder, 9, 'Gagal memuat data.'); }
                else tampilkanToast('error', 'Gagal memperbarui Report Order dari server -- masih menampilkan data cache lokal terakhir.');
                return;
            }
            orderDimuatSekaliDariCache = true;
            stateOrder.total = r.data.total || 0;
            renderTabelOrder(r.data.data || []);
            renderPaginasi(elPaginasiOrder, stateOrder, muatOrder);
        } catch (e) {
            if (perluOverlay) tampilkanToast('error', 'Gagal memuat Report Order: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    elBtnOrderFilter.addEventListener('click', () => { stateOrder.page = 1; muatOrder(); });

    // ==== Tab: Report Sesi ====
    const elTabelSesi = document.getElementById('tabelSesi');
    const elPaginasiSesi = document.getElementById('paginasiSesi');
    const elSesiTglMulai = document.getElementById('sesiTglMulai');
    const elSesiTglSampai = document.getElementById('sesiTglSampai');
    const elBtnSesiFilter = document.getElementById('btnSesiFilter');
    const stateSesi = { page: 1, pageSize: 20, total: 0 };

    function renderTabelSesi(data) {
        if (!data || !data.length) { tabelKosong(elTabelSesi, 8, 'Belum ada sesi kasir pada rentang ini.'); return; }
        let html = '<thead><tr><th>Kode Sesi</th><th>Kasir</th><th>Nama POS</th><th>Waktu Buka</th>'
            + '<th>Waktu Tutup</th><th class="num">Saldo Awal</th><th class="num">Saldo Akhir</th><th>Status</th></tr></thead><tbody>';
        data.forEach((s) => {
            const badge = s.status === 'TUTUP' ? '<span class="badge abu">Tutup</span>' : '<span class="badge hijau">Buka</span>';
            const catatanAkhir = s.saldoAkhirDikonfirmasi ? '' : ' <span class="badge biru" title="Sesi masih berjalan -- angka proyeksi, belum dikonfirmasi kasir">Proyeksi</span>';
            html += '<tr><td class="kode-mono">' + escHtml(s.sesiKode) + '</td>'
                + '<td>' + escHtml(s.kasir) + '</td>'
                + '<td>' + escHtml(s.namaToko) + '</td>'
                + '<td>' + escHtml(formatWaktu(s.waktuBuka)) + '</td>'
                + '<td>' + escHtml(formatWaktu(s.waktuTutup)) + '</td>'
                + '<td class="num">' + formatRupiah(s.modalAwal) + '</td>'
                + '<td class="num">' + formatRupiah(s.saldoAkhir) + catatanAkhir + '</td>'
                + '<td>' + badge + '</td></tr>';
        });
        html += '</tbody>';
        elTabelSesi.innerHTML = html;
    }

    let sesiDimuatSekaliDariCache = false;
    async function muatSesiDariCache() {
        try {
            const rCache = await window.electronAPI.posAPI.laporanTransaksi.sesiCacheBaca();
            if (!rCache.ok || !rCache.data) return;
            renderTabelSesi(rCache.data.data || []);
        } catch (eCache) { /* cache belum ada/rusak -- lanjut ke live spt biasa */ }
    }
    async function muatSesi() {
        const perluOverlay = !sesiDimuatSekaliDariCache;
        if (!sesiDimuatSekaliDariCache) await muatSesiDariCache();
        if (perluOverlay) elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.laporanTransaksi.sesi({
                tglMulai: elSesiTglMulai.value || '', tglSampai: elSesiTglSampai.value || '',
                page: stateSesi.page, pageSize: stateSesi.pageSize
            });
            if (!r.ok) {
                if (perluOverlay) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelSesi, 8, 'Gagal memuat data.'); }
                else tampilkanToast('error', 'Gagal memperbarui Report Sesi dari server -- masih menampilkan data cache lokal terakhir.');
                return;
            }
            sesiDimuatSekaliDariCache = true;
            stateSesi.total = r.data.total || 0;
            renderTabelSesi(r.data.data || []);
            renderPaginasi(elPaginasiSesi, stateSesi, muatSesi);
        } catch (e) {
            if (perluOverlay) tampilkanToast('error', 'Gagal memuat Report Sesi: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    elBtnSesiFilter.addEventListener('click', () => { stateSesi.page = 1; muatSesi(); });

    // ==== Tab: Report Payment ====
    const elTabelPayment = document.getElementById('tabelPayment');
    const elPaginasiPayment = document.getElementById('paginasiPayment');
    const elPaymentTglMulai = document.getElementById('paymentTglMulai');
    const elPaymentTglSampai = document.getElementById('paymentTglSampai');
    const elBtnPaymentFilter = document.getElementById('btnPaymentFilter');
    const statePayment = { page: 1, pageSize: 20, total: 0 };

    function renderTabelPayment(data) {
        if (!data || !data.length) { tabelKosong(elTabelPayment, 5, 'Belum ada pembayaran pada rentang ini.'); return; }
        let html = '<thead><tr><th>Tanggal &amp; Jam</th><th>Metode</th><th>Order</th><th>Sesi</th><th class="num">Jumlah</th></tr></thead><tbody>';
        data.forEach((p) => {
            html += '<tr><td>' + escHtml(formatWaktu(p.waktu)) + '</td>'
                + '<td><span class="badge biru">' + escHtml(p.metode) + '</span></td>'
                + '<td class="kode-mono">' + escHtml(p.orderKode) + '</td>'
                + '<td class="kode-mono">' + escHtml(p.sesiKode) + '</td>'
                + '<td class="num">' + formatRupiah(p.jumlah) + '</td></tr>';
        });
        html += '</tbody>';
        elTabelPayment.innerHTML = html;
    }

    let paymentDimuatSekaliDariCache = false;
    async function muatPaymentDariCache() {
        try {
            const rCache = await window.electronAPI.posAPI.laporanTransaksi.paymentCacheBaca();
            if (!rCache.ok || !rCache.data) return;
            renderTabelPayment(rCache.data.data || []);
        } catch (eCache) { /* cache belum ada/rusak -- lanjut ke live spt biasa */ }
    }
    async function muatPayment() {
        const perluOverlay = !paymentDimuatSekaliDariCache;
        if (!paymentDimuatSekaliDariCache) await muatPaymentDariCache();
        if (perluOverlay) elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.laporanTransaksi.payment({
                tglMulai: elPaymentTglMulai.value || '', tglSampai: elPaymentTglSampai.value || '',
                page: statePayment.page, pageSize: statePayment.pageSize
            });
            if (!r.ok) {
                if (perluOverlay) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelPayment, 5, 'Gagal memuat data.'); }
                else tampilkanToast('error', 'Gagal memperbarui Report Payment dari server -- masih menampilkan data cache lokal terakhir.');
                return;
            }
            paymentDimuatSekaliDariCache = true;
            statePayment.total = r.data.total || 0;
            renderTabelPayment(r.data.data || []);
            renderPaginasi(elPaginasiPayment, statePayment, muatPayment);
        } catch (e) {
            if (perluOverlay) tampilkanToast('error', 'Gagal memuat Report Payment: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    elBtnPaymentFilter.addEventListener('click', () => { statePayment.page = 1; muatPayment(); });

    // ==== Modal "Detail Penjualan" (posisi fiskal) ====
    const elOverlayDetail = document.getElementById('overlayDetailPenjualan');
    const elBtnTutupDetail = document.getElementById('btnTutupDetailPenjualan');
    const elRingkasFiskal = document.getElementById('ringkasFiskalDetail');
    const elTabelDetail = document.getElementById('tabelDetailPenjualan');

    async function bukaDetailPenjualan(idTransaksi, totalDiskonHeader, pajakHeader) {
        elOverlayDetail.classList.add('tampil');
        elRingkasFiskal.innerHTML = '';
        tabelKosong(elTabelDetail, 6, 'Memuat...');
        try {
            const r = await window.electronAPI.posAPI.detailTransaksi({ id: idTransaksi });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelDetail, 6, 'Gagal memuat detail.'); return; }
            const d = r.data;
            const item = d.item || [];
            // Subtotal per baris DIHITUNG di sini (server tak menyimpan kolom subtotal per-item);
            // pajak per baris DIPROPORSIKAN dari pajak header sesuai andil subtotal baris itu --
            // lihat JavaDoc modul ini utk alasan lengkap.
            const baris = item.map((it) => {
                const subtotal = (Number(it.harga) || 0) * (Number(it.qty) || 0) - (Number(it.diskon) || 0);
                return { nama: it.nama, qty: it.qty, harga: it.harga, diskon: it.diskon, subtotal: subtotal };
            });
            const totalSubtotal = baris.reduce((a, b) => a + b.subtotal, 0);
            baris.forEach((b) => { b.pajak = totalSubtotal > 0 ? pajakHeader * (b.subtotal / totalSubtotal) : 0; });

            elRingkasFiskal.innerHTML =
                '<div class="item"><div class="lbl">Total Diskon</div><div class="val">' + formatRupiah(totalDiskonHeader) + '</div></div>'
                + '<div class="item"><div class="lbl">Pajak</div><div class="val">' + formatRupiah(pajakHeader) + '</div></div>'
                + '<div class="item"><div class="lbl">Total Bayar</div><div class="val">' + formatRupiah(d.totalBiaya) + '</div></div>';

            let html = '<thead><tr><th>Nama Produk</th><th class="num">Qty</th><th class="num">Harga Jual</th>'
                + '<th class="num">Diskon</th><th class="num">Pajak</th><th class="num">Subtotal</th></tr></thead><tbody>';
            baris.forEach((b) => {
                html += '<tr><td>' + escHtml(b.nama) + '</td><td class="num">' + b.qty + '</td>'
                    + '<td class="num">' + formatRupiah(b.harga) + '</td><td class="num">' + formatRupiah(b.diskon) + '</td>'
                    + '<td class="num">' + formatRupiah(b.pajak) + '</td><td class="num">' + formatRupiah(b.subtotal) + '</td></tr>';
            });
            html += '</tbody>';
            elTabelDetail.innerHTML = html;
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat detail penjualan: ' + (e && e.message ? e.message : e));
        }
    }
    elBtnTutupDetail.addEventListener('click', () => elOverlayDetail.classList.remove('tampil'));
    elOverlayDetail.addEventListener('click', (e) => { if (e.target === elOverlayDetail) elOverlayDetail.classList.remove('tampil'); });

    // ==== Dasbor statistik (gap-closure paritas Produk/Anggota + "bedakan antar mesin/siapa entry") ====

    function formatWaktuCacheTransaksi(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function buatBarHorizontalTransaksi(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong">Belum ada data.</div>'; return; }
        const maks = Math.max.apply(null, data.map((d) => d.nilai)) || 1;
        data.forEach((d, i) => {
            const baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.nilai / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = formatRupiah(d.nilai);
            container.appendChild(baris);
        });
    }

    async function muatStatistikTransaksi() {
        const r = await window.electronAPI.posAPI.laporanTransaksi.statistik();
        if (!r.ok || !r.data) {
            if (elInfoCacheTransaksi) elInfoCacheTransaksi.textContent = 'Gagal memuat statistik: ' + (r.pesan || 'tidak diketahui');
            return;
        }
        const d = r.data;
        document.getElementById('kpiTrxHariIni').textContent = String(d.trxHariIni || 0);
        document.getElementById('kpiOmzetHariIni').textContent = formatRupiah(d.omzetHariIni || 0);
        document.getElementById('kpiTrx30Hari').textContent = String(d.trx30Hari || 0);
        document.getElementById('kpiOmzet30Hari').textContent = formatRupiah(d.omzet30Hari || 0);
        buatBarHorizontalTransaksi(document.getElementById('barKasirTransaksi'), d.byKasir || []);
        buatBarHorizontalTransaksi(document.getElementById('barMesinTransaksi'), d.byMesin || []);
        if (elInfoCacheTransaksi) {
            elInfoCacheTransaksi.textContent = r.dariCache
                ? ('\u{26A0}\u{FE0F} Offline -- menampilkan cache lokal' + (formatWaktuCacheTransaksi(r.disimpanPada) ? ' (terakhir disinkron ' + formatWaktuCacheTransaksi(r.disimpanPada) + ')' : '') + '.')
                : '\u{2705} Data terkini dari server -- otomatis tersimpan ke cache lokal.';
        }
    }

    if (elBtnSinkronTransaksiCache) {
        elBtnSinkronTransaksiCache.addEventListener('click', async () => {
            elBtnSinkronTransaksiCache.disabled = true;
            const teksAsli = elBtnSinkronTransaksiCache.innerHTML;
            elBtnSinkronTransaksiCache.innerHTML = '&#8987; Menyinkronkan...';
            try {
                await muatStatistikTransaksi();
                tampilkanToast('success', 'Statistik transaksi disinkronkan.');
            } catch (e) {
                tampilkanToast('error', 'Gagal menyinkronkan: ' + (e && e.message ? e.message : e));
            } finally {
                elBtnSinkronTransaksiCache.disabled = false;
                elBtnSinkronTransaksiCache.innerHTML = teksAsli;
            }
        });
    }

    // ==== Inisialisasi ====
    segarkanStatus();
    sudahDimuat.order = true;
    muatIdentitasMesinSaya().then(muatOrder);
    muatStatistikTransaksi();
    setInterval(segarkanStatus, 30000);
    // Auto-sync statistik tiap 10 menit (pola sama produk-renderer.js).
    setInterval(() => { if (elBtnSinkronTransaksiCache && !elBtnSinkronTransaksiCache.disabled) muatStatistikTransaksi(); }, 600000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
