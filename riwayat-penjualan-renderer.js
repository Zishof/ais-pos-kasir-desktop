/**
 * riwayat-penjualan-renderer.js -- Layar "Riwayat Penjualan": pencarian transaksi yang sudah dibayar
 * + cetak ulang struk, TERPISAH dari "Laporan Transaksi" (analitik/rekap: KPI, omzet per kasir/mesin,
 * 3 tab Order/Sesi/Payment) -- gap-closure permintaan Toko Al-Bahjah "menu utk history data penjualan".
 *
 * Sengaja TIDAK menambah aksi server baru -- daftar transaksi memakai ULANG aksi {@code
 * laporan_order_list} (sama dipakai tab "Report Order" milik Laporan Transaksi, lihat JavaDoc
 * PosApi.prosesLaporanOrderList) dan rincian + cetak ulang struk memakai ULANG aksi {@code
 * detail_transaksi} + {@code window.Struk.cetakDenganPreview} (sama persis dipakai tombol "Cetak
 * Struk" per baris riwayat di layar Ringkasan, lihat JavaDoc struk.js) -- SATU sumber data & SATU
 * logika cetak, supaya tak ada 2 implementasi yg diam-diam bisa berbeda perilaku.
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');

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

    function tabelKosong(el, colspan, teks) {
        el.innerHTML = '<tbody><tr><td colspan="' + colspan + '"><div class="daftar-kosong"><span class="ico">&#128337;</span>' + escHtml(teks) + '</div></td></tr></tbody>';
    }

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

    // ==== Daftar transaksi ====
    const elTabelRp = document.getElementById('tabelRp');
    const elPaginasiRp = document.getElementById('paginasiRp');
    const elRpTglMulai = document.getElementById('rpTglMulai');
    const elRpTglSampai = document.getElementById('rpTglSampai');
    const elRpCariPembeli = document.getElementById('rpCariPembeli');
    const elBtnRpFilter = document.getElementById('btnRpFilter');
    const stateRp = { page: 1, pageSize: 20, total: 0 };

    function renderTabelRp(data) {
        if (!data || !data.length) { tabelKosong(elTabelRp, 7, 'Belum ada transaksi pada rentang ini.'); return; }
        let html = '<thead><tr><th>Nomor Nota</th><th>Tanggal</th><th>Kasir</th>'
            + '<th>Pembeli</th><th>Metode</th><th class="num">Total</th><th></th></tr></thead><tbody>';
        data.forEach((o) => {
            html += '<tr>'
                + '<td class="kode-mono">' + escHtml(o.nomorNota) + '</td>'
                + '<td>' + escHtml(formatWaktu(o.waktu)) + '</td>'
                + '<td>' + escHtml(o.kasir) + '</td>'
                + '<td>' + escHtml(o.pembeli) + '</td>'
                + '<td><span class="badge biru">' + escHtml(o.metode) + '</span></td>'
                + '<td class="num">' + formatRupiah(o.totalBiaya) + '</td>'
                + '<td class="aksi-baris">'
                    + '<button type="button" class="btn-kecil detail-rp" data-id="' + o.idTransaksi + '" data-diskon="' + o.totalDiskon + '" data-pajak="' + o.pajak + '">Detail</button>'
                    + '<button type="button" class="btn-kecil hijau cetak-rp" data-id="' + o.idTransaksi + '">Cetak Struk</button>'
                + '</td></tr>';
        });
        html += '</tbody>';
        elTabelRp.innerHTML = html;
        elTabelRp.querySelectorAll('.detail-rp').forEach((btn) => {
            btn.addEventListener('click', () => bukaDetailPenjualan(btn.getAttribute('data-id'), Number(btn.getAttribute('data-diskon')), Number(btn.getAttribute('data-pajak'))));
        });
        elTabelRp.querySelectorAll('.cetak-rp').forEach((btn) => {
            btn.addEventListener('click', () => cetakUlangStruk(btn.getAttribute('data-id')));
        });
    }

    async function muatRp() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.laporanTransaksi.order({
                tglMulai: elRpTglMulai.value || '', tglSampai: elRpTglSampai.value || '',
                cariPembeli: elRpCariPembeli.value.trim(), page: stateRp.page, pageSize: stateRp.pageSize
            });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelRp, 7, 'Gagal memuat data.'); return; }
            stateRp.total = r.data.total || 0;
            renderTabelRp(r.data.data || []);
            renderPaginasi(elPaginasiRp, stateRp, muatRp);
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat Riwayat Penjualan: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    elBtnRpFilter.addEventListener('click', () => { stateRp.page = 1; muatRp(); });
    elBtnMuatUlang.addEventListener('click', () => muatRp());

    /**
     * Cetak ulang struk LANGSUNG dari baris tabel (tanpa buka modal Detail dulu) -- pola & data sama
     * persis dgn {@code cetakStrukTransaksi} di ringkasan-renderer.js: ambil rincian via {@code
     * posAPI.detailTransaksi} lalu serahkan ke {@code window.Struk.cetakDenganPreview}.
     */
    async function cetakUlangStruk(id) {
        try {
            const hasil = await window.electronAPI.posAPI.detailTransaksi({ id: id });
            if (!hasil.ok) { window.PesanDetail.tampilkanDariHasil(hasil); return; }
            window.Struk.cetakDenganPreview(hasil.data);
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat data struk: ' + (e && e.message ? e.message : e));
        }
    }

    // ==== Modal "Detail Penjualan" (posisi fiskal) -- reuse pola laporan-transaksi-renderer.js ====
    const elOverlayDetail = document.getElementById('overlayDetailPenjualan');
    const elBtnTutupDetail = document.getElementById('btnTutupDetailPenjualan');
    const elBtnTutupDetail2 = document.getElementById('btnTutupDetailPenjualan2');
    const elBtnCetakUlangStrukModal = document.getElementById('btnCetakUlangStruk');
    const elRingkasFiskal = document.getElementById('ringkasFiskalDetail');
    const elTabelDetail = document.getElementById('tabelDetailPenjualan');
    let idTransaksiDetailAktif = null;

    async function bukaDetailPenjualan(idTransaksi, totalDiskonHeader, pajakHeader) {
        idTransaksiDetailAktif = idTransaksi;
        elOverlayDetail.classList.add('tampil');
        elRingkasFiskal.innerHTML = '';
        tabelKosong(elTabelDetail, 6, 'Memuat...');
        try {
            const r = await window.electronAPI.posAPI.detailTransaksi({ id: idTransaksi });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelDetail, 6, 'Gagal memuat detail.'); return; }
            const d = r.data;
            const item = d.item || [];
            // Subtotal per baris DIHITUNG di sini (server tak menyimpan kolom subtotal per-item);
            // pajak per baris DIPROPORSIKAN dari pajak header -- pola sama persis laporan-transaksi-renderer.js.
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
            tampilkanToast('error', 'Gagal memuat detail: ' + (e && e.message ? e.message : e));
        }
    }

    function tutupDetailPenjualan() {
        elOverlayDetail.classList.remove('tampil');
        idTransaksiDetailAktif = null;
    }
    elBtnTutupDetail.addEventListener('click', tutupDetailPenjualan);
    elBtnTutupDetail2.addEventListener('click', tutupDetailPenjualan);
    elOverlayDetail.addEventListener('click', (ev) => { if (ev.target === elOverlayDetail) tutupDetailPenjualan(); });
    elBtnCetakUlangStrukModal.addEventListener('click', () => {
        if (idTransaksiDetailAktif != null) cetakUlangStruk(idTransaksiDetailAktif);
    });

    document.addEventListener('DOMContentLoaded', () => {
        segarkanStatus();
        setInterval(segarkanStatus, 30000);
        muatRp();
    });
})();
