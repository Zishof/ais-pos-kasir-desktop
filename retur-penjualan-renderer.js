/**
 * retur-penjualan-renderer.js -- Layar "Retur Penjualan": catat barang kembali dari pelanggan
 * (rusak/salah/tidak sesuai), 2 langkah (cari transaksi asal -> pilih barang + detail), lalu simpan
 * lewat aksi server BARU {@code retur_penjualan_simpan} (stok otomatis di-recompute server-side,
 * HANYA bertambah utk barang berkondisi baik -- lihat JavaDoc KantinHelper.returPenjualanSimpan /
 * ReturPenjualan.getKembalikanKeStok()).
 *
 * Langkah 1 (cari transaksi) SENGAJA memakai ULANG aksi {@code laporan_order_list} (window.electronAPI
 * .posAPI.laporanTransaksi.order, sama dipakai layar Riwayat Penjualan/Laporan Transaksi) alih-alih
 * bikin aksi pencarian baru -- satu sumber pencarian transaksi utk seluruh aplikasi. Langkah 2 (ambil
 * rincian item) memakai ULANG {@code detail_transaksi} (sama dipakai cetak ulang struk).
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

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    // Ubah/Hapus retur digerbang Supervisor server-side (KantinHelper.returPenjualanUbah/Hapus) --
    // dibaca sekali di sini MURNI utk sembunyikan tombol dari kasir biasa (pengalaman pakai), gerbang
    // SEBENARNYA tetap di server spt pola akses-menu.js/kulakan-renderer.js.
    let isSupervisor = false;

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan */ }
        try {
            const cfg = await window.electronAPI.posAPI.konfigurasi();
            if (cfg.ok) {
                elNamaToko.textContent = cfg.data.tokoNama || (cfg.data.userId ? ('Kasir - ' + cfg.data.userId) : 'Kasir');
                isSupervisor = !!cfg.data.supervisorPedagang;
            }
        } catch (e) { /* abaikan */ }
    }

    function tabelKosong(el, colspan, teks) {
        el.innerHTML = '<tbody><tr><td colspan="' + colspan + '"><div class="daftar-kosong"><span class="ico">&#8617;&#65039;</span>' + escHtml(teks) + '</div></td></tr></tbody>';
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

    // ==== View switcher ====
    const elViewRiwayat = document.getElementById('viewRiwayat');
    const elViewCari = document.getElementById('viewCari');
    const elViewPilihBarang = document.getElementById('viewPilihBarang');
    function tampilkanView(id) {
        [elViewRiwayat, elViewCari, elViewPilihBarang].forEach((v) => v.classList.toggle('aktif', v.id === id));
    }

    // ==== View: Riwayat Retur ====
    const elTabelRiwayat = document.getElementById('tabelRiwayatRetur');
    const elPaginasiRv = document.getElementById('paginasiRv');
    const elRvKeyword = document.getElementById('rvKeyword');
    const stateRv = { page: 1, pageSize: 20, total: 0 };

    let riwayatTerakhir = []; // cache baris terakhir dimuat -- dipakai bukaModalUbah cari data by id tanpa panggil server lagi

    function renderTabelRiwayat(data) {
        riwayatTerakhir = data || [];
        if (!data || !data.length) { tabelKosong(elTabelRiwayat, 8, 'Belum ada retur penjualan tercatat.'); return; }
        let html = '<thead><tr><th>Waktu</th><th>Nota Asal</th><th>Produk</th><th>Pembeli</th>'
            + '<th class="num">Qty</th><th class="num">Nilai Retur</th><th>Balik ke Stok?</th>' + (isSupervisor ? '<th></th>' : '') + '</tr></thead><tbody>';
        data.forEach((r) => {
            const balik = r.kembalikanKeStok
                ? '<span class="badge hijau">Ya</span>'
                : '<span class="badge abu">Tidak (Rusak)</span>';
            html += '<tr>'
                + '<td>' + escHtml(r.waktu) + '</td>'
                + '<td class="kode-mono">' + escHtml(r.kodeTransaksiAsal) + '</td>'
                + '<td style="font-weight:700;">' + escHtml(r.namaProduk) + '<br><small style="color:var(--muted);">' + escHtml(r.alasan) + '</small></td>'
                + '<td>' + escHtml(r.namaPembeli) + '</td>'
                + '<td class="num">' + r.qty + '</td>'
                + '<td class="num" style="color:var(--danger);">' + formatRupiah(r.totalNilai) + '</td>'
                + '<td>' + balik + '</td>';
            if (isSupervisor) {
                html += '<td class="aksi-baris">'
                    + '<button type="button" class="btn-kecil ubah-retur" data-id="' + r.id + '">Ubah</button>'
                    + '<button type="button" class="btn-kecil merah hapus-retur" data-id="' + r.id + '">Hapus</button>'
                    + '</td>';
            }
            html += '</tr>';
        });
        html += '</tbody>';
        elTabelRiwayat.innerHTML = html;
        if (isSupervisor) {
            elTabelRiwayat.querySelectorAll('.ubah-retur').forEach((btn) => {
                btn.addEventListener('click', () => bukaModalUbahRetur(Number(btn.getAttribute('data-id'))));
            });
            elTabelRiwayat.querySelectorAll('.hapus-retur').forEach((btn) => {
                btn.addEventListener('click', () => hapusRetur(Number(btn.getAttribute('data-id'))));
            });
        }
    }

    // Gap-closure "layar Retur Penjualan selalu blank+spinner" (deep-analysis performa RAM 8GB) --
    // pola sama pos:dashboard-umum: paint SEKETIKA dari potret sukses TERAKHIR, SELALU diikuti live.
    let rvDimuatSekaliDariCache = false;
    async function muatRiwayatDariCache() {
        try {
            const rCache = await window.electronAPI.posAPI.returPenjualan.listCacheBaca();
            if (!rCache.ok || !rCache.data) return;
            renderTabelRiwayat(rCache.data.data || []);
        } catch (eCache) { /* cache belum ada/rusak -- lanjut ke live spt biasa */ }
    }
    async function muatRiwayat() {
        const perluOverlay = !rvDimuatSekaliDariCache;
        if (!rvDimuatSekaliDariCache) await muatRiwayatDariCache();
        if (perluOverlay) elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.returPenjualan.list({
                // NB: aksi retur_penjualan_list pakai konvensi snake_case "page_size" (mengikuti
                // kulakan_list), BEDA dari laporan_order_list yg pakai camelCase "pageSize" -- lihat
                // KantinHelper.returPenjualanList/kulakanList vs PosApi.daftarOrderDenganSesi.
                keyword: elRvKeyword.value.trim(), page: stateRv.page, page_size: stateRv.pageSize
            });
            if (!r.ok) {
                if (perluOverlay) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelRiwayat, 7, 'Gagal memuat data.'); }
                else tampilkanToast('error', 'Gagal memperbarui riwayat retur dari server -- masih menampilkan data cache lokal terakhir.');
                return;
            }
            rvDimuatSekaliDariCache = true;
            stateRv.total = r.data.total || 0;
            renderTabelRiwayat(r.data.data || []);
            renderPaginasi(elPaginasiRv, stateRv, muatRiwayat);
        } catch (e) {
            if (perluOverlay) tampilkanToast('error', 'Gagal memuat riwayat retur: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }
    document.getElementById('btnRvFilter').addEventListener('click', () => { stateRv.page = 1; muatRiwayat(); });
    elBtnMuatUlang.addEventListener('click', () => {
        if (elViewRiwayat.classList.contains('aktif')) muatRiwayat();
    });

    // ==== View: Langkah 1 - Cari Transaksi ====
    const elCariNota = document.getElementById('cariNota');
    const elHasilCari = document.getElementById('hasilCariTransaksi');

    document.getElementById('btnReturBaru').addEventListener('click', () => {
        elCariNota.value = '';
        elHasilCari.innerHTML = '';
        tampilkanView('viewCari');
    });
    document.getElementById('btnBatalCari').addEventListener('click', () => tampilkanView('viewRiwayat'));
    document.getElementById('btnBatalPilih').addEventListener('click', () => { muatRiwayat(); tampilkanView('viewRiwayat'); });

    async function cariTransaksiAsal() {
        const kw = elCariNota.value.trim();
        if (!kw) { tampilkanToast('error', 'Ketik nomor nota atau nama pembeli dulu.'); return; }
        elHasilCari.innerHTML = '<div class="daftar-kosong">Mencari...</div>';
        try {
            const r = await window.electronAPI.posAPI.laporanTransaksi.order({ cariPembeli: kw, page: 1, pageSize: 25 });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); elHasilCari.innerHTML = ''; return; }
            let data = r.data.data || [];
            // Filter tambahan by nomor nota di klien (server hanya menyaring by nama pembeli lewat cariPembeli).
            const kwLower = kw.toLowerCase();
            const dataDenganNota = data.filter((o) => (o.nomorNota || '').toLowerCase().includes(kwLower) || (o.pembeli || '').toLowerCase().includes(kwLower));
            const hasil = dataDenganNota.length ? dataDenganNota : data;
            if (!hasil.length) { elHasilCari.innerHTML = '<div class="daftar-kosong"><span class="ico">&#128269;</span>Transaksi tidak ditemukan.</div>'; return; }
            elHasilCari.innerHTML = '';
            hasil.forEach((o) => {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'item-hasil-cari';
                btn.innerHTML = '<span><b style="color:var(--primary);">' + escHtml(o.nomorNota) + '</b> &middot; ' + escHtml(o.pembeli) + '<br><small style="color:var(--muted);">' + escHtml(o.waktu) + '</small></span>'
                    + '<span style="font-weight:800;color:var(--success);">' + formatRupiah(o.totalBiaya) + '</span>';
                btn.addEventListener('click', () => pilihTransaksiAsal(o.idTransaksi, o.nomorNota, o.pembeli));
                elHasilCari.appendChild(btn);
            });
        } catch (e) {
            elHasilCari.innerHTML = '<div class="daftar-kosong">Gagal mencari: ' + escHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnCariNota').addEventListener('click', cariTransaksiAsal);
    elCariNota.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); cariTransaksiAsal(); } });

    // ==== View: Langkah 2 - Pilih Barang ====
    let transaksiAsalAktif = { id: null, kode: '', pembeli: '' };
    const elTabelItemAsal = document.getElementById('tabelItemAsal');
    const elLabelTransaksiAsal = document.getElementById('labelTransaksiAsal');
    const elTotalNilaiRetur = document.getElementById('totalNilaiRetur');
    const ALASAN_RETUR = ['Rusak', 'Salah Ukuran/Varian', 'Tidak Sesuai Pesanan', 'Berubah Pikiran', 'Kadaluarsa', 'Lainnya'];
    const KONDISI_BARANG = ['Baik (Layak Jual Lagi)', 'Rusak (Tidak Layak Jual)'];

    async function pilihTransaksiAsal(idTransaksi, kode, pembeli) {
        transaksiAsalAktif = { id: idTransaksi, kode: kode, pembeli: pembeli };
        elLabelTransaksiAsal.textContent = kode + ' -- ' + pembeli;
        tabelKosong(elTabelItemAsal, 5, 'Memuat item...');
        tampilkanView('viewPilihBarang');
        try {
            const r = await window.electronAPI.posAPI.detailTransaksi({ id: idTransaksi });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); tabelKosong(elTabelItemAsal, 5, 'Gagal memuat item.'); return; }
            const optAlasan = ALASAN_RETUR.map((a) => '<option value="' + a + '">' + a + '</option>').join('');
            const optKondisi = KONDISI_BARANG.map((k) => '<option value="' + k + '">' + k + '</option>').join('');
            let html = '<thead><tr><th></th><th>Produk</th><th class="num">Qty Beli</th><th>Qty Retur</th><th>Alasan</th><th>Kondisi Barang</th></tr></thead><tbody>';
            (r.data.item || []).forEach((it, idx) => {
                html += '<tr class="baris-item-retur" data-produk-nama="' + escHtml(it.nama) + '" data-harga="' + (it.harga || 0) + '" data-qty-beli="' + (it.qty || 0) + '">'
                    + '<td><input type="checkbox" class="chk-produk-retur" data-idx="' + idx + '"></td>'
                    + '<td style="font-weight:700;">' + escHtml(it.nama) + '<br><small style="color:var(--muted);">Harga saat beli: ' + formatRupiah(it.harga) + '</small></td>'
                    + '<td class="num">' + it.qty + '</td>'
                    + '<td><input type="number" class="inp-qty-retur" min="0.01" max="' + it.qty + '" step="0.01" value="' + it.qty + '" disabled style="width:80px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;"></td>'
                    + '<td><select class="sel-alasan-retur" disabled style="padding:4px 6px;border:1px solid var(--border);border-radius:6px;">' + optAlasan + '</select></td>'
                    + '<td><select class="sel-kondisi-retur" disabled style="padding:4px 6px;border:1px solid var(--border);border-radius:6px;">' + optKondisi + '</select></td>'
                    + '</tr>';
                // NB: produk_id tidak dikembalikan detail_transaksi (hanya nama) -- disimpan terpisah via idx->produkId map di bawah.
            });
            html += '</tbody>';
            elTabelItemAsal.innerHTML = html;

            // detail_transaksi tidak mengembalikan produk_id per item (hanya nama, lihat JavaDoc server
            // PosApi.prosesDetailTransaksi) -- perlu resolusi terpisah by nama+toko sebelum submit. Simpan
            // array item mentah di closure supaya bisa dicocokkan saat simpan.
            window.__itemAsalRetur = r.data.item || [];

            elTabelItemAsal.querySelectorAll('.chk-produk-retur').forEach((chk) => {
                chk.addEventListener('change', function () {
                    const tr = this.closest('tr');
                    tr.querySelectorAll('input, select').forEach((el) => { if (el !== this) el.disabled = !this.checked; });
                    hitungTotalRetur();
                });
            });
            elTabelItemAsal.querySelectorAll('.inp-qty-retur').forEach((inp) => inp.addEventListener('input', hitungTotalRetur));
            hitungTotalRetur();
        } catch (e) {
            tabelKosong(elTabelItemAsal, 5, 'Gagal memuat: ' + (e && e.message ? e.message : e));
        }
    }

    function hitungTotalRetur() {
        let total = 0;
        elTabelItemAsal.querySelectorAll('.baris-item-retur').forEach((tr) => {
            const chk = tr.querySelector('.chk-produk-retur');
            if (chk && chk.checked) {
                const qty = parseFloat(tr.querySelector('.inp-qty-retur').value) || 0;
                const harga = parseFloat(tr.getAttribute('data-harga')) || 0;
                total += qty * harga;
            }
        });
        elTotalNilaiRetur.textContent = formatRupiah(total);
    }

    document.getElementById('btnSimpanRetur').addEventListener('click', async () => {
        const items = [];
        let adaError = false;
        const barisTerpilih = Array.from(elTabelItemAsal.querySelectorAll('.baris-item-retur'));
        barisTerpilih.forEach((tr, idx) => {
            const chk = tr.querySelector('.chk-produk-retur');
            if (!chk || !chk.checked) return;
            const qty = parseFloat(tr.querySelector('.inp-qty-retur').value) || 0;
            const qtyBeli = parseFloat(tr.getAttribute('data-qty-beli')) || 0;
            if (qty <= 0 || qty > qtyBeli) { adaError = true; return; }
            const kondisi = tr.querySelector('.sel-kondisi-retur').value;
            const itemAsal = (window.__itemAsalRetur || [])[idx];
            if (!itemAsal || itemAsal.produkId == null) { adaError = true; return; }
            items.push({
                produk_id: itemAsal.produkId,
                qty: qty,
                harga_satuan: parseFloat(tr.getAttribute('data-harga')) || 0,
                alasan: tr.querySelector('.sel-alasan-retur').value,
                kondisi_barang: kondisi,
                kembalikan_ke_stok: !kondisi.toLowerCase().includes('rusak')
            });
        });

        if (adaError) { tampilkanToast('error', 'Ada baris tidak valid (qty melebihi jumlah beli, atau produk tak dikenali).'); return; }
        if (!items.length) { tampilkanToast('error', 'Pilih minimal satu barang untuk diretur.'); return; }

        const btn = document.getElementById('btnSimpanRetur');
        const oriHtml = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.returPenjualan.simpan({
                pembelian_anggota_koperasi_id: transaksiAsalAktif.id,
                kode_transaksi_asal: transaksiAsalAktif.kode,
                nama_pembeli: transaksiAsalAktif.pembeli,
                metode_pengembalian: document.getElementById('metodePengembalian').value,
                items: items
            });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', 'Retur penjualan berhasil disimpan.');
            muatRiwayat();
            tampilkanView('viewRiwayat');
        } catch (e) {
            tampilkanToast('error', 'Gagal menyimpan retur: ' + (e && e.message ? e.message : e));
        } finally {
            btn.disabled = false; btn.innerHTML = oriHtml;
        }
    });

    // ==== Ubah/Hapus retur (Supervisor) ====
    const elOverlayUbahRetur = document.getElementById('overlayUbahRetur');
    let idReturDiubah = null;

    function bukaModalUbahRetur(id) {
        const r = riwayatTerakhir.find((x) => x.id === id);
        if (!r) { tampilkanToast('error', 'Data retur tidak ditemukan di halaman ini -- muat ulang dulu.'); return; }
        idReturDiubah = id;
        document.getElementById('ubahReturId').value = id;
        document.getElementById('ubahReturProduk').value = r.namaProduk || '';
        document.getElementById('ubahReturQty').value = r.qty;
        document.getElementById('ubahReturHarga').value = r.hargaSatuan;
        document.getElementById('ubahReturAlasan').value = r.alasan || 'Lainnya';
        document.getElementById('ubahReturKondisi').value = r.kondisiBarang || 'Baik (Layak Jual Lagi)';
        document.getElementById('ubahReturMetode').value = r.metodePengembalian || 'Tunai';
        document.getElementById('ubahReturKeterangan').value = r.keterangan || '';
        elOverlayUbahRetur.classList.add('tampil');
    }
    function tutupModalUbahRetur() {
        elOverlayUbahRetur.classList.remove('tampil');
        idReturDiubah = null;
    }
    document.getElementById('btnTutupUbahRetur').addEventListener('click', tutupModalUbahRetur);
    document.getElementById('btnBatalUbahRetur').addEventListener('click', tutupModalUbahRetur);
    elOverlayUbahRetur.addEventListener('click', (ev) => { if (ev.target === elOverlayUbahRetur) tutupModalUbahRetur(); });

    document.getElementById('btnSimpanUbahRetur').addEventListener('click', async () => {
        if (idReturDiubah == null) return;
        const qty = parseFloat(document.getElementById('ubahReturQty').value) || 0;
        if (qty <= 0) { tampilkanToast('error', 'Qty retur harus lebih dari 0.'); return; }
        const kondisi = document.getElementById('ubahReturKondisi').value;
        const btn = document.getElementById('btnSimpanUbahRetur');
        const oriHtml = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.returPenjualan.ubah({
                id: idReturDiubah,
                qty: qty,
                harga_satuan: parseFloat(document.getElementById('ubahReturHarga').value) || 0,
                alasan: document.getElementById('ubahReturAlasan').value,
                kondisi_barang: kondisi,
                kembalikan_ke_stok: !kondisi.toLowerCase().includes('rusak'),
                metode_pengembalian: document.getElementById('ubahReturMetode').value,
                keterangan: document.getElementById('ubahReturKeterangan').value
            });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', 'Retur berhasil diperbarui.');
            tutupModalUbahRetur();
            muatRiwayat();
        } catch (e) {
            tampilkanToast('error', 'Gagal menyimpan perubahan: ' + (e && e.message ? e.message : e));
        } finally {
            btn.disabled = false; btn.innerHTML = oriHtml;
        }
    });

    async function hapusRetur(id) {
        if (!confirm('Hapus baris retur ini? Stok akan disesuaikan ulang secara otomatis.')) return;
        try {
            const r = await window.electronAPI.posAPI.returPenjualan.hapus({ id: id });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', 'Retur berhasil dihapus.');
            muatRiwayat();
        } catch (e) {
            tampilkanToast('error', 'Gagal menghapus: ' + (e && e.message ? e.message : e));
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await segarkanStatus();
        setInterval(segarkanStatus, 30000);
        muatRiwayat();
    });
})();
