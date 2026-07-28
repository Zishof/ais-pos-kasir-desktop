/**
 * ringkasan-renderer.js -- Dashboard "Ringkasan" 4 tab (Ringkasan Umum/Keuangan & Kinerja/Produk &
 * Inventaris/Perilaku Pelanggan), port dari dashboard admin Kantin versi web (`dashboard.jsp`),
 * SELALU di-scope ke toko kasir yang login (server-side, lihat `PosApi.resolveTokoId`).
 *
 * Tiap tab lazy-load datanya sendiri saat pertama kali diklik (bukan semua sekaligus saat halaman
 * dibuka -- 4 tab ini sama-sama menjalankan beberapa query agregat lumayan berat di server, memuat
 * satu per satu sesuai kebutuhan kasir lebih ramah drpd memuat semuanya di depan). TIDAK ADA
 * fetch()/XHR di sini -- semua data lewat window.electronAPI.posAPI.dashboard.* (IPC ke proses utama).
 *
 * Chart dibangun murni HTML/CSS (bar vertikal/horizontal, stack proporsional) -- BUKAN library
 * charting eksternal -- konsisten dgn gaya proyek ini (lihat memori "ganti-semua-jfreechart-htmlcss").
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');
    const elInfoStrip = document.getElementById('infoStrip');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    // ==== Util umum ====

    function formatRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function formatAngka(n) { return Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function formatWaktu(iso) {
        if (!iso) return '-';
        try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
        catch (e) { return iso; }
    }
    function formatTanggalSingkat(iso) {
        if (!iso) return '';
        const p = String(iso).split('-');
        return p.length === 3 ? (p[2] + '/' + p[1]) : String(iso);
    }
    function escapeHtml(s) {
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

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan */ }
    }

    // ==== Ekspor CSV ====

    function keCsv(headers, rows) {
        const esc = (v) => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
        };
        const lines = [headers.map(esc).join(',')];
        rows.forEach((r) => lines.push(r.map(esc).join(',')));
        return lines.join('\r\n');
    }
    async function unduhCsv(namaBerkas, headers, rows) {
        try {
            const isi = keCsv(headers, rows);
            const hasil = await window.electronAPI.posAPI.simpanFile({ namaBerkas: namaBerkas, isi: isi });
            if (hasil.ok) tampilkanToast('success', 'Berkas tersimpan: ' + hasil.path);
            else if (!hasil.dibatalkan) tampilkanToast('error', hasil.pesan || 'Gagal menyimpan berkas.');
        } catch (e) { tampilkanToast('error', 'Gagal menyimpan berkas: ' + (e && e.message ? e.message : e)); }
    }

    // ==== Chart HTML/CSS ====

    function buatBarVertikal(container, data, opsi) {
        opsi = opsi || {};
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong">Belum ada data.</div>'; return; }
        const maks = Math.max.apply(null, data.map((d) => Math.abs(d.nilai))) || 1;
        const wrap = document.createElement('div');
        wrap.className = 'chart-v-wrap';
        data.forEach((d) => {
            const kolom = document.createElement('div');
            kolom.className = 'chart-v-kolom';
            const batang = document.createElement('div');
            batang.className = 'batang';
            batang.style.height = Math.max(2, Math.round((Math.abs(d.nilai) / maks) * 100)) + '%';
            if (opsi.warnaFn) batang.style.background = opsi.warnaFn(d);
            batang.title = d.label + ': ' + (opsi.formatNilai ? opsi.formatNilai(d.nilai) : d.nilai);
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = d.label;
            kolom.appendChild(batang);
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
            baris.querySelector('.nilai').textContent = opsi.formatNilai ? opsi.formatNilai(d.nilai) : d.nilai;
            container.appendChild(baris);
        });
    }

    const PALET = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#dc2626'];
    function buatStackProporsional(container, data, opsi) {
        opsi = opsi || {};
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong">Belum ada data.</div>'; return; }
        const total = data.reduce((s, d) => s + d.nilai, 0) || 1;
        const stack = document.createElement('div');
        stack.className = 'stack-bar';
        const legenda = document.createElement('div');
        legenda.className = 'legenda-stack';
        data.forEach((d, i) => {
            const warna = PALET[i % PALET.length];
            const seg = document.createElement('div');
            seg.className = 'seg';
            seg.style.width = Math.max(0.5, (d.nilai / total * 100)) + '%';
            seg.style.background = warna;
            seg.title = d.label + ': ' + (opsi.formatNilai ? opsi.formatNilai(d.nilai) : d.nilai);
            stack.appendChild(seg);
            const item = document.createElement('div');
            item.className = 'item';
            item.innerHTML = '<span class="dot"></span><span></span>';
            item.querySelector('.dot').style.background = warna;
            item.querySelector('span:last-child').textContent = d.label + ' (' + (opsi.formatNilai ? opsi.formatNilai(d.nilai) : d.nilai) + ')';
            legenda.appendChild(item);
        });
        container.appendChild(stack);
        container.appendChild(legenda);
    }

    // ==== Tab switcher ====

    const tabDimuat = { umum: false, keuangan: false, produk: false, pelanggan: false, peringkat: false, resep: false, ramalan: false, promo: false, kepatuhan: false };
    let tabAktif = 'umum';

    function aktifkanTab(nama) {
        tabAktif = nama;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('aktif', b.getAttribute('data-tab') === nama));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('aktif'));
        document.getElementById('tab' + nama.charAt(0).toUpperCase() + nama.slice(1)).classList.add('aktif');
        if (!tabDimuat[nama]) muatTab(nama);
    }
    document.querySelectorAll('.tab-btn').forEach((b) => {
        b.addEventListener('click', () => aktifkanTab(b.getAttribute('data-tab')));
    });

    function muatTab(nama) {
        if (nama === 'umum') return muatTabUmum().then(() => { tabDimuat.umum = true; });
        if (nama === 'keuangan') return muatTabKeuangan().then(() => { tabDimuat.keuangan = true; });
        if (nama === 'produk') return muatTabProduk().then(() => { tabDimuat.produk = true; });
        if (nama === 'pelanggan') return muatTabPelanggan().then(() => { tabDimuat.pelanggan = true; });
        if (nama === 'peringkat') return muatTabPeringkat().then(() => { tabDimuat.peringkat = true; });
        if (nama === 'resep') return muatTabResep().then(() => { tabDimuat.resep = true; });
        if (nama === 'ramalan') return muatTabRamalan().then(() => { tabDimuat.ramalan = true; });
        if (nama === 'promo') return muatTabPromo().then(() => { tabDimuat.promo = true; });
        if (nama === 'kepatuhan') return muatTabKepatuhan().then(() => { tabDimuat.kepatuhan = true; });
    }

    elBtnMuatUlang.addEventListener('click', () => muatTab(tabAktif));

    function tampilkanErrorTab(judul, hasilAtauError) {
        if (hasilAtauError && hasilAtauError.pesan !== undefined) {
            window.PesanDetail.tampilkanDariHasil(hasilAtauError);
        } else {
            window.PesanDetail.tampilkan(Object.assign({}, window.PesanDetail.KAMUS._DEFAULT_ERROR, {
                judul: judul, teknis: hasilAtauError && hasilAtauError.message ? hasilAtauError.message : String(hasilAtauError)
            }));
        }
    }

    // ==== TAB 1: RINGKASAN UMUM ====

    const elSelPeriodeTren = document.getElementById('selPeriodeTren');
    const elChartTren = document.getElementById('chartTren');
    const elFilterTglMulai = document.getElementById('filterTglMulai');
    const elFilterTglSampai = document.getElementById('filterTglSampai');
    const elFilterCariPembeli = document.getElementById('filterCariPembeli');
    const elBtnTerapkanFilterTrx = document.getElementById('btnTerapkanFilterTrx');
    const elBtnUnduhTrx = document.getElementById('btnUnduhTrx');
    const elBtnLayaniSemua = document.getElementById('btnLayaniSemua');
    const elTabelTransaksi = document.getElementById('tabelTransaksi');
    const elInfoPaginasiTrx = document.getElementById('infoPaginasiTrx');
    const elBtnHalSebelumnya = document.getElementById('btnHalSebelumnya');
    const elBtnHalBerikutnya = document.getElementById('btnHalBerikutnya');

    const trxState = { page: 1, pageSize: 10, tglMulai: '', tglSampai: '', cariPembeli: '', totalTrx: 0, dataTrx: [] };

    function isiKpi(prefix, obj) {
        document.getElementById('kpi' + prefix + 'Rp').textContent = formatRupiah(obj.rp);
        document.getElementById('kpi' + prefix + 'Trx').textContent = formatAngka(obj.trx) + ' transaksi';
    }

    function renderTabelTransaksi(data) {
        if (!data || data.length === 0) {
            elTabelTransaksi.innerHTML = '<tr><td><div class="daftar-kosong"><span class="ico">\u{1F4ED}</span>Belum ada transaksi.</div></td></tr>';
            return;
        }
        let html = '<thead><tr><th>Waktu</th><th>Barang</th><th>Pembeli</th><th>Tipe</th><th>Metode</th><th style="text-align:right">Qty</th><th style="text-align:right">Total</th><th>Status</th><th></th><th></th></tr></thead><tbody>';
        data.forEach((t) => {
            html += '<tr>'
                + '<td>' + formatWaktu(t.waktu) + '</td>'
                + '<td>' + escapeHtml(t.barang) + '</td>'
                + '<td>' + escapeHtml(t.pembeli || '-') + '</td>'
                + '<td>' + escapeHtml(t.tipeAnggota || '-') + '</td>'
                + '<td>' + escapeHtml(t.metode || '-') + '</td>'
                + '<td class="num">' + formatAngka(t.qty) + '</td>'
                + '<td class="num">' + formatRupiah(t.total) + '</td>'
                + '<td>' + (t.terlayani ? '<span class="badge hijau">Selesai</span>' : '<span class="badge kuning">Menunggu</span>') + '</td>'
                + '<td>' + (t.terlayani ? '' : '<button type="button" class="btn-kecil layani-satu" data-id="' + t.idTransaksi + '">Layani</button>') + '</td>'
                + '<td><button type="button" class="btn-kecil cetak-struk-satu" data-id="' + t.idTransaksi + '">Cetak Struk</button></td>'
                + '</tr>';
        });
        html += '</tbody>';
        elTabelTransaksi.innerHTML = html;
        elTabelTransaksi.querySelectorAll('.layani-satu').forEach((btn) => {
            btn.addEventListener('click', () => layaniSatuTransaksi(btn.getAttribute('data-id')));
        });
        elTabelTransaksi.querySelectorAll('.cetak-struk-satu').forEach((btn) => {
            btn.addEventListener('click', () => cetakStrukTransaksi(btn.getAttribute('data-id')));
        });
    }

    /**
     * Tombol "Cetak Struk" per baris riwayat -- BEDA dari layar Kasir (yg punya data keranjang
     * in-memory langsung dari checkout barusan): baris riwayat di sini hanya punya ringkasan agregat
     * (lihat {@code renderTabelTransaksi}), jadi rincian item HARUS diambil ulang dari server lewat
     * {@code posAPI.detailTransaksi} (aksi {@code detail_transaksi}, lihat JavaDoc server
     * {@code PosApi.prosesDetailTransaksi}) sebelum bisa dicetak lewat {@code struk.js}.
     */
    async function cetakStrukTransaksi(id) {
        try {
            const hasil = await window.electronAPI.posAPI.detailTransaksi({ id: id });
            if (!hasil.ok) { window.PesanDetail.tampilkanDariHasil(hasil); return; }
            window.Struk.cetakDenganPreview(hasil.data);
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat data struk: ' + (e && e.message ? e.message : e));
        }
    }

    function renderPaginasiTrx() {
        const totalHal = Math.max(1, Math.ceil(trxState.totalTrx / trxState.pageSize));
        elInfoPaginasiTrx.textContent = 'Halaman ' + trxState.page + ' dari ' + totalHal + ' (' + formatAngka(trxState.totalTrx) + ' transaksi)';
        elBtnHalSebelumnya.disabled = trxState.page <= 1;
        elBtnHalBerikutnya.disabled = trxState.page >= totalHal;
    }

    async function muatTabUmum() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const payload = {
                periodeTren: elSelPeriodeTren.value,
                tglMulai: trxState.tglMulai, tglSampai: trxState.tglSampai, cariPembeli: trxState.cariPembeli,
                page: trxState.page, pageSize: trxState.pageSize
            };
            const hasil = await window.electronAPI.posAPI.dashboard.umum(payload);
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Ringkasan Umum', hasil); return; }
            const d = hasil.data;

            isiKpi('HariIni', d.kpi.hariIni);
            isiKpi('Minggu', d.kpi.mingguIni);
            isiKpi('Bulan', d.kpi.bulanIni);
            isiKpi('Semester', d.kpi.semesterIni);

            buatBarVertikal(elChartTren, (d.tren || []).map((t) => ({ label: t.label, nilai: t.jumlah })), { formatNilai: (n) => formatAngka(n) + ' transaksi' });
            buatBarHorizontal(document.getElementById('chartOmzetKategori'), (d.omzetKategori || []).map((k) => ({ label: k.label, nilai: k.nilai })), { formatNilai: (n) => formatRupiah(n) });
            buatStackProporsional(document.getElementById('stackMetodeUmum'), (d.metodeBayar || []).map((m) => ({ label: m.label, nilai: m.nilai })), { formatNilai: (n) => formatRupiah(n) });
            buatBarHorizontal(document.getElementById('chartJamSibukUmum'), (d.jamSibuk || []).map((j) => ({ label: j.label, nilai: j.nilai })), { formatNilai: (n) => formatAngka(n) + ' transaksi' });

            trxState.totalTrx = d.transaksi.total;
            trxState.dataTrx = d.transaksi.data;
            renderTabelTransaksi(d.transaksi.data);
            renderPaginasiTrx();

            const userId = ''; // toko sudah diisi via konfigurasi() saat init
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Ringkasan Umum', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elSelPeriodeTren.addEventListener('change', muatTabUmum);
    elBtnTerapkanFilterTrx.addEventListener('click', () => {
        trxState.tglMulai = elFilterTglMulai.value || '';
        trxState.tglSampai = elFilterTglSampai.value || '';
        trxState.cariPembeli = elFilterCariPembeli.value.trim();
        trxState.page = 1;
        muatTabUmum();
    });
    elBtnHalSebelumnya.addEventListener('click', () => { if (trxState.page > 1) { trxState.page--; muatTabUmum(); } });
    elBtnHalBerikutnya.addEventListener('click', () => { trxState.page++; muatTabUmum(); });
    elBtnUnduhTrx.addEventListener('click', () => {
        unduhCsv('riwayat-transaksi.csv',
            ['Waktu', 'Barang', 'Pembeli', 'Tipe Anggota', 'Metode', 'Qty', 'Total', 'Status'],
            trxState.dataTrx.map((t) => [formatWaktu(t.waktu), t.barang, t.pembeli || '', t.tipeAnggota || '', t.metode || '', t.qty, t.total, t.terlayani ? 'Selesai' : 'Menunggu']));
    });

    async function layaniSatuTransaksi(id) {
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.layaniTransaksi({ id: id });
            if (hasil.ok) { tampilkanToast('success', 'Transaksi ditandai terlayani.'); muatTabUmum(); }
            else tampilkanErrorTab('Gagal Menandai Terlayani', hasil);
        } catch (e) { tampilkanToast('error', 'Gagal: ' + (e && e.message ? e.message : e)); }
    }
    elBtnLayaniSemua.addEventListener('click', async () => {
        const yakin = confirm('Tandai SEMUA transaksi yang sesuai filter tanggal saat ini sebagai terlayani?');
        if (!yakin) return;
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.layaniSemuaTransaksi({ tglMulai: trxState.tglMulai, tglSampai: trxState.tglSampai });
            if (hasil.ok) { tampilkanToast('success', formatAngka(hasil.data.jumlahBarisDiperbarui || 0) + ' baris ditandai terlayani.'); muatTabUmum(); }
            else tampilkanErrorTab('Gagal Menandai Semua Terlayani', hasil);
        } catch (e) { tampilkanToast('error', 'Gagal: ' + (e && e.message ? e.message : e)); }
    });

    // ==== TAB 2: KEUANGAN & KINERJA ====

    let dataKeuangan = null;

    function renderTabelPerforma(p) {
        const tabel = document.getElementById('tabelPerforma');
        const baris = [{ label: 'Harian', d: p.harian }, { label: 'Mingguan (7 hari)', d: p.mingguan }, { label: 'Bulanan (30 hari)', d: p.bulanan }];
        let html = '<thead><tr><th>Periode</th><th style="text-align:right">Qty Terjual</th><th style="text-align:right">Pembeli Unik</th><th style="text-align:right">Total</th></tr></thead><tbody>';
        baris.forEach((b) => {
            html += '<tr><td>' + b.label + '</td><td class="num">' + formatAngka(b.d.qty) + '</td><td class="num">' + formatAngka(b.d.pembeli) + '</td><td class="num">' + formatRupiah(b.d.total) + '</td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    function renderTabelResepMenu(list) {
        const tabel = document.getElementById('tabelResepMenu');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada menu ber-resep.</div></td></tr>'; return; }
        let html = '<thead><tr><th>Tenant</th><th>Menu</th><th style="text-align:right">HPP</th><th style="text-align:right">Harga Jual</th><th style="text-align:right">Untung</th><th style="text-align:right">Margin</th></tr></thead><tbody>';
        list.forEach((m) => {
            const kelas = m.marginPersen < 0 ? 'merah' : (m.marginPersen < 15 ? 'kuning' : 'hijau');
            const label = m.marginPersen < 0 ? 'Rugi' : (m.marginPersen < 15 ? 'Tipis' : 'Sehat');
            html += '<tr><td>' + escapeHtml(m.tenant) + '</td><td>' + escapeHtml(m.menu) + '</td><td class="num">' + formatRupiah(m.hpp) + '</td>'
                + '<td class="num">' + formatRupiah(m.jual) + '</td><td class="num">' + formatRupiah(m.untung) + '</td>'
                + '<td class="num"><span class="badge ' + kelas + '">' + Math.round(m.marginPersen) + '% ' + label + '</span></td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    function renderTabelResepBahan(list) {
        const tabel = document.getElementById('tabelResepBahan');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada pemakaian bahan baku.</div></td></tr>'; return; }
        let html = '<thead><tr><th>Bahan Baku</th><th style="text-align:right">Qty Terpakai</th><th style="text-align:right">Nilai</th></tr></thead><tbody>';
        list.forEach((b) => { html += '<tr><td>' + escapeHtml(b.nama) + '</td><td class="num">' + formatAngka(b.qty) + '</td><td class="num">' + formatRupiah(b.nilai) + '</td></tr>'; });
        tabel.innerHTML = html + '</tbody>';
    }

    async function muatTabKeuangan() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.keuangan();
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Keuangan & Kinerja', hasil); return; }
            const d = hasil.data;
            dataKeuangan = d;

            document.getElementById('kpiLabaOmzet').textContent = formatRupiah(d.laba.kpi.omzet);
            document.getElementById('kpiLabaModal').textContent = formatRupiah(d.laba.kpi.modal);
            document.getElementById('kpiLabaKotor').textContent = formatRupiah(d.laba.kpi.labaKotor);
            document.getElementById('kpiLabaMargin').textContent = Math.round(d.laba.kpi.marginPersen) + '%';

            buatBarVertikal(document.getElementById('chartLaba'), (d.laba.tren || []).map((t) => ({ label: formatTanggalSingkat(t.tanggal), nilai: t.laba })), {
                formatNilai: (n) => formatRupiah(n),
                warnaFn: (item) => item.nilai < 0 ? 'linear-gradient(180deg,#dc2626,#f87171)' : 'linear-gradient(180deg,#16a34a,#4ade80)'
            });

            renderTabelPerforma(d.performaToko);

            document.getElementById('kpiResepJumlah').textContent = formatAngka(d.resepHpp.kpi.menuBerResep);
            document.getElementById('kpiResepRataMargin').textContent = Math.round(d.resepHpp.kpi.rataMargin) + '%';
            document.getElementById('kpiResepTertipis').textContent = d.resepHpp.kpi.marginTertipisNama + ' (' + Math.round(d.resepHpp.kpi.marginTertipisPersen) + '%)';
            document.getElementById('kpiResepNilaiBahan').textContent = formatRupiah(d.resepHpp.kpi.nilaiBahanTerpakai);
            renderTabelResepMenu(d.resepHpp.rekapMenu);
            renderTabelResepBahan(d.resepHpp.rekapBahan);
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Keuangan & Kinerja', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    document.getElementById('btnUnduhResepMenu').addEventListener('click', () => {
        if (!dataKeuangan) return;
        unduhCsv('rekap-hpp-margin-menu.csv', ['Tenant', 'Menu', 'HPP', 'Harga Jual', 'Untung', 'Margin %'],
            dataKeuangan.resepHpp.rekapMenu.map((m) => [m.tenant, m.menu, m.hpp, m.jual, m.untung, Math.round(m.marginPersen)]));
    });
    document.getElementById('btnUnduhResepBahan').addEventListener('click', () => {
        if (!dataKeuangan) return;
        unduhCsv('rekap-pemakaian-bahan-baku.csv', ['Bahan Baku', 'Qty Terpakai', 'Nilai'],
            dataKeuangan.resepHpp.rekapBahan.map((b) => [b.nama, b.qty, b.nilai]));
    });

    // ==== TAB 3: PRODUK & INVENTARIS ====

    let dataProduk = null;
    const elSelPeriodeProduk = document.getElementById('selPeriodeProduk');

    function renderTabelStok(list) {
        const tabel = document.getElementById('tabelStok');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada produk.</div></td></tr>'; return; }
        const petaBadge = { HABIS: 'merah', KRITIS: 'kuning', MENIPIS: 'biru' };
        let html = '<thead><tr><th>Produk</th><th style="text-align:right">Sisa Stok</th><th>Status</th></tr></thead><tbody>';
        list.forEach((s) => {
            html += '<tr><td>' + escapeHtml(s.namaProduk) + '</td><td class="num">' + formatAngka(s.sisaStok) + '</td>'
                + '<td><span class="badge ' + (petaBadge[s.status] || 'abu') + '">' + s.status + '</span></td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    function renderTabelBahanBaku(list) {
        const tabel = document.getElementById('tabelBahanBaku');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada data bahan baku.</div></td></tr>'; return; }
        let html = '<thead><tr><th>Bahan Baku</th><th style="text-align:right">Sisa Stok</th><th style="text-align:right">Terpakai (30 hari)</th><th style="text-align:right">Estimasi Habis</th></tr></thead><tbody>';
        list.forEach((b) => {
            const est = b.estimasiHari == null ? '-' : (Math.round(b.estimasiHari) + ' hari lagi');
            const kelas = b.estimasiHari != null && b.estimasiHari < 7 ? 'merah' : (b.estimasiHari != null && b.estimasiHari < 14 ? 'kuning' : 'abu');
            html += '<tr><td>' + escapeHtml(b.nama) + '</td><td class="num">' + formatAngka(b.sisa) + '</td><td class="num">' + formatAngka(b.terpakai) + '</td>'
                + '<td class="num"><span class="badge ' + kelas + '">' + est + '</span></td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    function renderTabelAset(list) {
        const tabel = document.getElementById('tabelAset');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Tidak ada produk yang tertaut ke modul Aset/Persediaan (atau modul itu tidak terpasang di instalasi ini).</div></td></tr>'; return; }
        let html = '<thead><tr><th>Tenant</th><th>Produk</th><th>Aset</th><th style="text-align:right">Stok Kantin</th><th style="text-align:right">Stok Aset</th><th style="text-align:right">Selisih</th></tr></thead><tbody>';
        list.forEach((a) => {
            const cocok = Math.abs(a.selisih) <= 0.001;
            html += '<tr><td>' + escapeHtml(a.tenant) + '</td><td>' + escapeHtml(a.produk) + '</td><td>' + escapeHtml(a.aset) + '</td>'
                + '<td class="num">' + formatAngka(a.stokKantin) + '</td><td class="num">' + formatAngka(a.stokAset) + '</td>'
                + '<td class="num"><span class="badge ' + (cocok ? 'hijau' : 'merah') + '">' + formatAngka(a.selisih) + '</span></td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    function renderTabelRekapTerlaris(list) {
        const tabel = document.getElementById('tabelRekapTerlaris');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada penjualan pada periode ini.</div></td></tr>'; return; }
        let html = '<thead><tr><th>Produk</th><th style="text-align:right">Qty Terjual</th><th style="text-align:right">Total Pendapatan</th></tr></thead><tbody>';
        list.forEach((r) => { html += '<tr><td>' + escapeHtml(r.nama) + '</td><td class="num">' + formatAngka(r.qty) + '</td><td class="num">' + formatRupiah(r.total) + '</td></tr>'; });
        tabel.innerHTML = html + '</tbody>';
    }

    async function muatTabProduk() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.produk({ periode: elSelPeriodeProduk.value });
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Produk & Inventaris', hasil); return; }
            const d = hasil.data;
            dataProduk = d;

            renderTabelStok(d.stok);
            buatBarHorizontal(document.getElementById('chartTerlaris'), (d.produkTerlaris || []).map((p) => ({ label: p.nama, nilai: p.qty })), { formatNilai: (n) => formatAngka(n) + ' item' });
            buatStackProporsional(document.getElementById('stackMetode'), (d.metodeBayar || []).map((m) => ({ label: m.nama, nilai: m.total })), { formatNilai: (n) => formatRupiah(n) });

            document.getElementById('kpiBahanDipantau').textContent = formatAngka(d.bahanBaku.kpi.dipantau);
            document.getElementById('kpiBahanSegeraHabis').textContent = formatAngka(d.bahanBaku.kpi.segeraHabis);
            document.getElementById('kpiBahanMendesak').textContent = d.bahanBaku.kpi.palingMendesakNama;
            document.getElementById('kpiBahanNilaiStok').textContent = formatRupiah(d.bahanBaku.kpi.nilaiStok);
            renderTabelBahanBaku(d.bahanBaku.list);

            document.getElementById('kpiAsetTertaut').textContent = formatAngka(d.rekonsiliasiAset.kpi.tertaut);
            document.getElementById('kpiAsetCocok').textContent = formatAngka(d.rekonsiliasiAset.kpi.stokCocok);
            document.getElementById('kpiAsetPerluCek').textContent = formatAngka(d.rekonsiliasiAset.kpi.perluDicek);
            renderTabelAset(d.rekonsiliasiAset.list);

            renderTabelRekapTerlaris(d.rekapProdukTerlaris);

            const elKurang = document.getElementById('listKurangLaku');
            if (!d.produkKurangLaku || d.produkKurangLaku.length === 0) {
                elKurang.innerHTML = '<div class="daftar-kosong">Tidak ada produk slow-moving -- semua produk laku cukup baik.</div>';
            } else {
                buatBarHorizontal(elKurang, d.produkKurangLaku.map((p) => ({ label: p.nama, nilai: p.terjual })), { formatNilai: (n) => formatAngka(n) + ' terjual' });
            }
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Produk & Inventaris', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elSelPeriodeProduk.addEventListener('change', muatTabProduk);
    document.getElementById('btnUnduhBahanBaku').addEventListener('click', () => {
        if (!dataProduk) return;
        unduhCsv('bahan-baku-estimasi-habis.csv', ['Bahan Baku', 'Sisa Stok', 'Terpakai (30 hari)', 'Estimasi Habis (hari)'],
            dataProduk.bahanBaku.list.map((b) => [b.nama, b.sisa, b.terpakai, b.estimasiHari == null ? '' : Math.round(b.estimasiHari)]));
    });
    document.getElementById('btnUnduhRekapTerlaris').addEventListener('click', () => {
        if (!dataProduk) return;
        unduhCsv('rekap-produk-terlaris.csv', ['Produk', 'Qty Terjual', 'Total Pendapatan'],
            dataProduk.rekapProdukTerlaris.map((r) => [r.nama, r.qty, r.total]));
    });

    // ==== TAB 4: PERILAKU PELANGGAN ====

    let dataPelanggan = null;
    const elSelPeriodePelanggan = document.getElementById('selPeriodePelanggan');

    function renderTabelRekapPelanggan(list) {
        const tabel = document.getElementById('tabelRekapPelanggan');
        if (!list || list.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada data pelanggan pada periode ini.</div></td></tr>'; return; }
        let html = '<thead><tr><th>Pelanggan</th><th style="text-align:right">Frekuensi Belanja</th><th style="text-align:right">Total Belanja</th></tr></thead><tbody>';
        list.forEach((p) => { html += '<tr><td>' + escapeHtml(p.nama) + '</td><td class="num">' + formatAngka(p.frekuensi) + '</td><td class="num">' + formatRupiah(p.total) + '</td></tr>'; });
        tabel.innerHTML = html + '</tbody>';
    }

    async function muatTabPelanggan() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.pelanggan({ periode: elSelPeriodePelanggan.value });
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Perilaku Pelanggan', hasil); return; }
            const d = hasil.data;
            dataPelanggan = d;

            const jam24 = [];
            for (let j = 0; j < 24; j++) {
                const cocok = (d.jamSibuk || []).find((x) => x.jam === j);
                jam24.push({ label: String(j), nilai: cocok ? cocok.jumlah : 0 });
            }
            buatBarVertikal(document.getElementById('chartJamSibuk'), jam24, { formatNilai: (n) => formatAngka(n) + ' transaksi' });

            const elLoyal = document.getElementById('listTerloyal');
            if (!d.pembeliTerloyal || d.pembeliTerloyal.length === 0) {
                elLoyal.innerHTML = '<div class="daftar-kosong">Belum ada data pembeli member.</div>';
            } else {
                buatBarHorizontal(elLoyal, d.pembeliTerloyal.map((p) => ({ label: p.nama, nilai: p.total })), { formatNilai: (n) => formatRupiah(n) });
            }

            renderTabelRekapPelanggan(d.rekapPelangganTerloyal);
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Perilaku Pelanggan', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elSelPeriodePelanggan.addEventListener('change', muatTabPelanggan);
    document.getElementById('btnUnduhRekapPelanggan').addEventListener('click', () => {
        if (!dataPelanggan) return;
        unduhCsv('rekap-pelanggan-terloyal.csv', ['Pelanggan', 'Frekuensi Belanja', 'Total Belanja'],
            dataPelanggan.rekapPelangganTerloyal.map((p) => [p.nama, p.frekuensi, p.total]));
    });

    // ==== TAB 5: PERINGKAT MITRA/TOKO (gap-closure kloning ZK buildLeaderboardMitra) ====

    function renderTabelPeringkatMitra(daftar) {
        const tabel = document.getElementById('tabelPeringkatMitra');
        if (!daftar || daftar.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada data pada periode ini.</div></td></tr>'; return; }
        let html = '<thead><tr><th>#</th><th>Toko/Mitra</th><th style="text-align:right">Omzet</th><th style="text-align:right">Transaksi</th>'
            + '<th style="text-align:right">Qty Terjual</th><th style="text-align:right">Margin</th><th style="text-align:right">Pertumbuhan</th><th>Status</th></tr></thead><tbody>';
        daftar.forEach((t, i) => {
            const badgeKelas = t.status === 'Tumbuh Pesat' ? 'hijau' : t.status === 'Bertumbuh' ? 'hijau' : t.status === 'Menurun' ? 'merah' : 'abu';
            html += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(t.nama) + '</td>'
                + '<td class="num">' + formatRupiah(t.omzet) + '</td><td class="num">' + formatAngka(t.transaksi) + '</td>'
                + '<td class="num">' + formatAngka(t.qty) + '</td><td class="num">' + t.margin.toFixed(1) + '%</td>'
                + '<td class="num">' + (t.pertumbuhan == null ? '-' : (t.pertumbuhan >= 0 ? '+' : '') + t.pertumbuhan.toFixed(1) + '%') + '</td>'
                + '<td><span class="badge ' + badgeKelas + '">' + escapeHtml(t.status) + '</span></td></tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    async function muatTabPeringkat() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.peringkatMitra({});
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Peringkat Mitra', hasil); return; }
            const d = hasil.data;
            document.getElementById('infoPeringkatNonAdmin').style.display = d.semuaToko ? 'none' : 'block';
            document.getElementById('kpiPeringkatTotalToko').textContent = formatAngka(d.totalToko || 0);
            document.getElementById('kpiPeringkatOmzetTertinggi').textContent = formatRupiah(d.omzetTertinggi || 0);
            document.getElementById('kpiPeringkatNamaOmzetTertinggi').textContent = d.namaOmzetTertinggi || '-';
            document.getElementById('kpiPeringkatTumbuhTertinggi').textContent = d.pertumbuhanTertinggi == null ? '-' : ('+' + Number(d.pertumbuhanTertinggi).toFixed(1) + '%');
            document.getElementById('kpiPeringkatNamaTumbuhTertinggi').textContent = d.namaPertumbuhanTertinggi || '-';
            const elPerlu = document.getElementById('kartuPerluPerhatian');
            if (d.pertumbuhanTerendah != null) {
                elPerlu.style.display = 'block';
                document.getElementById('kpiPeringkatTumbuhTerendah').textContent = Number(d.pertumbuhanTerendah).toFixed(1) + '%';
                document.getElementById('kpiPeringkatNamaTumbuhTerendah').textContent = d.namaPertumbuhanTerendah || '-';
            } else {
                elPerlu.style.display = 'none';
            }
            const top10 = (d.daftar || []).slice(0, 10).map((t) => ({ label: t.nama, nilai: t.omzet }));
            buatBarHorizontal(document.getElementById('chartPeringkatOmzet'), top10, { formatNilai: (n) => formatRupiah(n) });
            renderTabelPeringkatMitra(d.daftar || []);
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Peringkat Mitra', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    // ==== TAB 6: RESEP, HPP & MARGIN (gap-closure kloning ZK) ====

    async function muatTabResep() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.resepHpp();
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Resep, HPP & Margin', hasil); return; }
            const d = hasil.data;
            document.getElementById('kpiResepTotalMenu').textContent = formatAngka(d.totalMenu || 0);
            document.getElementById('kpiResepRataMargin').textContent = Number(d.rataMargin || 0).toFixed(1) + '%';
            document.getElementById('kpiResepMarginTerendah').textContent = d.marginTerendah == null ? '-' : Number(d.marginTerendah).toFixed(1) + '%';
            document.getElementById('kpiResepNamaMarginTerendah').textContent = d.namaMarginTerendah || '-';
            document.getElementById('kpiResepNilaiBahan').textContent = formatRupiah(d.nilaiBahanTerpakai || 0);
            buatBarHorizontal(document.getElementById('chartResepMargin'), (d.topMargin || []).map((m) => ({ label: m.nama, nilai: m.margin })), { formatNilai: (n) => n.toFixed(1) + '%' });
            buatBarHorizontal(document.getElementById('chartResepBahanBaku'), d.byBahanBaku || [], { formatNilai: (n) => formatAngka(n) });
            const tabel = document.getElementById('tabelResepMenu');
            const menu = d.daftarMenu || [];
            if (menu.length === 0) {
                tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada produk dengan resep.</div></td></tr>';
            } else {
                let html = '<thead><tr><th>Menu</th><th>Kategori</th><th style="text-align:right">Jml Bahan</th><th style="text-align:right">HPP</th>'
                    + '<th style="text-align:right">Harga Jual</th><th style="text-align:right">Untung</th><th style="text-align:right">Margin</th></tr></thead><tbody>';
                menu.forEach((m) => {
                    html += '<tr><td>' + escapeHtml(m.nama) + '</td><td>' + escapeHtml(m.kategori) + '</td><td class="num">' + m.jmlBahan + '</td>'
                        + '<td class="num">' + formatRupiah(m.hpp) + '</td><td class="num">' + formatRupiah(m.hargaJual) + '</td>'
                        + '<td class="num">' + formatRupiah(m.untung) + '</td><td class="num">' + m.margin.toFixed(1) + '%</td></tr>';
                });
                tabel.innerHTML = html + '</tbody>';
            }
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Resep, HPP & Margin', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    // ==== TAB 7: RAMALAN PENJUALAN (gap-closure kloning ZK) ====

    async function muatTabRamalan() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.ramalan();
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Ramalan Penjualan', hasil); return; }
            const d = hasil.data;
            document.getElementById('kpiRamalanTotal').textContent = formatAngka(d.totalTransaksi || 0);
            document.getElementById('kpiRamalanRata').textContent = Number(d.rataRata || 0).toFixed(1);
            document.getElementById('kpiRamalanPrediksi').textContent = Number(d.prediksiBerikutnya || 0).toFixed(1);
            const elTren = document.getElementById('kartuRamalanTren');
            elTren.className = 'kartu-kpi ' + (d.naik ? 'sukses' : 'bahaya');
            document.getElementById('kpiRamalanTren').textContent = (d.naik ? '\u{2191} Naik ' : '\u{2193} Turun ') + Number(d.persenTren || 0).toFixed(1) + '%';
            buatBarVertikal(document.getElementById('chartRamalanTransaksi'), (d.trenTransaksi || []).map((t) => ({ label: t.label, nilai: t.nilai })), { formatNilai: (n) => formatAngka(n) + ' transaksi' });
            buatBarVertikal(document.getElementById('chartRamalanOmzet'), (d.trenOmzet || []).map((t) => ({ label: t.label, nilai: t.nilai })), { formatNilai: (n) => formatRupiah(n) });
            buatBarHorizontal(document.getElementById('chartRamalanProyeksi'), (d.proyeksi || []).map((p) => ({ label: p.label, nilai: p.nilai })), { formatNilai: (n) => formatAngka(Math.round(n)) + ' transaksi (estimasi)' });
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Ramalan Penjualan', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    // ==== TAB 8: MONITOR PROMO & CASHBACK (gap-closure kloning ZK) ====

    async function muatTabPromo() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.promoCashback();
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Monitor Promo & Cashback', hasil); return; }
            const d = hasil.data;
            document.getElementById('kpiPromoDiskon').textContent = formatRupiah(d.diskonDiberikan || 0);
            document.getElementById('kpiPromoCashback').textContent = formatRupiah(d.cashbackDiberikan || 0);
            document.getElementById('kpiPromoCair').textContent = formatRupiah(d.cashbackDicairkan || 0);
            document.getElementById('kpiPromoMengendap').textContent = formatRupiah(d.saldoMengendap || 0);
            buatBarHorizontal(document.getElementById('chartPromoProduk'), d.topProduk || [], { formatNilai: (n) => formatRupiah(n) });
            buatBarHorizontal(document.getElementById('chartPromoMember'), d.topMember || [], { formatNilai: (n) => formatRupiah(n) });
            const tabel = document.getElementById('tabelPromoAturan');
            const aturan = d.aturanDiskon || [];
            if (aturan.length === 0) {
                tabel.innerHTML = '<tr><td><div class="daftar-kosong">Belum ada promo dipakai pada periode ini.</div></td></tr>';
            } else {
                let html = '<thead><tr><th>Aturan Promo</th><th>Jenis</th><th style="text-align:right">Dipakai</th><th style="text-align:right">Total Biaya</th></tr></thead><tbody>';
                aturan.forEach((a) => {
                    html += '<tr><td>' + escapeHtml(a.namaAturan) + '</td><td><span class="badge ' + (a.potonganLangsung ? 'biru' : 'hijau') + '">' + (a.potonganLangsung ? 'Potong Struk' : 'Cashback') + '</span></td>'
                        + '<td class="num">' + formatAngka(a.dipakai) + '</td><td class="num">' + formatRupiah(a.totalBiaya) + '</td></tr>';
                });
                tabel.innerHTML = html + '</tbody>';
            }
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Monitor Promo & Cashback', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    // ==== TAB 9: KEPATUHAN OPERASIONAL (gap-closure kloning ZK, 6/6 rule) ====

    function renderTabelKepatuhanGenerik(idTabel, daftar, kolom, pesanKosong) {
        const tabel = document.getElementById(idTabel);
        if (!daftar || daftar.length === 0) { tabel.innerHTML = '<tr><td><div class="daftar-kosong">' + escapeHtml(pesanKosong) + '</div></td></tr>'; return; }
        let html = '<thead><tr>' + kolom.map((k) => '<th' + (k.num ? ' style="text-align:right"' : '') + '>' + escapeHtml(k.label) + '</th>').join('') + '</tr></thead><tbody>';
        daftar.forEach((baris) => {
            html += '<tr>' + kolom.map((k) => '<td' + (k.num ? ' class="num"' : '') + '>' + escapeHtml(k.render(baris)) + '</td>').join('') + '</tr>';
        });
        tabel.innerHTML = html + '</tbody>';
    }

    async function muatTabKepatuhan() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const hasil = await window.electronAPI.posAPI.dashboard.kepatuhan();
            if (!hasil.ok) { tampilkanErrorTab('Gagal Memuat Kepatuhan Operasional', hasil); return; }
            const d = hasil.data;
            document.getElementById('kpiKepatuhanOpname').textContent = formatAngka(d.jmlTelatOpname || 0);
            document.getElementById('kpiKepatuhanSesi').textContent = formatAngka(d.jmlSesiLupaTutup || 0);
            document.getElementById('kpiKepatuhanSelisih').textContent = formatRupiah(d.totalSelisihKas || 0);
            document.getElementById('kpiKepatuhanDiskon').textContent = formatRupiah(d.totalDiskonManual || 0);
            document.getElementById('kpiKepatuhanSelisihOpname').textContent = formatRupiah(d.totalSelisihOpnameRp || 0);
            document.getElementById('kpiKepatuhanPembatalan').textContent = formatAngka(d.jmlPembatalan || 0);

            renderTabelKepatuhanGenerik('tabelKepatuhanOpname', d.opnameOverdue, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Terakhir Opname', render: (r) => r.terakhirOpname ? formatWaktu(new Date(r.terakhirOpname)) : 'Belum pernah' },
                { label: 'Hari Sejak', num: true, render: (r) => r.hariSejak >= 99999 ? '-' : Math.round(r.hariSejak) + ' hari' }
            ], 'Semua toko sudah opname dalam 30 hari terakhir.');

            renderTabelKepatuhanGenerik('tabelKepatuhanSesi', d.sesiTerbuka, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Kasir', render: (r) => r.kasir || '-' },
                { label: 'Waktu Buka', render: (r) => r.waktuBuka ? formatWaktu(new Date(r.waktuBuka)) : '-' },
                { label: 'Terbuka Sejak', num: true, render: (r) => Math.round(r.jamTerbuka) + ' jam' }
            ], 'Tidak ada sesi kas yang lupa ditutup.');

            renderTabelKepatuhanGenerik('tabelKepatuhanSelisih', d.selisihKas, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Kasir', render: (r) => r.kasir || '-' },
                { label: 'Waktu Tutup', render: (r) => r.waktuTutup ? formatWaktu(new Date(r.waktuTutup)) : '-' },
                { label: 'Selisih', num: true, render: (r) => formatRupiah(r.selisih) }
            ], 'Tidak ada selisih kas pada 30 hari terakhir.');

            renderTabelKepatuhanGenerik('tabelKepatuhanDiskon', d.diskonManual, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Kasir', render: (r) => r.kasir || '-' },
                { label: 'Jml Transaksi', num: true, render: (r) => formatAngka(r.jumlahTransaksi) },
                { label: 'Total Diskon', num: true, render: (r) => formatRupiah(r.totalDiskon) }
            ], 'Tidak ada diskon manual tanpa aturan pada 30 hari terakhir.');

            renderTabelKepatuhanGenerik('tabelKepatuhanSelisihOpname', d.selisihOpname, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Baris Opname', num: true, render: (r) => formatAngka(r.jumlahBaris) },
                { label: 'Baris Selisih', num: true, render: (r) => formatAngka(r.jumlahSelisih) },
                { label: 'Dampak Rupiah', num: true, render: (r) => formatRupiah(r.nilaiRupiah) }
            ], 'Tidak ada selisih hasil stok opname pada 30 hari terakhir.');

            const elInfoPembatalan = document.getElementById('infoKepatuhanPembatalan');
            elInfoPembatalan.style.display = d.adaTabelPembatalan === false ? 'block' : 'none';
            renderTabelKepatuhanGenerik('tabelKepatuhanPembatalan', d.pembatalanTransaksi, [
                { label: 'Toko', render: (r) => r.toko },
                { label: 'Dibatalkan Oleh', render: (r) => r.dibatalkanOleh || '-' },
                { label: 'Kasir Asal', render: (r) => r.namaKasir || '-' },
                { label: 'Waktu', render: (r) => r.tanggalDibatalkan ? formatWaktu(new Date(r.tanggalDibatalkan)) : '-' },
                { label: 'Alasan', render: (r) => r.alasan || '-' },
                { label: 'Nilai', num: true, render: (r) => formatRupiah(r.totalBiaya) }
            ], d.adaTabelPembatalan === false ? 'Tabel arsip pembatalan belum tersedia.' : 'Tidak ada transaksi dibatalkan pada 30 hari terakhir.');
        } catch (e) {
            tampilkanErrorTab('Gagal Memuat Kepatuhan Operasional', e);
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    // ==== Inisialisasi ====

    async function muatKonteksToko() {
        try {
            const hasil = await window.electronAPI.posAPI.konfigurasi();
            if (hasil.ok) {
                const userId = hasil.data.userId || '';
                elNamaToko.textContent = hasil.data.tokoNama || (userId ? ('Kasir - ' + userId) : 'Kasir');
            }
        } catch (e) { /* abaikan -- bukan jalur kritis */ }
    }

    muatKonteksToko();
    muatTabUmum().then(() => { tabDimuat.umum = true; });
    segarkanStatus();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
