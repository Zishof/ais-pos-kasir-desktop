/**
 * laporan-renderer.js -- Fitur "Laporan-Laporan e-Kantin" (Desktop), padanan
 * {@code webapp/WEB-INF/baru/modul/kantin/laporan_laporan.jsp} (versi web): katalog ~150 laporan (32
 * kategori) dari {@code LaporanKatalogData} (server), lihat 1 laporan sbg tabel (grup+subtotal+grand
 * total, LOGIKA IDENTIK dgn versi JSP -- lihat {@code buildBodyFoot} di sana, disalin persis ke sini
 * supaya angka yg tampil TIDAK PERNAH beda antar platform), lalu unduh PDF (server iText, sama persis
 * mesin render versi JSP) atau CSV (dibangun client-side dari data JSON yg sama).
 *
 * Laporan Akuntansi resmi (item katalog dgn field {@code url}, lihat {@code LaporanKatalogData}) BUKAN
 * tabel generik ini -- itu ZK penuh (grafik/JRXML), dibuka di BROWSER DEFAULT lewat
 * {@code window.electronAPI.bukaLinkEksternal} (https-only, lihat JavaDoc IPC {@code pos:buka-link-eksternal}
 * di main.js), BUKAN dirender di dalam Electron.
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');

    const elViewKatalog = document.getElementById('viewKatalog');
    const elViewLaporan = document.getElementById('viewLaporan');
    const elCariLaporan = document.getElementById('cariLaporan');
    const elKatalogWrap = document.getElementById('katalogWrap');
    const elBtnKembali = document.getElementById('btnKembaliKatalog');

    const elRepJudul = document.getElementById('repJudul');
    const elRepKet = document.getElementById('repKet');
    const elFilterGrid = document.getElementById('filterGrid');
    const elBtnTampilkan = document.getElementById('btnTampilkan');
    const elBtnCsv = document.getElementById('btnCsv');
    const elBtnPdf = document.getElementById('btnPdf');
    const elLkSheet = document.getElementById('lkSheet');

    let kategoriData = [];
    let laporanAktif = null; // item katalog yg sedang dibuka {id,judul,ket,produk,pelanggan,url}
    let dataTerakhir = null; // hasil jalankan() terakhir (utk CSV/PDF tanpa fetch ulang)

    // ==== Util format (IDENTIK dgn laporan_laporan.jsp supaya angka tak pernah beda antar platform) ====
    function esc(s) { const d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
    function numv(v) { return typeof v === 'number' ? v : 0; }
    function isCount(label) { return /^(jml|jumlah)\b/i.test(label || ''); }
    function fmtAmt(v) { const n = Number(v) || 0, s = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n)); return n < 0 ? ('(' + s + ')') : s; }
    function fmtInt(v) { const n = Number(v) || 0, s = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(n)); return n < 0 ? ('(' + s + ')') : s; }
    function fmtCell(v, label) { return isCount(label) ? fmtInt(v) : fmtAmt(v); }

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? (window.Kamus ? window.Kamus.t('Sesi Aktif') : 'Sesi Aktif') : (window.Kamus ? window.Kamus.t('Tidak Ada Sesi') : 'Tidak Ada Sesi');
        } catch (e) { /* abaikan */ }
    }

    async function muatInfoToko() {
        try {
            const hasil = await window.electronAPI.posAPI.konfigurasi();
            if (hasil.ok && hasil.data && hasil.data.tokoNama) elNamaToko.textContent = hasil.data.tokoNama;
        } catch (e) { /* abaikan */ }
    }

    // ==== Katalog ====

    function cocokFilter(item, kat, f) {
        if (!f) return true;
        return (item.judul || '').toLowerCase().indexOf(f) >= 0
            || (item.ket || '').toLowerCase().indexOf(f) >= 0
            || (kat || '').toLowerCase().indexOf(f) >= 0;
    }

    function renderKatalog(filter) {
        const f = (filter || '').toLowerCase().trim();
        elKatalogWrap.innerHTML = '';
        let ada = false;
        kategoriData.forEach((grp) => {
            const items = (grp.items || []).filter((it) => cocokFilter(it, grp.kat, f));
            if (!items.length) return;
            ada = true;
            const judulKat = document.createElement('div');
            judulKat.className = 'lk-cat';
            judulKat.textContent = grp.kat;
            elKatalogWrap.appendChild(judulKat);
            const grid = document.createElement('div');
            grid.className = 'lk-grid';
            items.forEach((it) => {
                const card = document.createElement('div');
                card.className = 'lk-card' + (it.url ? ' eksternal' : '');
                const badge = it.url ? ' <span style="font-size:9.5px;font-weight:800;color:var(--primary);background:var(--primary-50);border-radius:8px;padding:1px 6px;">&#8599;</span>' : '';
                card.innerHTML = '<div class="lk-ic">' + (it.url ? '&#128279;' : '&#128196;') + '</div>'
                    + '<div><div class="lk-tt">' + esc(it.judul) + badge + '</div><div class="lk-ds">' + esc(it.ket || '') + '</div></div>';
                card.addEventListener('click', () => bukaLaporan(it));
                grid.appendChild(card);
            });
            elKatalogWrap.appendChild(grid);
        });
        if (!ada) {
            const kosong = document.createElement('div');
            kosong.className = 'lk-kosong';
            kosong.textContent = window.Kamus ? window.Kamus.t('Tidak ada laporan cocok.') : 'Tidak ada laporan cocok.';
            elKatalogWrap.appendChild(kosong);
        }
    }

    async function muatKatalog() {
        elKatalogWrap.innerHTML = '<div class="lk-kosong">' + (window.Kamus ? window.Kamus.t('Memuat katalog...') : 'Memuat katalog...') + '</div>';
        try {
            const hasil = await window.electronAPI.posAPI.laporan.katalog();
            if (hasil.ok && hasil.data && hasil.data.kategori) {
                kategoriData = hasil.data.kategori;
                renderKatalog(elCariLaporan.value);
                if (window.Kamus) window.Kamus.muat(window.Kamus.bahasaTersimpan());
            } else if (window.PesanDetail) {
                window.PesanDetail.tampilkanDariHasil(hasil);
            }
        } catch (e) {
            elKatalogWrap.innerHTML = '<div class="lk-kosong">' + (window.Kamus ? window.Kamus.t('Gagal memuat katalog.') : 'Gagal memuat katalog.') + '</div>';
        }
    }

    // ==== Layar 1 laporan ====

    function bukaLaporan(item) {
        if (item.url) {
            window.electronAPI.bukaLinkEksternal(item.url);
            return;
        }
        laporanAktif = item;
        dataTerakhir = null;
        elRepJudul.textContent = item.judul;
        elRepKet.textContent = item.ket || '';
        bangunFilterGrid(item);
        elLkSheet.innerHTML = '<div class="lk-sheet-kosong">' + (window.Kamus ? window.Kamus.t('Atur filter lalu klik Tampilkan untuk melihat laporan.') : 'Atur filter lalu klik Tampilkan untuk melihat laporan.') + '</div>';
        elViewKatalog.classList.add('tersembunyi');
        elViewLaporan.classList.remove('tersembunyi');
    }

    function kembaliKeKatalog() {
        elViewLaporan.classList.add('tersembunyi');
        elViewKatalog.classList.remove('tersembunyi');
    }

    function bangunFilterGrid(item) {
        elFilterGrid.innerHTML = '';
        elFilterGrid.appendChild(buatFieldTanggal('fMulai', 'Tanggal Mulai'));
        elFilterGrid.appendChild(buatFieldTanggal('fSampai', 'Tanggal Sampai'));
        if (item.produk) elFilterGrid.appendChild(buatFieldTeks('fProduk', 'Cari Produk (kode / nama)', 'kode atau nama produk'));
        if (item.pelanggan) elFilterGrid.appendChild(buatFieldTeks('fPelanggan', 'Cari Pelanggan (kode / nama / member)', 'kode, nama, atau no. identitas'));
        if (window.Kamus) window.Kamus.terapkan(elFilterGrid);
    }

    function buatFieldTanggal(id, labelTeks) {
        const wrap = document.createElement('div');
        const lbl = document.createElement('label');
        lbl.setAttribute('data-i18n', labelTeks);
        lbl.textContent = labelTeks;
        const inp = document.createElement('input');
        inp.type = 'date';
        inp.id = id;
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        return wrap;
    }

    function buatFieldTeks(id, labelTeks, placeholderTeks) {
        const wrap = document.createElement('div');
        const lbl = document.createElement('label');
        lbl.setAttribute('data-i18n', labelTeks);
        lbl.textContent = labelTeks;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = id;
        inp.setAttribute('data-i18n-placeholder', placeholderTeks);
        inp.placeholder = placeholderTeks;
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        return wrap;
    }

    function payloadFilter() {
        const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const p = { r: laporanAktif.id, tglMulai: g('fMulai'), tglSampai: g('fSampai') };
        if (laporanAktif.produk) p.qProduk = g('fProduk');
        if (laporanAktif.pelanggan) p.qPelanggan = g('fPelanggan');
        return p;
    }

    async function jalankanLaporan() {
        if (!laporanAktif) return;
        elLkSheet.innerHTML = '<div class="lk-sheet-kosong">' + (window.Kamus ? window.Kamus.t('Memuat...') : 'Memuat...') + '</div>';
        elBtnTampilkan.disabled = true;
        try {
            const hasil = await window.electronAPI.posAPI.laporan.jalankan(payloadFilter());
            if (!hasil.ok) {
                elLkSheet.innerHTML = '<div class="lk-sheet-kosong">' + esc((hasil.pesan) || 'Gagal memuat data.') + '</div>';
                if (window.PesanDetail) window.PesanDetail.tampilkanDariHasil(hasil);
                return;
            }
            dataTerakhir = hasil.data;
            elLkSheet.innerHTML = buildSheet(hasil.data);
        } catch (e) {
            elLkSheet.innerHTML = '<div class="lk-sheet-kosong">' + (window.Kamus ? window.Kamus.t('Kesalahan koneksi.') : 'Kesalahan koneksi.') + '</div>';
        } finally {
            elBtnTampilkan.disabled = false;
        }
    }

    // ==== Tabel (grup + subtotal + grand total) -- LOGIKA IDENTIK laporan_laporan.jsp#buildBodyFoot ====

    function buildHead(kol) {
        let h = '<tr>';
        for (let i = 0; i < kol.length; i++) {
            h += '<th class="' + (kol[i].t === 'num' ? 'num' : '') + '">' + esc(kol[i].l) + '</th>';
        }
        return h + '</tr>';
    }

    function buildBodyFoot(d) {
        const kol = d.kolom;
        const gi = (typeof d.grup === 'number') ? d.grup : -1;
        const grand = [];
        let hasTotal = false;
        for (let c = 0; c < kol.length; c++) { grand[c] = 0; if (kol[c].t === 'num') hasTotal = true; }

        function cellsDetail(row, sub) {
            let s = '';
            for (let c = 0; c < kol.length; c++) {
                const v = row[c];
                if (gi >= 0 && c === gi) { s += '<td></td>'; }
                else if (kol[c].t === 'num') {
                    if (v === null) { s += '<td class="num"></td>'; }
                    else { const n = numv(v); grand[c] += n; if (sub) sub[c] += n; s += '<td class="num">' + fmtCell(v, kol[c].l) + '</td>'; }
                } else { s += '<td>' + esc(v) + '</td>'; }
            }
            return s;
        }
        function subtotalRow(key, sub) {
            let s = '<tr class="lk-sub">';
            for (let c = 0; c < kol.length; c++) {
                if (c === gi) s += '<td>' + (window.Kamus ? window.Kamus.t('Subtotal') : 'Subtotal') + ' ' + esc(key) + '</td>';
                else if (kol[c].t === 'num') s += '<td class="num">' + fmtCell(sub[c], kol[c].l) + '</td>';
                else s += '<td></td>';
            }
            return s + '</tr>';
        }
        let body = '';
        if (gi >= 0 && d.baris.length) {
            let curKey = null, started = false, sub = null;
            d.baris.forEach((row) => {
                const key = row[gi];
                if (!started || key !== curKey) {
                    if (started) body += subtotalRow(curKey, sub);
                    curKey = key; started = true; sub = [];
                    for (let c = 0; c < kol.length; c++) sub[c] = 0;
                    body += '<tr class="lk-grp"><td colspan="' + kol.length + '">' + esc(key) + '</td></tr>';
                }
                body += '<tr>' + cellsDetail(row, sub) + '</tr>';
            });
            if (started) body += subtotalRow(curKey, sub);
        } else {
            d.baris.forEach((row) => { body += '<tr>' + cellsDetail(row, null) + '</tr>'; });
        }
        let foot = '';
        if (hasTotal && d.grandTotal !== false) {
            foot = '<tr>';
            for (let c2 = 0; c2 < kol.length; c2++) {
                if (c2 === 0) foot += '<td>' + (window.Kamus ? window.Kamus.t('GRAND TOTAL') : 'GRAND TOTAL') + '</td>';
                else if (kol[c2].t === 'num') foot += '<td class="num">' + fmtCell(grand[c2], kol[c2].l) + '</td>';
                else foot += '<td></td>';
            }
            foot += '</tr>';
        }
        return { body: body, foot: foot };
    }

    function buildSheet(d) {
        let out = '';
        if (d.catatan) out += '<div class="lk-catatan">' + esc(d.catatan) + '</div>';
        if (!d.baris.length) {
            return out + '<div class="lk-sheet-kosong">' + (window.Kamus ? window.Kamus.t('Tidak ada data untuk filter ini.') : 'Tidak ada data untuk filter ini.') + '</div>';
        }
        const bf = buildBodyFoot(d);
        out += '<div class="lk-tbl-wrap"><table class="lk-tbl"><thead>' + buildHead(d.kolom) + '</thead><tbody>' + bf.body + '</tbody>'
            + (bf.foot ? '<tfoot>' + bf.foot + '</tfoot>' : '') + '</table></div>'
            + '<div style="font-size:10.5px;color:var(--faint);margin-top:8px;">' + (window.Kamus ? window.Kamus.t('Jumlah baris') : 'Jumlah baris') + ': ' + d.baris.length + '</div>';
        return out;
    }

    // ==== Ekspor CSV/PDF ====

    function csvVal(v) { const s = (v == null ? '' : String(v)); return /[",;\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s; }
    function dataToCsv(d) {
        const lines = [];
        const hdr = [];
        for (let i = 0; i < d.kolom.length; i++) hdr.push(csvVal(d.kolom[i].l));
        lines.push(hdr.join(';'));
        (d.baris || []).forEach((row) => {
            const cells = [];
            for (let c = 0; c < d.kolom.length; c++) {
                const v = row[c];
                cells.push(d.kolom[c].t === 'num' ? (v === null || v === undefined ? '' : String(numv(v))) : csvVal(v));
            }
            lines.push(cells.join(';'));
        });
        return lines.join('\r\n');
    }

    async function unduhCsv() {
        if (!dataTerakhir) { await jalankanLaporan(); if (!dataTerakhir) return; }
        try {
            const isi = '﻿' + dataToCsv(dataTerakhir);
            const hasil = await window.electronAPI.posAPI.simpanFile({ namaBerkas: (laporanAktif.id || 'laporan') + '.csv', isi: isi });
            if (hasil.ok && window.PesanDetail) window.PesanDetail.tampilkan({ tingkat: 'info', judul: 'CSV Tersimpan', penjelasan: 'Berkas tersimpan di: ' + hasil.path });
            else if (!hasil.dibatalkan && hasil.pesan && window.PesanDetail) window.PesanDetail.tampilkan({ tingkat: 'error', judul: 'Gagal Menyimpan CSV', penjelasan: hasil.pesan });
        } catch (e) { /* dialog dibatalkan atau gagal -- sudah ditangani di atas */ }
    }

    async function unduhPdf() {
        if (!laporanAktif) return;
        elBtnPdf.disabled = true;
        try {
            const hasil = await window.electronAPI.posAPI.laporan.pdf(payloadFilter());
            if (!hasil.ok) {
                if (window.PesanDetail) window.PesanDetail.tampilkanDariHasil(hasil);
                return;
            }
            const simpan = await window.electronAPI.laporanSimpanPdf({ namaBerkas: (laporanAktif.id || 'laporan') + '.pdf', pdfBase64: hasil.data.pdfBase64 });
            if (simpan.ok && window.PesanDetail) window.PesanDetail.tampilkan({ tingkat: 'info', judul: 'PDF Tersimpan', penjelasan: 'Berkas tersimpan di: ' + simpan.path });
            else if (!simpan.dibatalkan && simpan.pesan && window.PesanDetail) window.PesanDetail.tampilkan({ tingkat: 'error', judul: 'Gagal Menyimpan PDF', penjelasan: simpan.pesan });
        } catch (e) {
            if (window.PesanDetail) window.PesanDetail.tampilkan({ tingkat: 'error', judul: 'Gagal Membuat PDF', penjelasan: String(e && e.message ? e.message : e) });
        } finally {
            elBtnPdf.disabled = false;
        }
    }

    // ==== Wiring ====
    elCariLaporan.addEventListener('input', () => renderKatalog(elCariLaporan.value));
    elBtnKembali.addEventListener('click', kembaliKeKatalog);
    elBtnTampilkan.addEventListener('click', jalankanLaporan);
    elBtnCsv.addEventListener('click', unduhCsv);
    elBtnPdf.addEventListener('click', unduhPdf);

    (async function init() {
        await segarkanStatus();
        await muatInfoToko();
        if (window.Kamus) {
            const bhs = window.Kamus.bahasaTersimpan();
            window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
            window.Kamus.onGanti(() => renderKatalog(elCariLaporan.value));
            window.Kamus.muat(bhs);
        }
        await muatKatalog();
    })();
})();
