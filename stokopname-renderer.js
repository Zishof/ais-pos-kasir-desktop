/**
 * stokopname-renderer.js -- Layar "Stok Opname" (Desktop), permintaan klien: "samakan dengan proses
 * yang ada di POS Online (JSP) dan Produk". Alur SAMA PERSIS dgn {@code opname_scan.jsp}/aplikasi
 * Android "Stok Opname" terpisah: ketik/scan barcode -> lihat stok sistem -> masukkan stok fisik ->
 * simpan (langsung tercatat, TANPA approval terpisah -- lihat JavaDoc server
 * {@code KantinHelper.soSimpan}). Server MENOLAK {@code so_simpan} bila pemanggil bukan supervisor/
 * admin (status error) -- layar ini menyembunyikan seluruh form entri utk kasir biasa dan hanya
 * menampilkan ringkasan (readonly), sesuai permintaan "Produk/Anggota/Aturan Diskon/Stok Opname hanya
 * boleh diedit supervisor, selain itu readonly".
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');

    const elPanelEntriSo = document.getElementById('panelEntriSo');
    const elBlokirSo = document.getElementById('blokirSo');
    const elInBarcodeSo = document.getElementById('inBarcodeSo');
    const elBtnCariSo = document.getElementById('btnCariSo');
    const elKartuProdukSo = document.getElementById('kartuProdukSo');
    const elSoNamaProduk = document.getElementById('soNamaProduk');
    const elSoMetaProduk = document.getElementById('soMetaProduk');
    const elSoStokFisik = document.getElementById('soStokFisik');
    const elSoKeterangan = document.getElementById('soKeterangan');
    const elBtnSimpanSo = document.getElementById('btnSimpanSo');
    const elTabelRiwayatSo = document.getElementById('tabelRiwayatSo');

    const elKpiJumlahProduk = document.getElementById('kpiJumlahProduk');
    const elKpiJumlahCatatan = document.getElementById('kpiJumlahCatatan');
    const elKpiTotalLebih = document.getElementById('kpiTotalLebih');
    const elKpiTotalKurang = document.getElementById('kpiTotalKurang');
    const elKpiSelisihBersih = document.getElementById('kpiSelisihBersih');

    // ==== gap-closure: 3 tab (Kartu Mutasi Stok/Stok Opname/SO by Scan), padanan JSP stok.jsp ====
    const elTabBtns = document.querySelectorAll('.tab-btn');
    const elTabPanels = document.querySelectorAll('.tab-panel');
    const elSelPeriodeDashboard = document.getElementById('selPeriodeDashboard');
    const elBtnMuatUlangDashboard = document.getElementById('btnMuatUlangDashboard');
    const elKpiBarangMasuk = document.getElementById('kpiBarangMasuk');
    const elKpiBarangKeluar = document.getElementById('kpiBarangKeluar');
    const elKpiTotalStok = document.getElementById('kpiTotalStok');
    const elKpiStokKritis = document.getElementById('kpiStokKritis');
    const elChartTrenMutasi = document.getElementById('chartTrenMutasi');
    const elChartTop5Keluar = document.getElementById('chartTop5Keluar');

    const elPanelScanSo = document.getElementById('panelScanSo');
    const elBlokirScan = document.getElementById('blokirScan');
    const elInBarcodeScan = document.getElementById('inBarcodeScan');
    const elBtnKameraScan = document.getElementById('btnKameraScan');
    const elReaderKameraScan = document.getElementById('readerKameraScan');
    const elStatItemScan = document.getElementById('statItemScan');
    const elStatLebihScan = document.getElementById('statLebihScan');
    const elStatKurangScan = document.getElementById('statKurangScan');
    const elStatSelisihScan = document.getElementById('statSelisihScan');
    const elProporsiScan = document.getElementById('proporsiScan');
    const elTabelAntreanScan = document.getElementById('tabelAntreanScan');
    const elKetAntreanScan = document.getElementById('ketAntreanScan');
    const elBtnKosongkanAntreanScan = document.getElementById('btnKosongkanAntreanScan');
    const elBtnSimpanSemuaScan = document.getElementById('btnSimpanSemuaScan');

    function formatAngka(n) { return Math.round((Number(n) || 0) * 100) / 100; }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
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
    const bolehKelolaSo = () => bolehAksiMenu('stokopname', 'update') || bolehAksiMenu('stokopname', 'create');

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
                elPanelEntriSo.style.display = bolehKelolaSo() ? 'block' : 'none';
                elBlokirSo.style.display = bolehKelolaSo() ? 'none' : 'block';
                elPanelScanSo.style.display = bolehKelolaSo() ? 'block' : 'none';
                elBlokirScan.style.display = bolehKelolaSo() ? 'none' : 'block';
            }
        } catch (e) { /* abaikan */ }
    }

    // ==== Ringkasan hari ini (boleh dilihat siapa saja) ====
    async function muatRingkasan() {
        try {
            const r = await window.electronAPI.posAPI.stokOpname.ringkasan();
            if (!r.ok) { if (!r.offline) window.PesanDetail.tampilkanDariHasil(r); return; }
            elKpiJumlahProduk.textContent = r.data.jumlahProduk || 0;
            elKpiJumlahCatatan.textContent = r.data.jumlahCatatan || 0;
            elKpiTotalLebih.textContent = formatAngka(r.data.totalLebih);
            elKpiTotalKurang.textContent = formatAngka(r.data.totalKurang);
            elKpiSelisihBersih.textContent = formatAngka(r.data.selisihBersih);
        } catch (e) { /* abaikan -- kartu KPI bukan jalur kritis */ }
    }

    // ==== Cari produk via barcode/kode ====
    let produkDitemukan = null;

    async function cariProduk() {
        const barcode = elInBarcodeSo.value.trim();
        if (!barcode) return;
        elBtnCariSo.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.stokOpname.scan({ barcode });
            if (!r.ok) {
                window.PesanDetail.tampilkanDariHasil(r);
                elKartuProdukSo.classList.remove('tampil');
                produkDitemukan = null;
                return;
            }
            produkDitemukan = r.data;
            elSoNamaProduk.textContent = r.data.nama;
            elSoMetaProduk.textContent = 'Kode: ' + r.data.kode + ' · Stok Sistem Saat Ini: ' + formatAngka(r.data.stokSistem)
                + (r.data.stokMinimum > 0 ? ' · Stok Minimum: ' + formatAngka(r.data.stokMinimum) : '');
            elSoStokFisik.value = '';
            elSoKeterangan.value = '';
            elKartuProdukSo.classList.add('tampil');
            elSoStokFisik.focus();
        } catch (e) {
            tampilkanToast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnCariSo.disabled = false;
        }
    }
    elBtnCariSo.addEventListener('click', cariProduk);
    elInBarcodeSo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cariProduk(); } });

    // ==== Riwayat catatan opname HARI INI (gap-closure: dibaca dari SERVER, bukan lagi memori sesi
    // layar ini -- SEBELUMNYA daftar ini kosong lagi begitu layar dimuat ulang walau kartu ringkasan
    // di atas (yg SUDAH dari server) tetap menunjukkan angka yg benar, membingungkan pengguna. Lihat
    // JavaDoc server KantinHelper.soRiwayat. ====
    function renderRiwayat(daftar) {
        if (!daftar || !daftar.length) {
            elTabelRiwayatSo.innerHTML = '<tbody><tr><td><div class="daftar-kosong"><span class="ico">&#128203;</span>Belum ada catatan Stok Opname hari ini.</div></td></tr></tbody>';
            return;
        }
        let html = '<thead><tr><th>Waktu</th><th>Kode</th><th>Nama Produk</th><th class="num">Stok Sistem</th><th class="num">Stok Fisik</th><th class="num">Selisih</th><th>Keterangan</th></tr></thead><tbody>';
        daftar.forEach((row) => {
            const badgeSelisih = row.selisih > 0 ? '<span class="badge hijau">+' + formatAngka(row.selisih) + '</span>'
                : row.selisih < 0 ? '<span class="badge merah">' + formatAngka(row.selisih) + '</span>'
                : '<span class="badge abu">0</span>';
            html += '<tr><td>' + escHtml(row.waktu) + '</td><td>' + escHtml(row.kode) + '</td><td>' + escHtml(row.nama) + '</td>'
                + '<td class="num">' + formatAngka(row.stokSistem) + '</td><td class="num">' + formatAngka(row.stokFisik) + '</td>'
                + '<td class="num">' + badgeSelisih + '</td><td>' + escHtml(row.keterangan || '-') + '</td></tr>';
        });
        html += '</tbody>';
        elTabelRiwayatSo.innerHTML = html;
    }

    async function muatRiwayat() {
        try {
            const r = await window.electronAPI.posAPI.stokOpname.riwayat();
            if (!r.ok) { renderRiwayat([]); return; }
            renderRiwayat((r.data && r.data.data) || []);
        } catch (e) {
            renderRiwayat([]);
        }
    }

    elBtnSimpanSo.addEventListener('click', async () => {
        if (!bolehKelolaSo() || !produkDitemukan) return;
        const stokFisikTeks = elSoStokFisik.value.trim().replace(',', '.');
        if (stokFisikTeks === '' || isNaN(Number(stokFisikTeks))) {
            tampilkanToast('error', 'Stok fisik wajib diisi dengan angka.');
            elSoStokFisik.focus();
            return;
        }
        const stokFisik = Number(stokFisikTeks);
        elBtnSimpanSo.disabled = true;
        elBtnSimpanSo.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.stokOpname.simpan({
                produk_id: produkDitemukan.produkId, stok_fisik: stokFisik, keterangan: elSoKeterangan.value.trim()
            });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', 'Tersimpan: ' + produkDitemukan.nama + ' (selisih ' + formatAngka(r.data.selisih) + ').');
            elKartuProdukSo.classList.remove('tampil');
            produkDitemukan = null;
            elInBarcodeSo.value = '';
            elInBarcodeSo.focus();
            muatRingkasan();
            muatRiwayat();
        } catch (e) {
            tampilkanToast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanSo.disabled = false;
            elBtnSimpanSo.textContent = 'Simpan Catatan';
        }
    });

    elBtnMuatUlang.addEventListener('click', () => { muatRingkasan(); muatRiwayat(); if (tabAktif === 'dashboard') muatDashboard(); });

    // =====================================================================
    // ==== Tab switcher (gap-closure -- padanan JSP stok.jsp) ====
    // =====================================================================
    let tabAktif = 'dashboard';
    let dashboardPernahDimuat = false;
    function pindahTab(nama) {
        tabAktif = nama;
        elTabBtns.forEach((b) => b.classList.toggle('aktif', b.getAttribute('data-tab') === nama));
        elTabPanels.forEach((p) => p.classList.toggle('aktif', p.id === 'tab' + nama.charAt(0).toUpperCase() + nama.slice(1)));
        if (nama === 'dashboard' && !dashboardPernahDimuat) { dashboardPernahDimuat = true; muatDashboard(); }
        if (nama !== 'scan') hentikanKamera();
    }
    elTabBtns.forEach((b) => b.addEventListener('click', () => pindahTab(b.getAttribute('data-tab'))));

    // =====================================================================
    // ==== Tab "Kartu Mutasi Stok" -- dashboard KPI + 2 chart HTML/CSS (BUKAN Chart.js, konsisten
    // gaya proyek "ganti-semua-jfreechart-htmlcss", lihat ringkasan-renderer.js utk pola serupa) ====
    // =====================================================================
    function buatBarVertikalGanda(container, data, opsi) {
        opsi = opsi || {};
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong">Belum ada data.</div>'; return; }
        const maks = Math.max.apply(null, data.map((d) => Math.max(d.masuk, d.keluar))) || 1;
        const wrap = document.createElement('div');
        wrap.className = 'chart-v-wrap';
        data.forEach((d) => {
            const kolom = document.createElement('div');
            kolom.className = 'chart-v-kolom';
            const ganda = document.createElement('div');
            ganda.className = 'batang-ganda';
            const bMasuk = document.createElement('div');
            bMasuk.className = 'batang masuk';
            bMasuk.style.height = Math.max(1, Math.round((d.masuk / maks) * 100)) + '%';
            bMasuk.title = d.label + ' -- Masuk: ' + formatAngka(d.masuk);
            const bKeluar = document.createElement('div');
            bKeluar.className = 'batang keluar';
            bKeluar.style.height = Math.max(1, Math.round((d.keluar / maks) * 100)) + '%';
            bKeluar.title = d.label + ' -- Keluar: ' + formatAngka(d.keluar);
            ganda.appendChild(bMasuk);
            ganda.appendChild(bKeluar);
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = d.label;
            kolom.appendChild(ganda);
            kolom.appendChild(label);
            wrap.appendChild(kolom);
        });
        container.appendChild(wrap);
    }

    function buatBarHorizontal(container, data, opsi) {
        opsi = opsi || {};
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
            baris.querySelector('.nilai').textContent = formatAngka(d.nilai);
            container.appendChild(baris);
        });
    }

    /** @param {string} tgl "YYYY-MM-DD" atau "YYYY-MM" (tergantung periode) -> label ringkas utk sumbu chart. */
    function labelTanggalRingkas(tgl) {
        const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
        if (/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
            const parts = tgl.split('-');
            return parseInt(parts[2], 10) + ' ' + bln[parseInt(parts[1], 10) - 1];
        }
        if (/^\d{4}-\d{2}$/.test(tgl)) {
            const parts = tgl.split('-');
            return bln[parseInt(parts[1], 10) - 1] + ' ' + parts[0].slice(2);
        }
        return tgl;
    }

    async function muatDashboard() {
        elChartTrenMutasi.innerHTML = '<div class="daftar-kosong">Memuat...</div>';
        elChartTop5Keluar.innerHTML = '<div class="daftar-kosong">Memuat...</div>';
        try {
            const r = await window.electronAPI.posAPI.stokOpname.dashboard({ periode: elSelPeriodeDashboard.value });
            if (!r.ok) {
                if (!r.offline) window.PesanDetail.tampilkanDariHasil(r);
                elChartTrenMutasi.innerHTML = '<div class="daftar-kosong">Gagal memuat.</div>';
                elChartTop5Keluar.innerHTML = '<div class="daftar-kosong">Gagal memuat.</div>';
                return;
            }
            const d = r.data;
            elKpiBarangMasuk.textContent = formatAngka(d.barangMasuk);
            elKpiBarangKeluar.textContent = formatAngka(d.barangKeluar);
            elKpiTotalStok.textContent = formatAngka(d.totalStok);
            elKpiStokKritis.textContent = formatAngka(d.stokKritis);
            buatBarVertikalGanda(elChartTrenMutasi, (d.trend || []).map((t) => ({ label: labelTanggalRingkas(t.tanggal), masuk: t.masuk, keluar: t.keluar })));
            buatBarHorizontal(elChartTop5Keluar, (d.top5Keluar || []).map((t) => ({ label: t.nama, nilai: t.qty })));
        } catch (e) {
            elChartTrenMutasi.innerHTML = '<div class="daftar-kosong">Gagal memuat: ' + escHtml(e && e.message ? e.message : e) + '</div>';
            elChartTop5Keluar.innerHTML = '';
        }
    }
    elSelPeriodeDashboard.addEventListener('change', muatDashboard);
    elBtnMuatUlangDashboard.addEventListener('click', muatDashboard);

    // =====================================================================
    // ==== Tab "SO by Scan (HP/PDT)" -- antrean scan batch (gap-closure), padanan JSP
    // stok/opname_scan.jsp: scan berturut-turut (scanner PDT/keyboard-wedge ATAU kamera HP), tiap
    // hasil masuk antrean lokal di layar (BELUM tersimpan ke server), scan barcode yg SAMA lagi
    // menambah stok fisik +1 (bukan baris baru -- cara alami "hitung dgn scan per unit fisik"),
    // baru dikomit SEMUA sekaligus lewat "Simpan Semua". Beda dari tab "Stok Opname" manual (form
    // satu baris langsung tersimpan) -- keduanya tetap menulis ke aksi so_simpan yg SAMA persis.
    // =====================================================================
    let antreanScan = []; // [{produkId, kode, nama, stokSistem, stokFisik}]
    let kunciPencarianScan = false; // cegah dobel-proses saat cariProduk() utk mode manual & kamera tumpang-tindih

    function beep(sukses) {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = sukses ? 880 : 220;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
            osc.onended = () => { try { ctx.close(); } catch (e) { /* abaikan */ } };
        } catch (e) { /* abaikan -- audio bukan jalur kritis */ }
    }

    function hitungStatistikAntrean() {
        let lebih = 0, kurang = 0;
        antreanScan.forEach((it) => {
            const selisih = it.stokFisik - it.stokSistem;
            if (selisih > 0) lebih += selisih; else if (selisih < 0) kurang += selisih;
        });
        return { item: antreanScan.length, lebih, kurang, bersih: lebih + kurang };
    }

    function renderAntreanScan() {
        if (antreanScan.length === 0) {
            elTabelAntreanScan.innerHTML = '<tbody><tr><td><div class="daftar-kosong"><span class="ico">&#128265;</span>Belum ada item discan.</div></td></tr></tbody>';
        } else {
            let html = '<thead><tr><th>Kode</th><th>Produk</th><th class="num">Stok Sistem</th><th class="num">Stok Fisik</th><th class="num">Selisih</th><th></th></tr></thead><tbody>';
            antreanScan.forEach((it, i) => {
                const selisih = it.stokFisik - it.stokSistem;
                const badgeSelisih = selisih > 0 ? '<span class="badge hijau">+' + formatAngka(selisih) + '</span>'
                    : selisih < 0 ? '<span class="badge merah">' + formatAngka(selisih) + '</span>'
                    : '<span class="badge abu">0</span>';
                html += '<tr data-idx="' + i + '"><td>' + escHtml(it.kode) + '</td><td>' + escHtml(it.nama) + '</td>'
                    + '<td class="num">' + formatAngka(it.stokSistem) + '</td>'
                    + '<td class="num"><div class="stepper"><button type="button" class="btn-kurang-scan" data-idx="' + i + '">&#8722;</button>'
                    + '<input type="text" inputmode="decimal" class="in-fisik-scan" data-idx="' + i + '" value="' + it.stokFisik + '">'
                    + '<button type="button" class="btn-tambah-scan" data-idx="' + i + '">&#43;</button></div></td>'
                    + '<td class="num">' + badgeSelisih + '</td>'
                    + '<td><button type="button" class="btn-hapus-baris" data-idx="' + i + '" title="Hapus dari antrean">&#128465;&#65039;</button></td></tr>';
            });
            html += '</tbody>';
            elTabelAntreanScan.innerHTML = html;
            elTabelAntreanScan.querySelectorAll('.btn-tambah-scan').forEach((btn) => btn.addEventListener('click', () => { ubahStokFisikAntrean(parseInt(btn.getAttribute('data-idx'), 10), 1); }));
            elTabelAntreanScan.querySelectorAll('.btn-kurang-scan').forEach((btn) => btn.addEventListener('click', () => { ubahStokFisikAntrean(parseInt(btn.getAttribute('data-idx'), 10), -1); }));
            elTabelAntreanScan.querySelectorAll('.in-fisik-scan').forEach((inp) => inp.addEventListener('change', () => {
                const idx = parseInt(inp.getAttribute('data-idx'), 10);
                const v = Number(inp.value.trim().replace(',', '.'));
                if (!isNaN(v)) { antreanScan[idx].stokFisik = v; renderAntreanScan(); }
            }));
            elTabelAntreanScan.querySelectorAll('.btn-hapus-baris').forEach((btn) => btn.addEventListener('click', () => {
                antreanScan.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
                renderAntreanScan();
            }));
        }

        const stat = hitungStatistikAntrean();
        elStatItemScan.textContent = stat.item;
        elStatLebihScan.textContent = '+' + formatAngka(stat.lebih);
        elStatKurangScan.textContent = formatAngka(stat.kurang);
        elStatSelisihScan.textContent = (stat.bersih > 0 ? '+' : '') + formatAngka(stat.bersih);
        const totalAbs = Math.abs(stat.lebih) + Math.abs(stat.kurang);
        if (totalAbs <= 0) {
            elProporsiScan.innerHTML = '';
        } else {
            const pctLebih = Math.round((Math.abs(stat.lebih) / totalAbs) * 100);
            elProporsiScan.innerHTML = '<div class="seg-lebih" style="width:' + pctLebih + '%;"></div><div class="seg-kurang" style="width:' + (100 - pctLebih) + '%;"></div>';
        }
        elBtnSimpanSemuaScan.disabled = antreanScan.length === 0;
        elBtnSimpanSemuaScan.textContent = 'Simpan Semua (' + antreanScan.length + ')';
    }

    function ubahStokFisikAntrean(idx, delta) {
        antreanScan[idx].stokFisik += delta;
        renderAntreanScan();
    }

    async function prosesKodeDiscan(kode) {
        if (!kode || kunciPencarianScan) return;
        kunciPencarianScan = true;
        try {
            const existing = antreanScan.filter((it) => it.kode.toLowerCase() === kode.toLowerCase())[0];
            if (existing) {
                existing.stokFisik += 1;
                renderAntreanScan();
                beep(true);
                tampilkanToast('success', existing.nama + ': +1 (total ' + formatAngka(existing.stokFisik) + ')');
                return;
            }
            const r = await window.electronAPI.posAPI.stokOpname.scan({ barcode: kode });
            if (!r.ok) {
                beep(false);
                tampilkanToast('error', (r.pesan || 'Barcode "' + kode + '" tidak dikenal.'));
                return;
            }
            antreanScan.push({ produkId: r.data.produkId, kode: r.data.kode, nama: r.data.nama, stokSistem: r.data.stokSistem, stokFisik: 1 });
            renderAntreanScan();
            beep(true);
            tampilkanToast('success', r.data.nama + ' ditambahkan ke antrean.');
        } catch (e) {
            beep(false);
            tampilkanToast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            kunciPencarianScan = false;
        }
    }

    elInBarcodeScan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const kode = elInBarcodeScan.value.trim();
            elInBarcodeScan.value = '';
            prosesKodeDiscan(kode);
        }
    });

    elBtnKosongkanAntreanScan.addEventListener('click', () => {
        if (antreanScan.length === 0) return;
        if (!confirm('Kosongkan seluruh antrean (' + antreanScan.length + ' item)? Belum ada yang tersimpan ke server.')) return;
        antreanScan = [];
        renderAntreanScan();
    });

    elBtnSimpanSemuaScan.addEventListener('click', async () => {
        if (antreanScan.length === 0 || !bolehKelolaSo()) return;
        const keterangan = elKetAntreanScan.value.trim();
        const semulaTeks = elBtnSimpanSemuaScan.textContent;
        elBtnSimpanSemuaScan.disabled = true;
        let sukses = 0, gagal = 0;
        for (let i = 0; i < antreanScan.length; i++) {
            const it = antreanScan[i];
            elBtnSimpanSemuaScan.textContent = 'Menyimpan ' + (i + 1) + '/' + antreanScan.length + '...';
            try {
                const r = await window.electronAPI.posAPI.stokOpname.simpan({ produk_id: it.produkId, stok_fisik: it.stokFisik, keterangan: keterangan });
                if (r.ok) sukses++; else gagal++;
            } catch (e) { gagal++; }
        }
        tampilkanToast(gagal > 0 ? 'error' : 'success', 'Selesai: ' + sukses + ' tersimpan' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + '.');
        if (sukses > 0) {
            antreanScan = gagal > 0 ? antreanScan.slice(sukses) : [];
            elKetAntreanScan.value = '';
            muatRingkasan();
            muatRiwayat();
        }
        renderAntreanScan();
        elBtnSimpanSemuaScan.disabled = antreanScan.length === 0;
        if (antreanScan.length > 0) elBtnSimpanSemuaScan.textContent = semulaTeks;
    });

    // ---- Kamera (html5-qrcode, gap-closure "HP" di "SO by Scan (HP/PDT)") ----
    let instansiKamera = null;
    let kameraAktif = false;
    let kunciKamera = false; // debounce hasil decode berturut-turut dari frame yg sama

    async function mulaiKamera() {
        if (typeof Html5Qrcode === 'undefined') {
            tampilkanToast('error', 'Modul kamera tidak tersedia.');
            return;
        }
        elReaderKameraScan.style.display = 'block';
        instansiKamera = new Html5Qrcode('readerKameraScan');
        try {
            await instansiKamera.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: 220 },
                (kodeTerdeteksi) => {
                    if (kunciKamera) return;
                    kunciKamera = true;
                    prosesKodeDiscan(kodeTerdeteksi).finally(() => { setTimeout(() => { kunciKamera = false; }, 1200); });
                },
                () => { /* per-frame tak terdeteksi -- abaikan, ini normal & sering terjadi */ }
            );
            kameraAktif = true;
            elBtnKameraScan.classList.add('aktif');
            elBtnKameraScan.innerHTML = '&#10005; <span data-i18n="Tutup Kamera">Tutup Kamera</span>';
        } catch (e) {
            elReaderKameraScan.style.display = 'none';
            tampilkanToast('error', 'Tidak bisa mengakses kamera: ' + (e && e.message ? e.message : e));
        }
    }

    function hentikanKamera() {
        if (!kameraAktif || !instansiKamera) return;
        kameraAktif = false;
        elBtnKameraScan.classList.remove('aktif');
        elBtnKameraScan.innerHTML = '&#128247; <span data-i18n="Kamera">Kamera</span>';
        instansiKamera.stop().then(() => instansiKamera.clear()).catch(() => { /* abaikan -- sudah berhenti/hancur */ }).finally(() => {
            elReaderKameraScan.style.display = 'none';
            instansiKamera = null;
        });
    }

    elBtnKameraScan.addEventListener('click', () => { kameraAktif ? hentikanKamera() : mulaiKamera(); });

    renderAntreanScan();

    // ==== Inisialisasi ====
    (async function inisialisasi() {
        await segarkanStatus();
        await muatRingkasan();
        await muatRiwayat();
        // Gap-closure: tab "Kartu Mutasi Stok" SUDAH aktif secara default di markup (bukan hasil klik),
        // jadi pindahSubtabSo/pindahTab TIDAK PERNAH terpanggil saat layar pertama dibuka -- tanpa baris
        // ini dashboardnya kosong sampai pengguna klik ulang tab-nya sendiri atau tombol "Muat Ulang".
        dashboardPernahDimuat = true;
        muatDashboard();
    })();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
