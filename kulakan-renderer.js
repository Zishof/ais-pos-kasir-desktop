/**
 * kulakan-renderer.js -- Layar "Kulakan" (Harga Beli / Pengadaan Produk, Desktop). Alur entri SAMA
 * PERSIS dgn Stok Opname (stokopname-renderer.js): scan/ketik barcode -> lihat produk -> isi form ->
 * simpan (langsung tercatat, stok & harga beli produk otomatis di-recompute -- lihat JavaDoc server
 * {@code KantinHelper.kulakanSimpan}, rumus IDENTIK layar ZK "Pengadaan / Kulakan (Barang Masuk)").
 * Riwayat di bawahnya BEDA dari Stok Opname -- di sini daftar riwayat diambil dari server (paginated,
 * bisa dicari), bukan cuma daftar sesi lokal, karena "Kulakan" adalah catatan pengeluaran/stok masuk
 * yang perlu ditelusuri lintas sesi.
 *
 * Server MENOLAK {@code kulakan_simpan} (status error) bila pemanggil bukan supervisor/admin -- layar
 * ini menyembunyikan panel entri utk kasir biasa dan hanya menampilkan riwayat (readonly), sesuai
 * aturan "Produk/Anggota/Kulakan/Aturan Diskon/Stok Opname hanya boleh diedit supervisor".
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');

    const elPanelEntriKulakan = document.getElementById('panelEntriKulakan');
    const elBlokirKulakan = document.getElementById('blokirKulakan');
    const elInBarcodeKulakan = document.getElementById('inBarcodeKulakan');
    const elBtnCariKulakan = document.getElementById('btnCariKulakan');
    const elKartuProdukKulakan = document.getElementById('kartuProdukKulakan');
    const elKulakanNamaProduk = document.getElementById('kulakanNamaProduk');
    const elKulakanMetaProduk = document.getElementById('kulakanMetaProduk');
    const elKulakanQty = document.getElementById('kulakanQty');
    const elKulakanHargaBeli = document.getElementById('kulakanHargaBeli');
    const elKulakanNomorFaktur = document.getElementById('kulakanNomorFaktur');
    const elKulakanNamaSupplier = document.getElementById('kulakanNamaSupplier');
    const elKulakanKeterangan = document.getElementById('kulakanKeterangan');
    const elBtnSimpanKulakan = document.getElementById('btnSimpanKulakan');

    const elCariKulakan = document.getElementById('cariKulakan');
    const elTabelKulakan = document.getElementById('tabelKulakan');
    const elInfoPaginasiKulakan = document.getElementById('infoPaginasiKulakan');
    const elBtnHalSebelumnyaKulakan = document.getElementById('btnHalSebelumnyaKulakan');
    const elBtnHalBerikutnyaKulakan = document.getElementById('btnHalBerikutnyaKulakan');

    function formatAngka(n) { return Math.round((Number(n) || 0) * 100) / 100; }
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

    let isAdminAkun = false;
    let supervisorPedagang = false;
    let aksesMenuCrud = {};
    const bolehAksiMenu = (kunci, aksi) => {
        if (isAdminAkun || supervisorPedagang) return true;
        const crud = aksesMenuCrud && aksesMenuCrud[kunci];
        if (!crud) return false;
        if (crud.supervisor === true) return true;
        return crud[aksi] !== false;
    };
    const bolehKelolaKulakan = () => bolehAksiMenu('kulakan', 'update') || bolehAksiMenu('kulakan', 'create');

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
                isAdminAkun = !!cfg.data.isAdmin;
                supervisorPedagang = !!cfg.data.supervisorPedagang;
                aksesMenuCrud = cfg.data.aksesMenuCrud || {};
                elPanelEntriKulakan.style.display = bolehKelolaKulakan() ? 'block' : 'none';
                elBlokirKulakan.style.display = bolehKelolaKulakan() ? 'none' : 'block';
            }
        } catch (e) { /* abaikan */ }
    }

    // ==== Cari produk via barcode/kode (reuse aksi so_produk_scan, sama seperti Stok Opname) ====
    let produkDitemukan = null;

    async function cariProduk() {
        const barcode = elInBarcodeKulakan.value.trim();
        if (!barcode) return;
        elBtnCariKulakan.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.stokOpname.scan({ barcode });
            if (!r.ok) {
                window.PesanDetail.tampilkanDariHasil(r);
                elKartuProdukKulakan.classList.remove('tampil');
                produkDitemukan = null;
                return;
            }
            produkDitemukan = r.data;
            elKulakanNamaProduk.textContent = r.data.nama;
            elKulakanMetaProduk.textContent = 'Kode: ' + r.data.kode + ' · Stok Sistem Saat Ini: ' + formatAngka(r.data.stokSistem);
            elKulakanQty.value = '';
            elKulakanHargaBeli.value = '';
            elKulakanNomorFaktur.value = '';
            elKulakanNamaSupplier.value = '';
            elKulakanKeterangan.value = '';
            elKartuProdukKulakan.classList.add('tampil');
            elKulakanQty.focus();
        } catch (e) {
            tampilkanToast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnCariKulakan.disabled = false;
        }
    }
    elBtnCariKulakan.addEventListener('click', cariProduk);
    elInBarcodeKulakan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cariProduk(); } });

    // ==== Simpan barang masuk ====
    elBtnSimpanKulakan.addEventListener('click', async () => {
        if (!bolehKelolaKulakan() || !produkDitemukan) return;
        const qtyTeks = elKulakanQty.value.trim().replace(',', '.');
        const hargaTeks = elKulakanHargaBeli.value.trim().replace(',', '.');
        if (qtyTeks === '' || isNaN(Number(qtyTeks)) || Number(qtyTeks) <= 0) {
            tampilkanToast('error', 'Jumlah masuk wajib diisi dengan angka lebih dari 0.');
            elKulakanQty.focus();
            return;
        }
        if (hargaTeks === '' || isNaN(Number(hargaTeks)) || Number(hargaTeks) <= 0) {
            tampilkanToast('error', 'Harga beli satuan wajib diisi dengan angka lebih dari 0.');
            elKulakanHargaBeli.focus();
            return;
        }
        elBtnSimpanKulakan.disabled = true;
        elBtnSimpanKulakan.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.kulakan.simpan({
                produk_id: produkDitemukan.produkId,
                qty: Number(qtyTeks),
                harga_beli_satuan: Number(hargaTeks),
                nomor_faktur: elKulakanNomorFaktur.value.trim(),
                nama_supplier: elKulakanNamaSupplier.value.trim(),
                keterangan: elKulakanKeterangan.value.trim()
            });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', 'Tersimpan: ' + produkDitemukan.nama + ' (+' + formatAngka(Number(qtyTeks)) + ').');
            elKartuProdukKulakan.classList.remove('tampil');
            produkDitemukan = null;
            elInBarcodeKulakan.value = '';
            elInBarcodeKulakan.focus();
            state.page = 1;
            muatDaftarKulakan();
        } catch (e) {
            tampilkanToast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanKulakan.disabled = false;
            elBtnSimpanKulakan.textContent = 'Simpan & Perbarui Stok';
        }
    });

    // ==== Riwayat (server, paginated+keyword) ====
    const state = { keyword: '', page: 1, pageSize: 20, total: 0 };
    let cariTimer = null;

    function renderTabelKulakan(daftar) {
        if (!daftar || daftar.length === 0) {
            elTabelKulakan.innerHTML = '<tr><td><div class="daftar-kosong"><span class="ico">&#128722;</span>Belum ada catatan Kulakan.</div></td></tr>';
            return;
        }
        let html = '<thead><tr><th>Waktu</th><th>Nomor Faktur</th><th>Produk</th><th>Supplier</th><th class="num">Qty</th><th class="num">Harga Satuan</th><th class="num">Total</th><th>Keterangan</th></tr></thead><tbody>';
        daftar.forEach((k) => {
            html += '<tr>'
                + '<td>' + escHtml(k.waktuPengadaan) + '</td>'
                + '<td>' + escHtml(k.nomorFaktur || '-') + '</td>'
                + '<td>' + escHtml(k.namaProduk) + '</td>'
                + '<td>' + escHtml(k.namaSupplier || '-') + '</td>'
                + '<td class="num">' + formatAngka(k.qty) + '</td>'
                + '<td class="num">' + formatRupiah(k.hargaBeliSatuan) + '</td>'
                + '<td class="num">' + formatRupiah(k.totalHarga) + '</td>'
                + '<td>' + escHtml(k.keterangan || '-') + '</td>'
                + '</tr>';
        });
        html += '</tbody>';
        elTabelKulakan.innerHTML = html;
    }

    function renderPaginasiKulakan() {
        const totalHal = Math.max(1, Math.ceil(state.total / state.pageSize));
        elInfoPaginasiKulakan.textContent = 'Halaman ' + state.page + ' dari ' + totalHal + ' (' + state.total + ' catatan)';
        elBtnHalSebelumnyaKulakan.disabled = state.page <= 1;
        elBtnHalBerikutnyaKulakan.disabled = state.page >= totalHal;
    }

    async function muatDaftarKulakan() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.kulakan.list({ keyword: state.keyword, page: state.page, page_size: state.pageSize });
            if (!r.ok) {
                window.PesanDetail.tampilkanDariHasil(r);
                renderTabelKulakan([]);
                return;
            }
            state.total = r.data.total || 0;
            renderTabelKulakan(r.data.data || []);
            renderPaginasiKulakan();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat riwayat Kulakan: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elCariKulakan.addEventListener('input', () => {
        clearTimeout(cariTimer);
        cariTimer = setTimeout(() => { state.keyword = elCariKulakan.value.trim(); state.page = 1; muatDaftarKulakan(); }, 350);
    });
    elBtnHalSebelumnyaKulakan.addEventListener('click', () => { if (state.page > 1) { state.page--; muatDaftarKulakan(); } });
    elBtnHalBerikutnyaKulakan.addEventListener('click', () => { state.page++; muatDaftarKulakan(); });
    elBtnMuatUlang.addEventListener('click', () => { state.page = 1; muatDaftarKulakan(); });

    // ==== Inisialisasi ====
    (async function inisialisasi() {
        await segarkanStatus();
        await muatDaftarKulakan();
    })();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
