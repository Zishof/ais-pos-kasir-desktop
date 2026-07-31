/**
 * produk-renderer.js -- Layar "Katalog Barang" (fitur baru: "kalau login sebagai supervisor, boleh
 * edit dan tambah katalog barang seperti di POS Online versi JSP"). Daftar produk dibaca lewat aksi
 * {@code katalog} yang sudah dipakai layar Kasir (window.electronAPI.posAPI.katalog), simpan lewat
 * aksi baru {@code produk_simpan} (window.electronAPI.posAPI.produk.simpan) -- lihat JavaDoc server
 * {@code KantinHelper.produkSimpan}.
 *
 * Gerbang tampilan: kasir biasa (non-supervisor) SEKARANG tetap boleh MELIHAT seluruh katalog
 * (readonly -- berguna utk cek harga/stok saat melayani pembeli), TAPI tombol Tambah/Ubah/Unduh
 * Excel/Unggah Excel disembunyikan -- hanya admin global ATAU supervisor toko (flag
 * {@code supervisorPedagang} dari aksi {@code konfigurasi}) yang melihatnya. (Revisi permintaan klien:
 * sebelumnya layar ini ditutup TOTAL utk non-supervisor -- sekarang readonly, bukan diblokir.)
 * Gerbang SEBENARNYA tetap dicek ulang server-side di {@code KantinHelper.produkSimpan}; flag di
 * sini murni utk menyembunyikan aksi tulis dari kasir yang memang tidak berhak.
 *
 * SENGAJA hanya mencakup field INTI (kode, nama, keterangan, harga beli/jual, stok, aktif,
 * boleh-jual-walau-minus, kategori) -- resep bahan baku, unggah gambar, dan penautan masterAsset
 * TIDAK direplikasi di sini (di luar cakupan "tambah/edit katalog cepat" versi kasir; tetap
 * dikelola lewat form JSP lengkap di POS Online bila perlu).
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    const elCariProduk = document.getElementById('cariProduk');
    const elBtnTambahProduk = document.getElementById('btnTambahProduk');
    const elBtnHitungUlangStok = document.getElementById('btnHitungUlangStok');
    const elBtnSinkronProdukCache = document.getElementById('btnSinkronProdukCache');
    const elInfoCacheProduk = document.getElementById('infoCacheProduk');
    const elBtnUnduhExcelProduk = document.getElementById('btnUnduhExcelProduk');
    const elBtnCetakPdfProduk = document.getElementById('btnCetakPdfProduk');
    const elBtnUnggahExcelProduk = document.getElementById('btnUnggahExcelProduk');
    const elIsiHalaman = document.getElementById('isiHalaman');
    const elChkSemuaTokoProduk = document.getElementById('chkSemuaTokoProduk');
    const elChkHanyaAktifProduk = document.getElementById('chkHanyaAktifProduk');
    const elBtnHapusNonaktifTakTerpakai = document.getElementById('btnHapusNonaktifTakTerpakai');
    const elPanelBersihkanDuplikat = document.getElementById('panelBersihkanDuplikat');
    const elOverlayDuplikatProduk = document.getElementById('overlayDuplikatProduk');
    const elJudulDuplikatProduk = document.getElementById('judulDuplikatProduk');
    const elRingkasDuplikatProduk = document.getElementById('ringkasDuplikatProduk');
    const elDaftarGrupDuplikat = document.getElementById('daftarGrupDuplikat');
    const elBtnTutupDuplikatProduk = document.getElementById('btnTutupDuplikatProduk');
    const elBtnBatalDuplikatProduk = document.getElementById('btnBatalDuplikatProduk');
    const elBtnKonfirmasiDuplikatProduk = document.getElementById('btnKonfirmasiDuplikatProduk');

    const elOverlayFormProduk = document.getElementById('overlayFormProduk');
    const elJudulFormProduk = document.getElementById('judulFormProduk');
    const elBtnTutupFormProduk = document.getElementById('btnTutupFormProduk');
    const elFormProdukKode = document.getElementById('formProdukKode');
    const elFormProdukBarcode = document.getElementById('formProdukBarcode');
    const elFormProdukKategori = document.getElementById('formProdukKategori');
    const elFormProdukNama = document.getElementById('formProdukNama');
    const elFormProdukKeterangan = document.getElementById('formProdukKeterangan');
    const elFormProdukHargaBeli = document.getElementById('formProdukHargaBeli');
    const elFormProdukHargaJual = document.getElementById('formProdukHargaJual');
    const elFormProdukStok = document.getElementById('formProdukStok');
    const elFormProdukIzinkanMinus = document.getElementById('formProdukIzinkanMinus');
    const elFormProdukAktif = document.getElementById('formProdukAktif');
    const elBtnSimpanProduk = document.getElementById('btnSimpanProduk');
    const elBbPilihBahan = document.getElementById('bbPilihBahan');
    const elBbQtyBahan = document.getElementById('bbQtyBahan');
    const elBtnTambahBahan = document.getElementById('btnTambahBahan');
    const elBbDaftarBahan = document.getElementById('bbDaftarBahan');
    const elBbTotalHpp = document.getElementById('bbTotalHpp');
    const elBtnJadikanHpp = document.getElementById('btnJadikanHpp');

    function formatRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function escapeHtmlLokal(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    /** Chart batang horizontal ranked, pola sama persis dgn stokopname-renderer.js (HTML/CSS murni, bukan Chart.js). @param {HTMLElement} container @param {Array<{label:string,nilai:number}>} data */
    /**
     * @param {?(label:string)=>void} [opsi.onKlik] Gap-closure "klik bar utk lihat daftar barangnya"
     * -- listener dipasang lewat closure atas array `data` (BUKAN menaruh label di atribut HTML lalu
     * dibaca ulang) supaya nama kategori/pemasok yang kebetulan memuat tanda kutip TIDAK bisa merusak
     * markup/memicu injeksi atribut (escapeHtmlLokal aman utk TEKS, TIDAK aman utk isi atribut HTML).
     */
    function buatBarHorizontal(container, data, opsi) {
        opsi = opsi || {};
        if (!container) return;
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong" style="padding:12px 0;">Belum ada data.</div>'; return; }
        const maks = Math.max.apply(null, data.map((d) => Number(d.nilai) || 0)) || 1;
        container.innerHTML = data.map((d, i) => {
            const persen = Math.max(2, Math.round(((Number(d.nilai) || 0) / maks) * 100));
            const teksNilai = opsi.formatNilai ? opsi.formatNilai(d.nilai) : String(d.nilai);
            return '<div class="baris-bar' + (opsi.onKlik ? ' baris-bar-klik' : '') + '"><div class="peringkat">' + (i + 1) + '</div>'
                + '<div class="nama">' + escapeHtmlLokal(d.label) + '</div>'
                + '<div class="batang-wrap"><div class="batang" style="width:' + persen + '%;"></div></div>'
                + '<div class="nilai">' + escapeHtmlLokal(teksNilai) + '</div></div>';
        }).join('');
        if (opsi.onKlik) {
            container.querySelectorAll('.baris-bar-klik').forEach((el, i) => {
                el.addEventListener('click', () => opsi.onKlik(data[i].label));
            });
        }
    }

    function formatWaktuCache(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    async function muatRingkasanCacheProduk() {
        try {
            const r = await window.electronAPI.posAPI.produk.cacheRingkasan();
            if (!r.ok || !r.data) return;
            const waktu = formatWaktuCache(r.data.disinkronPada);
            elInfoCacheProduk.textContent = r.data.total > 0
                ? ('\u{1F4E6} ' + r.data.total + ' produk tersimpan di cache lokal (dipakai saat offline)' + (waktu ? ' -- terakhir disinkron ' + waktu : '.'))
                : '\u{1F4E6} Belum ada cache lokal -- klik "Sinkronkan" untuk menyimpan salinan katalog offline.';
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }

    elBtnSinkronProdukCache.addEventListener('click', async () => {
        elBtnSinkronProdukCache.disabled = true;
        const teksAsli = elBtnSinkronProdukCache.innerHTML;
        elBtnSinkronProdukCache.innerHTML = '&#8987; Menyinkronkan...';
        try {
            const r = await window.electronAPI.posAPI.produk.sinkronManual();
            if (r.ok) {
                tampilkanToast('success', 'Cache lokal diperbarui -- ' + r.total + ' produk tersimpan.');
                muatRingkasanCacheProduk();
            } else {
                tampilkanToast('error', r.pesan || 'Gagal menyinkronkan cache lokal.');
            }
        } catch (e) {
            tampilkanToast('error', 'Gagal menyinkronkan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSinkronProdukCache.disabled = false;
            elBtnSinkronProdukCache.innerHTML = teksAsli;
        }
    });

    async function muatStatistikProduk() {
        try {
            const r = await window.electronAPI.posAPI.produk.statistik();
            if (!r.ok || !r.data) return;
            const d = r.data;
            document.getElementById('kpiTotalProduk').textContent = String(d.totalProduk || 0);
            document.getElementById('kpiProdukAktif').textContent = String(d.totalAktif || 0);
            document.getElementById('kpiProdukNonaktif').textContent = String(d.totalNonaktif || 0);
            document.getElementById('kpiStokHabis').textContent = String(d.stokHabis || 0);
            document.getElementById('kpiStokRendah').textContent = String(d.stokRendah || 0);
            document.getElementById('kpiNilaiStok').textContent = formatRupiah(d.totalNilaiStok || 0);
            const petaBar = (arr) => (arr || []).map((x) => ({ label: x.label, nilai: x.jumlah }));
            buatBarHorizontal(document.getElementById('barKategoriProduk'), petaBar(d.byKategori), { formatNilai: (n) => n + ' produk', onKlik: (label) => bukaStatDetail('kategori', label, 'Kategori: ' + label) });
            buatBarHorizontal(document.getElementById('barPemasokProduk'), petaBar(d.byPemasok), { formatNilai: (n) => n + ' produk', onKlik: (label) => bukaStatDetail('pemasok', label, 'Pemasok: ' + label) });
            buatBarHorizontal(document.getElementById('barHargaProduk'), petaBar(d.byHarga), { formatNilai: (n) => n + ' produk', onKlik: (label) => bukaStatDetail('harga', label, 'Harga Jual: ' + label) });
            buatBarHorizontal(document.getElementById('barStokProduk'), petaBar(d.byStok), { formatNilai: (n) => n + ' produk', onKlik: (label) => bukaStatDetail('stok', label, 'Jumlah Stok: ' + label) });
        } catch (e) { /* dasbor statistik gagal muat bukan blocker -- katalog produk tetap tampil normal */ }
    }

    // ==== Popup "klik kartu/bar statistik" -- daftar produk yg cocok (lihat JavaDoc server produkStatistikDetail) ====

    const elOverlayStatDetail = document.getElementById('overlayStatDetail');
    const elJudulStatDetail = document.getElementById('judulStatDetail');
    const elRingkasStatDetail = document.getElementById('ringkasStatDetail');
    const elCariStatDetail = document.getElementById('cariStatDetail');
    const elTbodyStatDetail = document.getElementById('tbodyStatDetail');
    const elPaginasiStatDetail = document.getElementById('paginasiStatDetail');
    const elBtnTutupStatDetail = document.getElementById('btnTutupStatDetail');
    const elBtnStatDetailSebelumnya = document.getElementById('btnStatDetailSebelumnya');
    const elBtnStatDetailBerikutnya = document.getElementById('btnStatDetailBerikutnya');

    let statDetailSemua = [];
    const statDetailState = { page: 1, pageSize: 20 };

    function renderStatDetailTabel() {
        const kw = elCariStatDetail.value.trim().toLowerCase();
        const tampil = kw
            ? statDetailSemua.filter((p) => (p.kode || '').toLowerCase().indexOf(kw) >= 0
                || (p.nama || '').toLowerCase().indexOf(kw) >= 0
                || (p.barcode || '').toLowerCase().indexOf(kw) >= 0)
            : statDetailSemua;
        const totalHal = Math.max(1, Math.ceil(tampil.length / statDetailState.pageSize));
        if (statDetailState.page > totalHal) statDetailState.page = totalHal;
        const awal = (statDetailState.page - 1) * statDetailState.pageSize;
        const halamanIni = tampil.slice(awal, awal + statDetailState.pageSize);
        elTbodyStatDetail.innerHTML = halamanIni.map((p) => {
            const stokBadge = p.stok <= 0 ? '<span class="badge merah">Habis</span>'
                : (p.stok <= 5 ? '<span class="badge kuning">' + p.stok + '</span>' : p.stok);
            return '<tr>'
                + '<td style="font-weight:700;">' + escapeHtmlLokal(p.kode) + '</td>'
                + '<td>' + (p.barcode ? escapeHtmlLokal(p.barcode) : '<span class="badge abu">-</span>') + '</td>'
                + '<td>' + escapeHtmlLokal(p.nama) + '</td>'
                + '<td>' + escapeHtmlLokal(p.kategoriNama || 'Tanpa Kategori') + '</td>'
                + '<td>' + escapeHtmlLokal(p.pemasokNama || 'Tanpa Pemasok') + '</td>'
                + '<td>' + formatRupiah(p.hargaJual) + '</td>'
                + '<td>' + stokBadge + '</td>'
                + '<td>' + (p.aktif === false ? '<span class="badge abu">Non-Aktif</span>' : '<span class="badge hijau">Aktif</span>') + '</td>'
                + '</tr>';
        }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px 0;">Tidak ada produk yang cocok.</td></tr>';
        elPaginasiStatDetail.textContent = 'Halaman ' + statDetailState.page + ' dari ' + totalHal + ' (' + tampil.length + (kw ? ' dari ' + statDetailSemua.length : '') + ' produk)';
        elBtnStatDetailSebelumnya.disabled = statDetailState.page <= 1;
        elBtnStatDetailBerikutnya.disabled = statDetailState.page >= totalHal;
    }

    async function bukaStatDetail(tipe, nilai, judul) {
        elJudulStatDetail.textContent = judul;
        elRingkasStatDetail.textContent = 'Memuat...';
        elTbodyStatDetail.innerHTML = '';
        elCariStatDetail.value = '';
        statDetailState.page = 1;
        elOverlayStatDetail.className = 'overlay tampil';
        try {
            const r = await window.electronAPI.posAPI.produk.statistikDetail({ tipe: tipe, nilai: nilai || '' });
            if (!r.ok) {
                elRingkasStatDetail.textContent = '';
                window.PesanDetail.tampilkanDariHasil(r);
                elOverlayStatDetail.className = 'overlay';
                return;
            }
            statDetailSemua = (r.data && r.data.produk) || [];
            elRingkasStatDetail.textContent = statDetailSemua.length + ' produk cocok.';
            renderStatDetailTabel();
        } catch (e) {
            elRingkasStatDetail.textContent = '';
            tampilkanToast('error', 'Gagal memuat detail: ' + (e && e.message ? e.message : e));
            elOverlayStatDetail.className = 'overlay';
        }
    }

    document.querySelectorAll('.kartu-kpi.kpi-klik').forEach((el) => {
        el.addEventListener('click', () => {
            const tipe = el.getAttribute('data-tipe');
            const judulLabel = el.querySelector('.label') ? el.querySelector('.label').textContent : tipe;
            bukaStatDetail(tipe, '', judulLabel);
        });
    });
    elBtnTutupStatDetail.addEventListener('click', () => { elOverlayStatDetail.className = 'overlay'; });
    elOverlayStatDetail.addEventListener('click', (e) => { if (e.target === elOverlayStatDetail) elOverlayStatDetail.className = 'overlay'; });
    elCariStatDetail.addEventListener('input', () => { statDetailState.page = 1; renderStatDetailTabel(); });
    elBtnStatDetailSebelumnya.addEventListener('click', () => { if (statDetailState.page > 1) { statDetailState.page--; renderStatDetailTabel(); } });
    elBtnStatDetailBerikutnya.addEventListener('click', () => { statDetailState.page++; renderStatDetailTabel(); });
    /** Sama alasan dgn helper senama di pos-renderer.js -- hindari `type="number"` diam-diam menolak keystroke di sebagian lingkungan Windows. */
    function jadikanInputAngka(el) {
        el.addEventListener('input', () => {
            const bersih = el.value.replace(/[^0-9]/g, '');
            if (bersih !== el.value) el.value = bersih;
        });
    }
    [elFormProdukHargaBeli, elFormProdukHargaJual, elFormProdukStok].forEach(jadikanInputAngka);

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
    let tokoNamaSaatIni = '';
    const bolehAksiMenu = (kunci, aksi) => {
        if (isAdminAkun || supervisorPedagang) return true;
        const crud = aksesMenuCrud && aksesMenuCrud[kunci];
        if (!crud) return false;
        if (crud.supervisor === true) return true;
        return crud[aksi] !== false;
    };
    const bolehKelolaProduk = () => bolehAksiMenu('produk', 'update') || bolehAksiMenu('produk', 'create');

    // Dipakai segarkanStatus (poll 30 detik) supaya TIDAK menggambar ulang tabel produk (elIsiHalaman.
    // innerHTML=... di renderIsiHalaman -- lihat catatan di sana) pada SETIAP polling, hanya saat izin
    // kelola BENAR-BENAR berubah -- gap-closure keluhan "halaman berkedip-kedip" (Toko Al-Bahjah):
    // sebelumnya renderIsiHalaman() dipanggil TANPA SYARAT tiap 30 detik walau tak ada apa pun yg
    // berubah, menghancurkan+membangun ulang seluruh tabel (bisa ratusan baris) berulang-ulang.
    let kelolaProdukSebelumnya = null;

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
                tokoNamaSaatIni = cfg.data.tokoNama || '';
                isAdminAkun = !!cfg.data.isAdmin;
                supervisorPedagang = !!cfg.data.supervisorPedagang;
                aksesMenuCrud = cfg.data.aksesMenuCrud || {};
                const kelolaSekarang = bolehKelolaProduk();
                elBtnTambahProduk.style.display = kelolaSekarang ? 'inline-flex' : 'none';
                elBtnHitungUlangStok.style.display = kelolaSekarang ? 'inline-flex' : 'none';
                elBtnUnduhExcelProduk.style.display = kelolaSekarang ? 'inline-flex' : 'none';
                elBtnUnggahExcelProduk.style.display = kelolaSekarang ? 'inline-flex' : 'none';
                if (elBtnHapusNonaktifTakTerpakai) elBtnHapusNonaktifTakTerpakai.style.display = kelolaSekarang ? 'inline-flex' : 'none';
                if (elPanelBersihkanDuplikat) elPanelBersihkanDuplikat.style.display = kelolaSekarang ? 'block' : 'none';
                if (kelolaSekarang !== kelolaProdukSebelumnya) {
                    kelolaProdukSebelumnya = kelolaSekarang;
                    renderIsiHalaman();
                }
            }
        } catch (e) { /* abaikan */ }
    }

    // ==== Daftar produk (reuse aksi "katalog" yang sudah dipakai layar Kasir) ====

    let daftarProduk = [];
    let daftarKategori = [];
    let cariTimer = null;
    const stateProduk = { page: 1, pageSize: 20 };

    function renderIsiHalaman() {
        // Filter "Hanya Aktif" murni DI SISI KLIEN (daftarProduk sudah termuat penuh dari aksi
        // katalog) -- default tercentang di HTML, jadi produk Non-Aktif tersembunyi kecuali user
        // sengaja mencentang lepas. Dihitung di sini (bukan saat muatDaftarProduk) supaya
        // centang/lepas checkbox langsung re-filter tanpa perlu fetch ulang ke server.
        const hanyaAktif = !!(elChkHanyaAktifProduk && elChkHanyaAktifProduk.checked);
        let daftarTampil = hanyaAktif ? daftarProduk.filter((p) => p.aktif !== false) : daftarProduk;
        // Filter kata kunci JUGA murni DI SISI KLIEN (pola SAMA dgn "Hanya Aktif" di atas) -- gap-closure
        // "Katalog Barang macet lama saat internet lambat": SEBELUMNYA tiap keystroke memicu fetch baru
        // ke server (lihat elCariProduk.addEventListener di bawah), skarang daftarProduk sudah termuat
        // PENUH sejak awal (cache lokal instan + live di latar belakang, lihat muatDaftarProduk) jadi
        // mencari cukup menyaring array yg sudah ada, tanpa round-trip jaringan sama sekali.
        const kw = (elCariProduk.value || '').trim().toLowerCase();
        if (kw) {
            daftarTampil = daftarTampil.filter((p) =>
                (p.nama || '').toLowerCase().indexOf(kw) >= 0
                || (p.kode || '').toLowerCase().indexOf(kw) >= 0
                || (p.barcode || '').toLowerCase().indexOf(kw) >= 0);
        }
        if (!daftarTampil.length) {
            elIsiHalaman.innerHTML = '<div class="kartu-panel"><div class="daftar-kosong"><span class="ico">&#128230;</span>'
                + (!daftarProduk.length
                    ? (bolehKelolaProduk() ? 'Belum ada produk. Klik "Tambah Produk" untuk mulai.' : 'Belum ada produk di toko ini.')
                    : kw ? 'Tidak ada produk yang cocok dgn kata kunci "' + escapeHtmlLokal(kw) + '".'
                    : 'Tidak ada produk AKTIF yang cocok -- lepas centang "Hanya Aktif" utk melihat produk Non-Aktif juga.') + '</div></div>';
            return;
        }
        const kelola = bolehKelolaProduk();
        const semuaTokoAktif = !!(elChkSemuaTokoProduk && elChkSemuaTokoProduk.checked);
        const totalHal = Math.max(1, Math.ceil(daftarTampil.length / stateProduk.pageSize));
        if (stateProduk.page > totalHal) stateProduk.page = totalHal;
        const awal = (stateProduk.page - 1) * stateProduk.pageSize;
        const halamanIni = daftarTampil.slice(awal, awal + stateProduk.pageSize);
        let html = '<div class="kartu-panel">'
            + (kelola ? '' : '<div class="info-strip" style="margin:-2px -2px 12px;">&#128065; Mode lihat saja -- hanya supervisor toko atau admin/manager yang dapat menambah/mengubah produk.</div>')
            + (semuaTokoAktif ? '<div class="info-strip" style="margin:-2px -2px 12px;background:#fffbeb;color:#92400e;">&#9888;&#65039; Mode "Sertakan Toko Null" aktif -- baris berikut bisa termasuk produk toko == null (BUKAN toko lain).</div>' : '')
            + '<div class="scroll-tabel"><table class="tabel-dasbor"><thead><tr>'
            + '<th>Kode</th><th>Barcode</th><th>Nama</th><th>Kategori</th>' + (semuaTokoAktif ? '<th>Toko</th>' : '') + '<th>Nilai Barang</th><th>Harga Jual</th><th>Stok</th><th>Status</th>' + (kelola ? '<th></th>' : '')
            + '</tr></thead><tbody>';
        halamanIni.forEach((p) => {
            const stokBadge = p.stok <= 0 ? '<span class="badge merah">Habis</span>'
                : (p.stok <= 5 ? '<span class="badge kuning">' + p.stok + '</span>' : p.stok);
            // Nilai Barang = nilai modal baris ini (harga beli x stok) -- basis SAMA dgn KPI "Nilai
            // Stok (modal)" di kartu statistik, supaya angka per-baris & totalnya selalu konsisten.
            const nilaiBarang = (Number(p.hargaBeli) || 0) * (Number(p.stok) || 0);
            html += '<tr>'
                + '<td style="font-weight:700;">' + escapeHtmlLokal(p.kode) + '</td>'
                + '<td>' + (p.barcode ? escapeHtmlLokal(p.barcode) : '<span class="badge abu">-</span>') + '</td>'
                + '<td' + (kelola ? ' style="cursor:pointer;" class="nama-produk" data-id="' + p.id + '"' : '') + '>' + escapeHtmlLokal(p.nama) + '</td>'
                + '<td>' + (p.kategoriNama ? escapeHtmlLokal(p.kategoriNama) : '<span class="badge abu">Tanpa Kategori</span>') + '</td>'
                + (semuaTokoAktif ? ('<td>' + (p.tokoIdProduk == null ? '<span class="badge kuning">Toko Null</span>' : escapeHtmlLokal(p.tokoNamaProduk)) + '</td>') : '')
                + '<td>' + formatRupiah(nilaiBarang) + '</td>'
                + '<td>' + formatRupiah(p.hargaJual) + '</td>'
                + '<td>' + stokBadge + '</td>'
                + '<td>' + (p.aktif === false ? '<span class="badge abu">Non-Aktif</span>' : '<span class="badge hijau">Aktif</span>') + '</td>'
                + (kelola ? '<td><button type="button" class="btn-kecil ubah-produk" data-id="' + p.id + '">Ubah</button></td>' : '')
                + '</tr>';
        });
        html += '</tbody></table></div>'
            + '<div class="paginasi">'
            + '<span>Halaman ' + stateProduk.page + ' dari ' + totalHal + ' (' + daftarTampil.length + ' produk'
            + (hanyaAktif && daftarTampil.length !== daftarProduk.length ? ', ' + (daftarProduk.length - daftarTampil.length) + ' Non-Aktif disembunyikan' : '') + ')</span>'
            + '<div class="tombol-hal">'
            + '<button type="button" class="btn-kecil" id="btnProdukHalSebelumnya"' + (stateProduk.page <= 1 ? ' disabled' : '') + '>&#8249; Sebelumnya</button>'
            + '<button type="button" class="btn-kecil" id="btnProdukHalBerikutnya"' + (stateProduk.page >= totalHal ? ' disabled' : '') + '>Berikutnya &#8250;</button>'
            + '</div></div></div>';
        elIsiHalaman.innerHTML = html;
        if (kelola) {
            elIsiHalaman.querySelectorAll('.ubah-produk, .nama-produk').forEach((el) => {
                el.addEventListener('click', () => bukaFormUbah(daftarProduk.find((p) => String(p.id) === el.getAttribute('data-id'))));
            });
        }
        const elSebelumnya = document.getElementById('btnProdukHalSebelumnya');
        const elBerikutnya = document.getElementById('btnProdukHalBerikutnya');
        if (elSebelumnya) elSebelumnya.addEventListener('click', () => { if (stateProduk.page > 1) { stateProduk.page--; renderIsiHalaman(); } });
        if (elBerikutnya) elBerikutnya.addEventListener('click', () => { if (stateProduk.page < totalHal) { stateProduk.page++; renderIsiHalaman(); } });
    }

    function isiDropdownKategori() {
        elFormProdukKategori.innerHTML = '<option value="">-- Tanpa Kategori --</option>';
        daftarKategori.forEach((k) => {
            const opt = document.createElement('option');
            opt.value = k.id; opt.textContent = k.nama;
            elFormProdukKategori.appendChild(opt);
        });
    }

    /** Sudah pernah tampil sekali sesi ini (cache lokal ATAU live) -- lihat JavaDoc muatDaftarProduk. */
    let katalogDimuatSekaliDariCache = false;

    /**
     * Ambil katalog LIVE dari server + render -- selalu dipanggil (baik sesudah cache-first paint
     * MAUPUN langsung bila tidak ada cache) supaya data yg ditampilkan tetap dijamin sinkron dgn
     * server. Overlay blocking penuh HANYA ditampilkan kalau BELUM ada apa pun di layar sama sekali
     * (baris pertama sesi ini) ATAU mode "Semua Toko" (tidak py cache lintas-toko) -- di luar itu
     * (mis. refresh diam2 pasca simpan/hapus, atau live-refresh susulan sesudah cache-first paint)
     * dibiarkan berjalan DI LATAR BELAKANG tanpa mengunci layar, kasir/admin tetap bisa lihat data
     * (sedikit basi sesaat) sambil menunggu.
     */
    async function muatDaftarProdukLive(semuaToko) {
        const perluOverlay = !katalogDimuatSekaliDariCache || semuaToko;
        if (perluOverlay) elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.katalog({ semuaToko: semuaToko });
            if (!r.ok) {
                if (perluOverlay) {
                    window.PesanDetail.tampilkanDariHasil(r);
                    daftarProduk = []; daftarKategori = [];
                    renderIsiHalaman();
                } else {
                    tampilkanToast('error', 'Gagal memperbarui katalog dari server -- masih menampilkan data cache lokal terakhir.');
                }
                return;
            }
            // Katalog TERSARING per kategori aktif yg dipilih kasir di layar Kasir tidak relevan di sini
            // -- data mentah r.data.produk/r.data.kategori SUDAH mencakup seluruh produk toko ini.
            daftarProduk = r.data.produk || [];
            daftarKategori = r.data.kategori || [];
            katalogDimuatSekaliDariCache = true;
            stateProduk.page = 1;
            isiDropdownKategori();
            renderIsiHalaman();
            if (!semuaToko) muatRingkasanCacheProduk(); // cache lokal ikut disegarkan server-side, lihat main.js pos:katalog
        } catch (e) {
            if (perluOverlay) tampilkanToast('error', 'Gagal memuat katalog: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    /**
     * Muat daftar produk -- gap-closure "Memuat katalog barang... macet lama saat internet lambat"
     * (layar ini SEBELUMNYA selalu menunggu server, bisa sampai 15 detik, sebelum menampilkan APA PUN).
     * Kalau bukan mode "Semua Toko" (yg tidak py cache lintas-toko), cache lokal ({@code produk_cache},
     * sudah ada dari sinkron berkala/manual/live sebelumnya) ditampilkan SEKETIKA lebih dulu (murni baca
     * SQLite, nyaris instan) SEBELUM live dicoba -- kasir/admin tidak pernah lagi menatap layar kosong
     * menunggu jaringan utk MELIHAT data yg sebenarnya sudah ada. Live TETAP selalu dicoba sesudahnya
     * (lihat muatDaftarProdukLive) supaya data yg ditampilkan tetap terjamin sinkron server.
     */
    async function muatDaftarProduk() {
        const semuaToko = !!(elChkSemuaTokoProduk && elChkSemuaTokoProduk.checked);
        if (!semuaToko && !katalogDimuatSekaliDariCache) {
            try {
                const rCache = await window.electronAPI.posAPI.produk.cacheSemua();
                if (rCache.ok && rCache.data && rCache.data.produk.length > 0) {
                    daftarProduk = rCache.data.produk;
                    daftarKategori = rCache.data.kategori;
                    isiDropdownKategori();
                    renderIsiHalaman();
                }
            } catch (eCache) { /* cache belum ada/rusak -- lanjut ke live spt biasa, overlay tetap tampil */ }
        }
        await muatDaftarProdukLive(semuaToko);
    }

    elCariProduk.addEventListener('input', () => {
        clearTimeout(cariTimer);
        // Filter kata kunci MURNI DI KLIEN (lihat renderIsiHalaman) -- daftarProduk sudah termuat penuh
        // (cache lokal/live) sejak layar dibuka, jadi tidak perlu round-trip server per keystroke lagi.
        cariTimer = setTimeout(() => { stateProduk.page = 1; renderIsiHalaman(); }, 200);
    });
    if (elChkSemuaTokoProduk) {
        elChkSemuaTokoProduk.addEventListener('change', () => {
            stateProduk.page = 1;
            muatDaftarProduk();
        });
    }
    if (elChkHanyaAktifProduk) {
        // Murni filter klien (lihat renderIsiHalaman) -- TIDAK perlu muatDaftarProduk (fetch ulang ke
        // server), cukup render ulang dari daftarProduk yg sudah ada di memori.
        elChkHanyaAktifProduk.addEventListener('change', () => {
            stateProduk.page = 1;
            renderIsiHalaman();
        });
    }

    // ==== Bersihkan Produk Duplikat (gap-closure, supervisor/admin saja -- gerbang server juga) ====

    const NAMA_JENIS_DUPLIKAT = { kode: 'Kode', barcode: 'Barcode', nama: 'Nama Produk', kode_barcode: 'Kode + Barcode', kode_barcode_nama: 'Kode + Barcode + Nama' };
    let jenisDuplikatAktif = null;
    let grupDuplikatAktif = [];

    function tutupModalDuplikat() {
        elOverlayDuplikatProduk.className = 'overlay';
        jenisDuplikatAktif = null;
        grupDuplikatAktif = [];
    }
    elBtnTutupDuplikatProduk.addEventListener('click', tutupModalDuplikat);
    elBtnBatalDuplikatProduk.addEventListener('click', tutupModalDuplikat);
    elOverlayDuplikatProduk.addEventListener('click', (e) => { if (e.target === elOverlayDuplikatProduk) tutupModalDuplikat(); });

    function renderModalDuplikat() {
        if (grupDuplikatAktif.length === 0) {
            elRingkasDuplikatProduk.innerHTML = '<span style="color:var(--success);font-weight:700;">&#10003; Tidak ada produk duplikat ditemukan berdasarkan ' + NAMA_JENIS_DUPLIKAT[jenisDuplikatAktif] + ' di toko ini.</span>';
            elDaftarGrupDuplikat.innerHTML = '';
            elBtnKonfirmasiDuplikatProduk.style.display = 'none';
            return;
        }
        let totalItem = 0;
        grupDuplikatAktif.forEach((g) => { totalItem += g.items.length; });
        elRingkasDuplikatProduk.innerHTML = '<b>' + grupDuplikatAktif.length + ' grup</b> duplikat ditemukan (' + totalItem + ' baris produk terlibat). '
            + 'Baris yang sudah punya transaksi selalu diprioritaskan sbg penyintas (id terkecil di antaranya); bila tak satu pun punya transaksi, id terkecil yang menang.';
        elBtnKonfirmasiDuplikatProduk.style.display = 'inline-block';
        let html = '';
        grupDuplikatAktif.forEach((g) => {
            const idsSort = g.items.map((it) => it.id).slice().sort((a, b) => a - b);
            const idsPunyaTrx = g.items.filter((it) => it.jumlahTransaksi > 0).map((it) => it.id).sort((a, b) => a - b);
            const survivorId = idsPunyaTrx.length > 0 ? idsPunyaTrx[0] : idsSort[0];
            html += '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
                + '<div style="font-size:11px;font-weight:800;color:var(--muted);margin-bottom:6px;">Kunci: ' + escapeHtmlLokal(g.kunci) + '</div>'
                + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
                + '<thead><tr style="text-align:left;color:var(--muted);"><th style="padding:3px 6px;">ID</th><th style="padding:3px 6px;">Kode</th><th style="padding:3px 6px;">Nama</th><th style="padding:3px 6px;text-align:right;">Transaksi</th><th style="padding:3px 6px;"></th></tr></thead><tbody>'
                + g.items.map((it) => '<tr style="' + (it.id === survivorId ? 'background:var(--success-50);' : '') + '">'
                    + '<td style="padding:3px 6px;">' + it.id + '</td>'
                    + '<td style="padding:3px 6px;">' + escapeHtmlLokal(it.kode) + '</td>'
                    + '<td style="padding:3px 6px;">' + escapeHtmlLokal(it.nama) + '</td>'
                    + '<td style="padding:3px 6px;text-align:right;">' + it.jumlahTransaksi + '</td>'
                    + '<td style="padding:3px 6px;font-weight:800;">' + (it.id === survivorId ? '<span style="color:var(--success);">Disimpan</span>' : '<span style="color:var(--danger);">Dihapus</span>') + '</td>'
                    + '</tr>').join('')
                + '</tbody></table></div>';
        });
        elDaftarGrupDuplikat.innerHTML = html;
    }

    async function bukaModalDuplikat(jenis) {
        jenisDuplikatAktif = jenis;
        elJudulDuplikatProduk.textContent = 'Pratinjau Duplikat: ' + NAMA_JENIS_DUPLIKAT[jenis];
        elRingkasDuplikatProduk.innerHTML = 'Memuat...';
        elDaftarGrupDuplikat.innerHTML = '';
        elBtnKonfirmasiDuplikatProduk.style.display = 'none';
        elOverlayDuplikatProduk.className = 'overlay tampil';
        try {
            const r = await window.electronAPI.posAPI.produk.duplikatCari({ jenis: jenis });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); tutupModalDuplikat(); return; }
            grupDuplikatAktif = r.data.grup || [];
            renderModalDuplikat();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat pratinjau duplikat: ' + (e && e.message ? e.message : e));
            tutupModalDuplikat();
        }
    }

    document.getElementById('btnDuplikatKode').addEventListener('click', () => bukaModalDuplikat('kode'));
    document.getElementById('btnDuplikatBarcode').addEventListener('click', () => bukaModalDuplikat('barcode'));
    document.getElementById('btnDuplikatNama').addEventListener('click', () => bukaModalDuplikat('nama'));
    document.getElementById('btnDuplikatKodeBarcode').addEventListener('click', () => bukaModalDuplikat('kode_barcode'));
    document.getElementById('btnDuplikatKodeBarcodeNama').addEventListener('click', () => bukaModalDuplikat('kode_barcode_nama'));

    elBtnKonfirmasiDuplikatProduk.addEventListener('click', async () => {
        if (!jenisDuplikatAktif) return;
        let totalItem = 0;
        grupDuplikatAktif.forEach((g) => { totalItem += g.items.length; });
        const jumlahAkanDihapus = totalItem - grupDuplikatAktif.length;
        if (!confirm('Yakin hapus ' + jumlahAkanDihapus + ' baris produk duplikat (berdasarkan ' + NAMA_JENIS_DUPLIKAT[jenisDuplikatAktif] + ')? Transaksi pada baris yang dihapus akan digabungkan ke baris yang disimpan. Tindakan ini TIDAK BISA dibatalkan.')) return;
        elBtnKonfirmasiDuplikatProduk.disabled = true;
        const teksAsli = elBtnKonfirmasiDuplikatProduk.textContent;
        elBtnKonfirmasiDuplikatProduk.textContent = 'Memproses...';
        try {
            const r = await window.electronAPI.posAPI.produk.duplikatHapus({ jenis: jenisDuplikatAktif });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            tampilkanToast('success', r.data.produkDihapus + ' baris duplikat dihapus (' + r.data.grupDigabungTransaksi + ' grup transaksinya digabungkan).');
            tutupModalDuplikat();
            muatDaftarProduk(elCariProduk.value.trim());
        } catch (e) {
            tampilkanToast('error', 'Gagal membersihkan duplikat: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnKonfirmasiDuplikatProduk.disabled = false;
            elBtnKonfirmasiDuplikatProduk.textContent = teksAsli;
        }
    });

    // ==== Form tambah/ubah ====

    let idSedangDiubah = null;

    // ---- Bahan Baku (Resep) & HPP otomatis (gap-closure -- padanan JSP barang/index.jsp) ----
    // Pola SAMA PERSIS dgn JSP: dropdown polos berisi SEMUA produk toko ini (bukan autocomplete,
    // bukan dibatasi "tipe bahan baku" -- tidak ada flag begitu di entitas Produk, SEMUA produk bisa
    // jadi bahan produk lain), qty diisi manual, "harga" tiap baris resep DIBEKUKAN (snapshot
    // hargaBeli bahan SAAT ditambahkan -- bukan live-join), HPP dihitung 100% di klien (Σ qty x
    // harga beku), dan field Harga Beli akan SELALU ditimpa server oleh total HPP ini saat disimpan
    // bila resep tidak kosong (lihat JavaDoc server KantinHelper.produkSimpan) -- tombol "Jadikan
    // Harga Modal" di sini murni kenyamanan visual (memperlihatkan angka itu SEBELUM disimpan),
    // BUKAN satu-satunya cara nilai itu benar-benar dipakai.
    let bahanBakuList = [];

    function isiPilihanBahan(kecualiId) {
        elBbPilihBahan.innerHTML = '<option value="">-- Pilih produk sbg bahan --</option>';
        daftarProduk.forEach((p) => {
            if (kecualiId != null && String(p.id) === String(kecualiId)) return;
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.nama + ' (' + formatRupiah(p.hargaBeli) + ')';
            opt.dataset.nama = p.nama;
            opt.dataset.harga = String(Number(p.hargaBeli) || 0);
            elBbPilihBahan.appendChild(opt);
        });
    }

    function hitungTotalHpp() {
        return bahanBakuList.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0);
    }

    function renderDaftarBahan() {
        if (bahanBakuList.length === 0) {
            elBbDaftarBahan.innerHTML = '<div style="font-size:11.5px;color:var(--faint);padding:6px 0;">Belum ada bahan baku ditambahkan.</div>';
        } else {
            elBbDaftarBahan.innerHTML = bahanBakuList.map((it, i) => (
                '<div class="baris-bahan" data-idx="' + i + '"><span class="nama">' + escapeHtmlLokal(it.nama) + '</span>'
                + '<span class="qty">x ' + it.qty + '</span><span class="subtotal">' + formatRupiah((Number(it.qty) || 0) * (Number(it.harga) || 0)) + '</span>'
                + '<button type="button" class="btn-hapus-bahan" data-idx="' + i + '" title="Hapus">&#10005;</button></div>'
            )).join('');
            elBbDaftarBahan.querySelectorAll('.btn-hapus-bahan').forEach((btn) => {
                btn.addEventListener('click', () => {
                    bahanBakuList.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
                    renderDaftarBahan();
                });
            });
        }
        elBbTotalHpp.textContent = formatRupiah(hitungTotalHpp());
    }

    elBtnTambahBahan.addEventListener('click', () => {
        const opt = elBbPilihBahan.selectedOptions[0];
        if (!opt || !opt.value) { tampilkanToast('error', 'Pilih produk bahan baku terlebih dahulu.'); return; }
        const qty = parseFloat(elBbQtyBahan.value.replace(',', '.'));
        if (!qty || qty <= 0) { tampilkanToast('error', 'Isi qty bahan baku (angka lebih dari 0).'); elBbQtyBahan.focus(); return; }
        const produkId = Number(opt.value);
        const existing = bahanBakuList.filter((it) => it.produk === produkId)[0];
        if (existing) {
            existing.qty = (Number(existing.qty) || 0) + qty;
        } else {
            bahanBakuList.push({ produk: produkId, nama: opt.dataset.nama, qty: qty, harga: Number(opt.dataset.harga) || 0 });
        }
        elBbQtyBahan.value = '';
        elBbPilihBahan.value = '';
        renderDaftarBahan();
    });

    elBtnJadikanHpp.addEventListener('click', () => {
        elFormProdukHargaBeli.value = String(Math.round(hitungTotalHpp()));
        tampilkanToast('success', 'Harga Beli diisi dari total HPP -- ' + formatRupiah(hitungTotalHpp()) + '.');
    });

    function resetForm() {
        elFormProdukKode.value = '';
        elFormProdukBarcode.value = '';
        elFormProdukKategori.value = '';
        elFormProdukNama.value = '';
        elFormProdukKeterangan.value = '';
        elFormProdukHargaBeli.value = '0';
        elFormProdukHargaJual.value = '0';
        elFormProdukStok.value = '0';
        elFormProdukIzinkanMinus.checked = false;
        elFormProdukAktif.checked = true;
        bahanBakuList = [];
        renderDaftarBahan();
    }

    function bukaFormTambah() {
        idSedangDiubah = null;
        elJudulFormProduk.textContent = 'Tambah Produk';
        resetForm();
        isiPilihanBahan(null);
        elOverlayFormProduk.className = 'overlay tampil';
        elFormProdukKode.focus();
    }

    function bukaFormUbah(p) {
        if (!p) return;
        idSedangDiubah = p.id;
        elJudulFormProduk.textContent = 'Ubah Produk: ' + p.nama;
        resetForm();
        elFormProdukKode.value = p.kode || '';
        elFormProdukBarcode.value = p.barcode || '';
        elFormProdukKategori.value = p.kategoriId != null ? String(p.kategoriId) : '';
        elFormProdukNama.value = p.nama || '';
        elFormProdukKeterangan.value = p.keterangan || '';
        elFormProdukHargaBeli.value = String(Math.round(Number(p.hargaBeli) || 0));
        elFormProdukHargaJual.value = String(Math.round(Number(p.hargaJual) || 0));
        elFormProdukStok.value = String(Math.round(Number(p.stok) || 0));
        // Bug lama: field ini tidak pernah diisi ulang dari data server, jadi resetForm() di atas
        // (yang default-nya false) diam-diam TERPAKAI sebagai nilai simpan setiap kali produk diedit --
        // pengaturan "boleh dijual walau stok minus" yang sudah diaktifkan admin jadi mati sendiri tanpa
        // disadari (sama persis dengan bug yang sudah diperbaiki di app Android). Field
        // izinkanJualMinusStok baru dikirim server mulai perbaikan ini (lihat PosApi.java prosesKatalog).
        elFormProdukIzinkanMinus.checked = p.izinkanJualMinusStok === true;
        elFormProdukAktif.checked = p.aktif !== false;
        isiPilihanBahan(p.id);
        bahanBakuList = Array.isArray(p.bahanBaku) ? p.bahanBaku.map((it) => ({ produk: it.produk, nama: it.nama, qty: it.qty, harga: it.harga })) : [];
        renderDaftarBahan();
        elOverlayFormProduk.className = 'overlay tampil';
        elFormProdukKode.focus();
    }

    elBtnTambahProduk.addEventListener('click', () => { if (bolehKelolaProduk()) bukaFormTambah(); });
    elBtnTutupFormProduk.addEventListener('click', () => { elOverlayFormProduk.className = 'overlay'; });

    // ==== Hitung Ulang Stok (pemulihan mandiri, khusus supervisor) ====

    /**
     * Rekalkulasi stok SEMUA produk toko dari rekam jejak pengadaan/opname/penjualan/pemakaian
     * bahan baku (lihat JavaDoc server KantinHelper.stokHitungUlang) -- SEKALIGUS memperbaiki kolom
     * StokOpname.selisih lama yg kadung salah tersimpan (bug computed-getter, sudah diperbaiki di
     * jalur penulisan baru tapi data lama perlu diperbaiki satu kali). Dipakai kalau kolom Stok di
     * layar ini terlihat tidak akurat (mis. "Habis" padahal baru saja diisi lewat Stok Opname/Unggah
     * Excel).
     */
    elBtnHitungUlangStok.addEventListener('click', async () => {
        if (!bolehKelolaProduk()) return;
        if (!confirm('Hitung ulang stok SEMUA produk di toko ini dari rekam jejak pengadaan, stok opname, penjualan, dan pemakaian bahan baku?\n\nProses ini aman dijalankan kapan saja dan tidak mengubah data lain selain kolom Stok.')) return;

        elBtnHitungUlangStok.disabled = true;
        const labelAsli = elBtnHitungUlangStok.innerHTML;
        elBtnHitungUlangStok.textContent = 'Menghitung...';
        try {
            const r = await window.electronAPI.posAPI.produk.hitungUlangStok();
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            const d = r.data || {};
            tampilkanToast('success',
                'Selesai: ' + (d.produkDiproses || 0) + ' produk dihitung ulang'
                + (d.selisihDiperbaiki ? ' (' + d.selisihDiperbaiki + ' riwayat opname lama diperbaiki)' : '') + '.');
            muatDaftarProduk(elCariProduk.value.trim());
        } catch (e) {
            tampilkanToast('error', 'Gagal menghitung ulang stok: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnHitungUlangStok.disabled = false;
            elBtnHitungUlangStok.innerHTML = labelAsli;
        }
    });

    // ==== Hapus Non-Aktif Tak Terpakai (gap-closure, supervisor/admin saja -- gerbang server juga) ====

    if (elBtnHapusNonaktifTakTerpakai) {
        elBtnHapusNonaktifTakTerpakai.addEventListener('click', async () => {
            if (!bolehKelolaProduk()) return;
            if (!confirm(
                'Hapus PERMANEN seluruh produk Non-Aktif toko ini yang TIDAK PERNAH dipakai di transaksi, pengadaan, stok opname, atau resep bahan baku apa pun?\n\n'
                + 'Produk Non-Aktif yang PERNAH dipakai (ada di riwayat lama) TIDAK akan ikut terhapus -- akan dipertahankan otomatis & dilaporkan terpisah.\n\n'
                + 'Tindakan ini TIDAK BISA dibatalkan.'
            )) return;
            elBtnHapusNonaktifTakTerpakai.disabled = true;
            const labelAsli = elBtnHapusNonaktifTakTerpakai.innerHTML;
            elBtnHapusNonaktifTakTerpakai.textContent = 'Menghapus...';
            try {
                const r = await window.electronAPI.posAPI.produk.hapusNonaktifTakTerpakai();
                if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
                const d = r.data || {};
                tampilkanToast('success',
                    (d.dihapus || 0) + ' produk Non-Aktif tak terpakai dihapus permanen'
                    + (d.dipertahankan ? ', ' + d.dipertahankan + ' dipertahankan (masih ada riwayat pemakaian)' : '.'));
                muatDaftarProduk(elCariProduk.value.trim());
                muatStatistikProduk();
            } catch (e) {
                tampilkanToast('error', 'Gagal menghapus produk non-aktif: ' + (e && e.message ? e.message : e));
            } finally {
                elBtnHapusNonaktifTakTerpakai.disabled = false;
                elBtnHapusNonaktifTakTerpakai.innerHTML = labelAsli;
            }
        });
    }

    // ==== Cetak PDF (katalog barang detail, termasuk Satuan/UOM) ====

    elBtnCetakPdfProduk.addEventListener('click', () => {
        // Cetak persis daftar yg SEDANG tampil di layar (hormati filter "Hanya Aktif" & kata kunci
        // cari yg aktif saat ini) -- pola window.open+print SAMA PERSIS dgn elBtnReviewCetakPdf di
        // layar Tinjau Impor, supaya dua fitur cetak PDF di aplikasi ini konsisten perilakunya.
        const hanyaAktif = !!(elChkHanyaAktifProduk && elChkHanyaAktifProduk.checked);
        const daftarCetak = hanyaAktif ? daftarProduk.filter((p) => p.aktif !== false) : daftarProduk;
        if (!daftarCetak.length) { tampilkanToast('error', 'Tidak ada produk untuk dicetak.'); return; }
        const baris = daftarCetak.map((p, i) => {
            const nilaiBarang = (Number(p.hargaBeli) || 0) * (Number(p.stok) || 0);
            return '<tr>'
                + '<td>' + (i + 1) + '</td><td>' + escapeHtmlLokal(p.kode) + '</td><td>' + escapeHtmlLokal(p.barcode || '') + '</td>'
                + '<td>' + escapeHtmlLokal(p.nama) + '</td><td>' + escapeHtmlLokal(p.kategoriNama || '') + '</td>'
                + '<td>' + escapeHtmlLokal(p.satuanNama || '') + '</td><td>' + escapeHtmlLokal(p.pemasokNama || '') + '</td>'
                + '<td class="num">' + (p.stok || 0) + '</td>'
                + '<td class="num">' + formatRupiah(p.hargaJual) + '</td><td class="num">' + formatRupiah(nilaiBarang) + '</td>'
                + '<td>' + (p.aktif === false ? 'Non-Aktif' : 'Aktif') + '</td></tr>';
        }).join('');
        const totalNilai = daftarCetak.reduce((s, p) => s + (Number(p.hargaBeli) || 0) * (Number(p.stok) || 0), 0);
        const html = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Katalog Barang</title><style>'
            + 'body{font-family:Arial,sans-serif;font-size:9px;margin:14px;color:#000;}'
            + 'h2{margin:0 0 4px;font-size:14px;}p{margin:0 0 10px;color:#555;font-size:10px;}'
            + 'table{width:100%;border-collapse:collapse;}th,td{border:1px solid #999;padding:3px 5px;text-align:left;}'
            + 'th{background:#eee;font-size:8.5px;text-transform:uppercase;}td.num,th.num{text-align:right;}'
            + 'tfoot td{font-weight:800;background:#f5f5f5;}'
            + '@media print{body{margin:6px;}}'
            + '</style></head><body>'
            + '<h2>Katalog Barang' + (tokoNamaSaatIni ? ' -- ' + escapeHtmlLokal(tokoNamaSaatIni) : '') + '</h2>'
            + '<p>' + daftarCetak.length + ' produk' + (hanyaAktif ? ' (hanya aktif)' : '') + (elCariProduk.value.trim() ? ', kata kunci: "' + escapeHtmlLokal(elCariProduk.value.trim()) + '"' : '') + ' -- ' + new Date().toLocaleString('id-ID') + '</p>'
            + '<table><thead><tr><th>No</th><th>Kode</th><th>Barcode</th><th>Nama</th><th>Kategori</th><th>Satuan</th><th>Pemasok</th>'
            + '<th class="num">Stok</th><th class="num">Harga Jual</th><th class="num">Nilai Barang</th><th>Status</th></tr></thead>'
            + '<tbody>' + baris + '</tbody>'
            + '<tfoot><tr><td colspan="9"></td><td class="num">' + formatRupiah(totalNilai) + '</td><td></td></tr></tfoot>'
            + '</table></body></html>';
        const w = window.open('', 'katalogProdukCetak', 'width=1000,height=700');
        if (!w) { tampilkanToast('error', 'Popup dicetak diblokir browser. Izinkan popup untuk aplikasi ini lalu coba lagi.'); return; }
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch (e) { /* jendela mungkin sudah ditutup pengguna -- abaikan */ } }, 600);
    });

    // ==== Unduh/Unggah Excel (fitur "download/upload katalog", khusus supervisor) ====

    elBtnUnduhExcelProduk.addEventListener('click', async () => {
        if (!bolehKelolaProduk()) return;
        elBtnUnduhExcelProduk.disabled = true;
        elBtnUnduhExcelProduk.textContent = 'Menyiapkan...';
        try {
            const hanyaAktif = !!(elChkHanyaAktifProduk && elChkHanyaAktifProduk.checked);
            const r = await window.electronAPI.posAPI.produk.eksporExcel({ hanya_aktif: hanyaAktif });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            const simpan = await window.electronAPI.posAPI.produk.simpanExcel({
                fileBase64: r.data.fileBase64,
                namaBerkas: r.data.namaFile || 'katalog-produk.xlsx'
            });
            if (simpan.dibatalkan) return;
            if (!simpan.ok) { tampilkanToast('error', simpan.pesan || 'Gagal menyimpan berkas.'); return; }
            tampilkanToast('success', r.data.total + ' produk diunduh ke ' + simpan.path);
        } catch (e) {
            tampilkanToast('error', 'Gagal mengunduh katalog: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnUnduhExcelProduk.disabled = false;
            elBtnUnduhExcelProduk.innerHTML = '⬇️ <span data-i18n="Unduh Excel">Unduh Excel</span>';
        }
    });

    elBtnUnggahExcelProduk.addEventListener('click', async () => {
        if (!bolehKelolaProduk()) return;
        const dipilih = await window.electronAPI.posAPI.produk.pilihExcel();
        if (dipilih.dibatalkan) return;
        if (!dipilih.ok) { tampilkanToast('error', dipilih.pesan || 'Gagal membaca berkas.'); return; }

        elBtnUnggahExcelProduk.disabled = true;
        elBtnUnggahExcelProduk.textContent = 'Membaca...';
        try {
            const r = await window.electronAPI.posAPI.produk.pratinjauExcel({ file_base64: dipilih.base64 });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            bukaReviewImpor(r.data);
        } catch (e) {
            tampilkanToast('error', 'Gagal membaca katalog: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnUnggahExcelProduk.disabled = false;
            elBtnUnggahExcelProduk.innerHTML = '⬆️ <span data-i18n="Unggah Excel">Unggah Excel</span>';
        }
    });

    // ==== Layar Review Impor Excel -- tinjau/edit sebelum benar-benar disimpan ====

    const elOverlayReviewImpor = document.getElementById('overlayReviewImpor');
    const elReviewSub = document.getElementById('reviewSub');
    const elReviewFooterInfo = document.getElementById('reviewFooterInfo');
    const elReviewTbody = document.getElementById('reviewTbody');
    const elBtnReviewSimpan = document.getElementById('btnReviewSimpan');
    const elBtnReviewBatal = document.getElementById('btnReviewBatal');
    const elChkNonaktifkanTakDitemukan = document.getElementById('chkNonaktifkanTakDitemukan');
    const elReviewSimpanProgressWrap = document.getElementById('reviewSimpanProgressWrap');
    const elReviewSimpanProgressBar = document.getElementById('reviewSimpanProgressBar');
    const elReviewSimpanProgressTeks = document.getElementById('reviewSimpanProgressTeks');
    const elBtnReviewCetakPdf = document.getElementById('btnReviewCetakPdf');
    const elBtnReviewUnduhExcel = document.getElementById('btnReviewUnduhExcel');
    const elDlReviewKategori = document.getElementById('dlReviewKategori');
    const elDlReviewPemasok = document.getElementById('dlReviewPemasok');
    const elDlReviewSatuan = document.getElementById('dlReviewSatuan');

    let reviewRows = [];

    function isiDatalist(el, daftar) {
        el.innerHTML = (daftar || []).map((d) => '<option value="' + escapeHtmlLokal(d.nama) + '">').join('');
    }

    function formatSelisih(n) {
        const bulat = Math.round(n * 100) / 100;
        if (bulat > 0) return '<span class="selisih-plus">+' + bulat + '</span>';
        if (bulat < 0) return '<span class="selisih-minus">' + bulat + '</span>';
        return '0';
    }

    function renderBarisReview(row, i) {
        const selisih = (Number(row.stokBaru) || 0) - (Number(row.stokLama) || 0);
        const nilaiTotal = (Number(row.stokBaru) || 0) * (Number(row.hargaBeli) || 0);
        return '<tr data-i="' + i + '"' + (row.baru ? ' class="baris-baru"' : '') + '>'
            + '<td class="ro">' + row.no + '</td>'
            + '<td class="ro">' + escapeHtmlLokal(row.kode) + '</td>'
            + '<td class="ro">' + escapeHtmlLokal(row.barcode || '') + '</td>'
            + '<td class="ro">' + escapeHtmlLokal(row.nama) + '</td>'
            + '<td><input list="dlReviewKategori" class="in-kategori" value="' + escapeHtmlLokal(row.kategoriNama || '') + '"></td>'
            + '<td><input list="dlReviewPemasok" class="in-pemasok" value="' + escapeHtmlLokal(row.pemasokNama || '') + '"></td>'
            + '<td><input type="text" inputmode="numeric" class="in-num in-stok-baru" value="' + (row.stokBaru == null ? 0 : row.stokBaru) + '"></td>'
            + '<td class="ro num">' + (row.stokLama == null ? 0 : row.stokLama) + '</td>'
            + '<td class="ro num sel">' + formatSelisih(selisih) + '</td>'
            + '<td><input list="dlReviewSatuan" class="in-satuan" value="' + escapeHtmlLokal(row.satuanNama || '') + '"></td>'
            + '<td><input type="text" inputmode="numeric" class="in-num in-harga-jual" value="' + (row.hargaJual == null ? 0 : row.hargaJual) + '"></td>'
            + '<td><input type="text" inputmode="numeric" class="in-num in-harga-beli" value="' + (row.hargaBeli == null ? 0 : row.hargaBeli) + '"></td>'
            + '<td class="ro num nt">' + formatRupiah(nilaiTotal) + '</td>'
            + '</tr>';
    }

    /** Hanya mengizinkan digit -- sama alasan dgn jadikanInputAngka lain di app ini (`type="number"` bawaan browser pernah dilaporkan menolak keystroke di sebagian lingkungan Windows). */
    function bersihkanAngka(s) {
        const b = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
        const n = parseFloat(b);
        return isNaN(n) ? 0 : n;
    }

    /**
     * Nama kolom yg GAGAL ditemukan di file Excel yg baru saja diunggah (lihat balikan server
     * {@code kolomTidakDitemukan}, JavaDoc {@code KantinHelper.produkImporExcelPreview}) -- KOSONG
     * berarti semua kolom terbaca normal. Dipakai {@link #bukaReviewImpor} (tampilkan peringatan di
     * layar) DAN tombol Simpan (JavaDoc {@code elBtnReviewSimpan}) -- gap-closure "Stok Baru selalu 0
     * tanpa peringatan apa pun": kalau kolom Stok/Harga tak ditemukan, SETIAP baris otomatis kebaca 0
     * utk kolom itu, berisiko menimpa data stok/harga ASLI jadi 0 kalau supervisor tak sadar & tetap
     * klik Simpan -- peringatan ini WAJIB terlihat SEBELUM itu terjadi, bukan sesudahnya.
     */
    let kolomImporTidakDitemukan = [];

    function bukaReviewImpor(data) {
        reviewRows = (data.baris || []).map((b) => ({
            no: b.no, kode: b.kode, barcode: b.barcode, nama: b.nama, baru: !!b.baru,
            kategoriNama: b.kategoriNama || '', pemasokNama: b.pemasokNama || '', satuanNama: b.satuanNama || '',
            stokBaru: Number(b.stokBaru) || 0, stokLama: Number(b.stokLama) || 0,
            hargaJual: Number(b.hargaJual) || 0, hargaBeli: Number(b.hargaBeli) || 0
        }));
        isiDatalist(elDlReviewKategori, data.daftarKategori);
        isiDatalist(elDlReviewPemasok, data.daftarPemasok);
        isiDatalist(elDlReviewSatuan, data.daftarSatuan);
        elReviewTbody.innerHTML = reviewRows.map(renderBarisReview).join('');
        const baruCount = reviewRows.filter((r) => r.baru).length;
        elReviewSub.textContent = reviewRows.length + ' baris (' + baruCount + ' produk baru, ' + (reviewRows.length - baruCount) + ' diperbarui)';
        kolomImporTidakDitemukan = data.kolomTidakDitemukan || [];
        if (kolomImporTidakDitemukan.length) {
            elReviewFooterInfo.innerHTML = '<span style="color:var(--danger,#dc2626);font-weight:800;">'
                + '&#9888; Kolom ' + kolomImporTidakDitemukan.join(', ') + ' TIDAK ditemukan di file ini -- '
                + 'SEMUA baris di bawah otomatis dibaca 0 utk kolom itu. Periksa nama header di file Excel Anda, '
                + 'JANGAN klik Simpan sebelum yakin ini memang benar.</span>';
        } else {
            elReviewFooterInfo.textContent = 'Periksa/ubah data di bawah sebelum menyimpan.';
        }
        elOverlayReviewImpor.classList.add('tampil');
    }

    function tutupReviewImpor() {
        elOverlayReviewImpor.classList.remove('tampil');
        reviewRows = [];
        elReviewTbody.innerHTML = '';
    }

    // Event delegation (SATU listener utk seluruh tabel, bukan per-baris) -- penting utk performa
    // saat baris bisa ribuan (dataset akunting besar), lihat JavaDoc server produkImporExcelPreview.
    elReviewTbody.addEventListener('input', (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr) return;
        const i = parseInt(tr.getAttribute('data-i'), 10);
        const row = reviewRows[i];
        if (!row) return;
        const el = ev.target;
        if (el.classList.contains('in-kategori')) row.kategoriNama = el.value;
        else if (el.classList.contains('in-pemasok')) row.pemasokNama = el.value;
        else if (el.classList.contains('in-satuan')) row.satuanNama = el.value;
        else if (el.classList.contains('in-stok-baru')) { row.stokBaru = bersihkanAngka(el.value); }
        else if (el.classList.contains('in-harga-jual')) { row.hargaJual = bersihkanAngka(el.value); }
        else if (el.classList.contains('in-harga-beli')) { row.hargaBeli = bersihkanAngka(el.value); }
        else return;
        // Kolom turunan (selisih/nilai total) disegarkan LANGSUNG di baris ini saja -- bukan render ulang seluruh tabel.
        if (el.classList.contains('in-stok-baru') || el.classList.contains('in-harga-beli')) {
            const selisih = (Number(row.stokBaru) || 0) - (Number(row.stokLama) || 0);
            const nilaiTotal = (Number(row.stokBaru) || 0) * (Number(row.hargaBeli) || 0);
            tr.querySelector('.sel').innerHTML = formatSelisih(selisih);
            tr.querySelector('.nt').textContent = formatRupiah(nilaiTotal);
        }
    });

    elBtnReviewBatal.addEventListener('click', () => {
        if (!confirm('Batalkan impor ini? Tidak ada perubahan yang akan disimpan.')) return;
        tutupReviewImpor();
    });

    // ==== Laporan hasil impor (jendela baru + unduh .txt) ====
    // Satu laporan dibangun utk KETIGA kemungkinan hasil klik "Simpan": (a) langsung tersinkron ke
    // server (detail per-baris LENGKAP dari KantinHelper.produkImporExcelKomit), (b) offline --
    // tersimpan lokal, menunggu koneksi (baris tampil sbg "Menunggu", belum ada hasil server), atau
    // (c) ditolak server (mis. gerbang supervisor gagal) -- pesan penolakan ditampilkan apa adanya.
    // TIDAK memakai <script>/onclick INLINE di dokumen jendela baru (CSP `script-src 'self'` pada
    // produk.html berpotensi ikut membatasi about:blank hasil window.open() dari halaman ini) --
    // tombol Unduh murni <a download href="data:..."> (navigasi berkas, bukan skrip), tombol Cetak
    // dipasangi listener dari SISI JENDELA INDUK (addEventListener, BUKAN atribut inline) persis pola
    // yg sudah dipakai {@code elBtnReviewCetakPdf} di atas utk window.print().

    function buatTeksLaporanImpor(info) {
        const baris = [];
        baris.push('LAPORAN IMPOR KATALOG BARANG');
        baris.push('Diproses: ' + info.waktuProses);
        if (info.idLokal) baris.push('Referensi lokal: ' + info.idLokal);
        baris.push('Status: ' + (info.status === 'sinkron' ? 'Berhasil dikirim & diproses server'
            : info.status === 'offline' ? 'Tersimpan lokal di perangkat ini, menunggu koneksi internet'
                : 'Gagal dikirim ke server'));
        if (info.pesan) baris.push('Keterangan: ' + info.pesan);
        baris.push('');
        if (info.ringkasan) {
            const r = info.ringkasan;
            baris.push('RINGKASAN');
            baris.push('- Produk baru dibuat    : ' + (r.dibuat || 0));
            baris.push('- Produk diperbarui     : ' + (r.diperbarui || 0));
            baris.push('- Stok disesuaikan      : ' + (r.stokDiopname || 0));
            baris.push('- Dilewati/gagal        : ' + (r.dilewati || 0));
            baris.push('- Kategori baru dibuat  : ' + (r.kategoriBaru || 0));
            baris.push('- Pemasok baru dibuat   : ' + (r.pemasokBaru || 0));
            baris.push('- Satuan baru dibuat    : ' + (r.satuanBaru || 0));
            if (r.verifikasiGagal) baris.push('- Gagal VERIFIKASI ulang: ' + r.verifikasiGagal + ' (data tersimpan TAK sesuai yg diharapkan -- lihat detail per baris)');
            baris.push('');
        }
        baris.push('DETAIL PER BARIS');
        baris.push('----------------------------------------------------------------------');
        if (info.barisHasil && info.barisHasil.length) {
            info.barisHasil.forEach((b) => {
                baris.push('#' + b.no + ' [' + (b.status || '').toUpperCase() + '] ' + (b.kode || '-') + ' -- ' + (b.nama || '-'));
                if (b.stokLama != null && b.stokBaru != null) {
                    baris.push('    Stok: ' + b.stokLama + ' -> ' + b.stokBaru
                        + ' (selisih ' + (b.selisih > 0 ? '+' : '') + b.selisih + '), aksi: ' + (b.aksiStok || '-'));
                }
                if (b.pesan) baris.push('    ' + b.pesan);
                if (b.teknis) baris.push('    Detail teknis (penyebab gagal): ' + b.teknis);
                if (b.solusi) baris.push('    Saran perbaikan: ' + b.solusi);
                if (b.catatanVerifikasi) baris.push('    Catatan: ' + b.catatanVerifikasi);
                baris.push('');
            });
        } else {
            (info.barisInput || []).forEach((b, i) => {
                baris.push('#' + (i + 1) + ' [MENUNGGU] ' + (b.kode || '-') + ' -- ' + (b.nama || '-')
                    + ' (rencana stok: ' + (b.stokBaru != null ? b.stokBaru : 0) + ')');
            });
        }
        const adaGagal = info.barisHasil && info.barisHasil.some((b) => b.status === 'gagal');
        if (adaGagal) {
            baris.push('----------------------------------------------------------------------');
            baris.push('CATATAN: Ada baris yang gagal diproses/gagal verifikasi -- coba dulu langkah "Saran '
                + 'perbaikan" di atas untuk baris terkait, lalu impor ulang. Jika kegagalan TERUS berlanjut '
                + 'setelah dicoba ulang, laporkan ke admin/tim pengembang DAN WAJIB lampirkan tangkapan layar '
                + '(screenshot) laporan ini sebagai bukti.');
        }
        return baris.join('\n');
    }

    function bangunHtmlLaporanImpor(info) {
        const judulStatus = info.status === 'sinkron' ? '✅ Berhasil Dikirim &amp; Diproses Server'
            : info.status === 'offline' ? '\u{1F553} Tersimpan Lokal -- Menunggu Koneksi Internet'
                : '❌ Gagal Dikirim ke Server';
        const warnaStatus = info.status === 'sinkron' ? '#16a34a' : info.status === 'offline' ? '#d97706' : '#dc2626';

        let ringkasanHtml = '';
        if (info.ringkasan) {
            const r = info.ringkasan;
            const kartu = [
                [r.dibuat || 0, 'Produk Baru'], [r.diperbarui || 0, 'Diperbarui'], [r.stokDiopname || 0, 'Stok Disesuaikan'],
                [r.dilewati || 0, 'Dilewati/Gagal'], [r.kategoriBaru || 0, 'Kategori Baru'], [r.pemasokBaru || 0, 'Pemasok Baru'],
                [r.satuanBaru || 0, 'Satuan Baru']
            ];
            if (r.verifikasiGagal) kartu.push([r.verifikasiGagal, 'Gagal Verifikasi Ulang']);
            ringkasanHtml = '<div class="ringkasan">' + kartu.map((k) => '<div' + (k[1] === 'Gagal Verifikasi Ulang' && k[0] > 0 ? ' style="border-color:#dc2626;"' : '') + '><b>' + k[0] + '</b><span>' + k[1] + '</span></div>').join('') + '</div>';
        }
        const adaGagalHtml = info.barisHasil && info.barisHasil.some((b) => b.status === 'gagal');
        const banerEskalasi = adaGagalHtml
            ? '<div class="baner-eskalasi">⚠️ Ada baris yang gagal diproses/gagal verifikasi -- coba dulu "Saran perbaikan" di baris terkait, lalu impor ulang. '
                + 'Jika kegagalan <b>TERUS berlanjut</b> setelah dicoba ulang, laporkan ke admin/tim pengembang <b>DAN WAJIB lampirkan tangkapan layar (screenshot) laporan ini</b> sebagai bukti.</div>'
            : '';

        let tabelHtml;
        if (info.barisHasil && info.barisHasil.length) {
            tabelHtml = '<table><thead><tr><th>No</th><th>Kode</th><th>Nama</th><th>Status</th><th>Aksi Stok</th>'
                + '<th class="num">Stok Lama</th><th class="num">Stok Baru</th><th class="num">Selisih</th>'
                + '<th>Baru Dibuat</th><th>Keterangan</th></tr></thead><tbody>'
                + info.barisHasil.map((b) => {
                    const kelas = b.status === 'berhasil' ? 'ok' : b.status === 'gagal' ? 'gagal' : 'lewat';
                    const labelStatus = b.status === 'berhasil' ? 'Berhasil' : b.status === 'gagal' ? 'Gagal' : 'Dilewati';
                    const aksiStok = b.aksiStok === 'diopname' ? 'Disesuaikan (Opname)' : b.aksiStok === 'tidak_ada_perubahan' ? 'Tidak berubah' : '-';
                    const baruDibuat = [b.produkBaru ? 'Produk' : null, b.kategoriBaru ? 'Kategori' : null, b.pemasokBaru ? 'Pemasok' : null, b.satuanBaru ? 'Satuan' : null]
                        .filter(Boolean).join(', ') || '-';
                    const keterangan = escapeHtmlLokal(b.pesan || '')
                        + (b.teknis ? '<br><span class="teknis">Detail teknis: ' + escapeHtmlLokal(b.teknis) + '</span>' : '')
                        + (b.solusi ? '<br><span class="solusi">💡 Saran: ' + escapeHtmlLokal(b.solusi) + '</span>' : '')
                        + (b.catatanVerifikasi ? '<br><span class="catatan-verif">' + escapeHtmlLokal(b.catatanVerifikasi) + '</span>' : '');
                    return '<tr class="' + kelas + '"><td>' + b.no + '</td><td>' + escapeHtmlLokal(b.kode || '') + '</td>'
                        + '<td>' + escapeHtmlLokal(b.nama || '') + '</td><td class="status">' + labelStatus + '</td>'
                        + '<td>' + aksiStok + '</td>'
                        + '<td class="num">' + (b.stokLama != null ? b.stokLama : '-') + '</td>'
                        + '<td class="num">' + (b.stokBaru != null ? b.stokBaru : '-') + '</td>'
                        + '<td class="num">' + (b.selisih != null ? (b.selisih > 0 ? '+' : '') + b.selisih : '-') + '</td>'
                        + '<td>' + baruDibuat + '</td><td>' + keterangan + '</td></tr>';
                }).join('') + '</tbody></table>';
        } else {
            tabelHtml = '<table><thead><tr><th>No</th><th>Kode</th><th>Nama</th><th class="num">Stok Baru (rencana)</th>'
                + '<th>Kategori</th><th>Pemasok</th><th>Satuan</th></tr></thead><tbody>'
                + (info.barisInput || []).map((b, i) => '<tr class="lewat"><td>' + (i + 1) + '</td><td>' + escapeHtmlLokal(b.kode || '') + '</td>'
                    + '<td>' + escapeHtmlLokal(b.nama || '') + '</td><td class="num">' + (b.stokBaru != null ? b.stokBaru : 0) + '</td>'
                    + '<td>' + escapeHtmlLokal(b.kategoriNama || '') + '</td><td>' + escapeHtmlLokal(b.pemasokNama || '') + '</td>'
                    + '<td>' + escapeHtmlLokal(b.satuanNama || '') + '</td></tr>').join('') + '</tbody></table>';
        }

        const namaBerkas = 'laporan-impor-katalog-' + (info.idLokal || Date.now()) + '.txt';
        const hrefUnduh = 'data:text/plain;charset=utf-8,' + encodeURIComponent(buatTeksLaporanImpor(info));

        return '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Laporan Impor Katalog</title><style>'
            + 'body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#1e293b;background:#f8fafc;}'
            + 'h2{margin:0 0 4px;font-size:18px;}'
            + '.status-badge{display:inline-block;padding:6px 14px;border-radius:999px;color:#fff;font-weight:700;font-size:12.5px;background:' + warnaStatus + ';margin-bottom:10px;}'
            + 'p.meta{color:#64748b;font-size:11.5px;margin:2px 0 14px;white-space:pre-line;}'
            + '.ringkasan{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;}'
            + '.ringkasan div{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;min-width:110px;text-align:center;}'
            + '.ringkasan b{display:block;font-size:20px;}'
            + '.ringkasan span{font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;}'
            + 'table{width:100%;border-collapse:collapse;background:#fff;font-size:11px;}'
            + 'th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top;}'
            + 'th{background:#f1f5f9;font-size:10px;text-transform:uppercase;}'
            + 'td.num,th.num{text-align:right;}'
            + 'tr.ok td.status{color:#16a34a;font-weight:700;}'
            + 'tr.gagal{background:#fef2f2;}tr.gagal td.status{color:#dc2626;font-weight:700;}'
            + 'tr.lewat td.status{color:#64748b;}'
            + '.teknis{color:#dc2626;font-family:Consolas,monospace;font-size:10px;}'
            + '.solusi{color:#0369a1;font-size:10.5px;}'
            + '.catatan-verif{color:#d97706;font-size:10.5px;}'
            + '.baner-eskalasi{background:#fef2f2;border:1.5px solid #fecaca;color:#7f1d1d;border-radius:10px;padding:10px 14px;font-size:11.5px;line-height:1.5;margin-bottom:14px;}'
            + '.toolbar{margin-bottom:14px;display:flex;gap:8px;align-items:center;}'
            + '.toolbar button,.toolbar a{padding:9px 16px;border-radius:8px;border:1.5px solid #cbd5e1;background:#fff;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none;color:#1e293b;font-family:inherit;}'
            + '.toolbar button:hover,.toolbar a:hover{border-color:#2563eb;color:#2563eb;}'
            + '.toolbar .catatan-simpan{font-size:10.5px;color:#64748b;}'
            + '@media print{.toolbar{display:none;}body{margin:6px;background:#fff;}}'
            + '</style></head><body>'
            + '<div class="status-badge">' + judulStatus + '</div>'
            + '<h2>Laporan Impor Katalog Barang</h2>'
            + '<p class="meta">' + (info.barisInput ? info.barisInput.length : (info.barisHasil || []).length) + ' baris -- diproses ' + info.waktuProses
            + (info.idLokal ? ' -- ref: ' + info.idLokal : '') + (info.pesan ? '\n' + escapeHtmlLokal(info.pesan) : '') + '</p>'
            + ringkasanHtml
            + banerEskalasi
            + '<div class="toolbar"><button id="btnCetakLaporan" type="button">\u{1F5A8}️ Cetak</button>'
            + '<a id="linkUnduhLaporan" download="' + namaBerkas + '" href="' + hrefUnduh + '">⬇️ Unduh sebagai .txt</a>'
            + '<span class="catatan-simpan" id="catatanSimpanOtomatis">Menyimpan otomatis ke folder Downloads...</span></div>'
            + tabelHtml
            + '</body></html>';
    }

    /**
     * Membuka laporan hasil impor di jendela baru DAN otomatis menyimpannya sbg .txt ke folder
     * Downloads (permintaan: "langsung download otomatis file text ini, ... jangan sampai ada error
     * sekecil apapun kalau bisa tak tercatat") -- TIDAK menunggu klik apa pun, tombol "Unduh sebagai
     * .txt" di jendela laporan tetap ada sbg cara manual re-simpan/pindah lokasi bila perlu. Lihat
     * catatan CSP di atas {@link #bangunHtmlLaporanImpor} soal kenapa tombol Cetak dipasangi listener
     * dari SINI (jendela induk), bukan inline di dokumen jendela baru.
     */
    function tampilkanLaporanImpor(info) {
        const html = bangunHtmlLaporanImpor(info);
        const w = window.open('', 'laporanImporKatalog', 'width=1100,height=750');
        if (!w) { tampilkanToast('error', 'Popup laporan diblokir browser. Izinkan popup untuk aplikasi ini lalu coba lagi.'); return; }
        w.document.write(html);
        w.document.close();
        try {
            const btnCetak = w.document.getElementById('btnCetakLaporan');
            if (btnCetak) btnCetak.addEventListener('click', () => { try { w.print(); } catch (e) { /* jendela mungkin sudah ditutup -- abaikan */ } });
        } catch (e) { /* jendela ditutup pengguna tepat setelah dibuka -- abaikan, laporan tetap tampil apa adanya */ }

        const namaBerkas = 'laporan-impor-katalog-' + (info.idLokal || Date.now()) + '.txt';
        window.electronAPI.posAPI.produk.simpanLaporanOtomatis({ namaFile: namaBerkas, isiTeks: buatTeksLaporanImpor(info) })
            .then((r) => {
                try {
                    const elCatatan = w.document.getElementById('catatanSimpanOtomatis');
                    if (r.ok) {
                        if (elCatatan) elCatatan.textContent = '✅ Tersimpan otomatis: ' + r.path;
                        tampilkanToast('info', 'Laporan impor otomatis tersimpan ke folder Downloads.');
                    } else if (elCatatan) {
                        elCatatan.textContent = '⚠️ Gagal menyimpan otomatis (' + (r.pesan || 'penyebab tidak diketahui') + ') -- pakai tombol "Unduh sebagai .txt" di atas.';
                    }
                } catch (eTulis) { /* jendela laporan mungkin sudah ditutup pengguna -- abaikan, penyimpanan berkas itu sendiri tidak terpengaruh */ }
            })
            .catch(() => { /* gagal-diam -- tombol unduh manual di jendela laporan tetap tersedia sbg cadangan */ });
    }

    elBtnReviewSimpan.addEventListener('click', async () => {
        if (!reviewRows.length) return;
        const nonaktifkanTakDitemukan = !!(elChkNonaktifkanTakDitemukan && elChkNonaktifkanTakDitemukan.checked);
        if (!confirm(
            'Simpan ' + reviewRows.length + ' baris ke katalog toko ini?\n\n'
            + 'Produk dgn kode yang sudah ada akan DIPERBARUI, kode baru akan DIBUAT. Kategori/Pemasok/'
            + 'Satuan yang belum dikenal akan otomatis dibuat. Kolom "Stok Baru" akan dicatat sbg Stok Opname resmi bila berbeda dari stok saat ini.\n\n'
            + 'Data akan tersimpan di perangkat ini TERLEBIH DAHULU -- aman dikirim walau sedang offline, akan otomatis terkirim begitu koneksi internet tersambung.'
            + (nonaktifkanTakDitemukan
                ? '\n\n⚠️ "Nonaktifkan produk yang TIDAK ada di file ini" TERCENTANG -- SETELAH ' + reviewRows.length
                    + ' baris ini tersimpan, SEMUA produk toko ini yang masih aktif tapi TIDAK muncul di file ini akan DINONAKTIFKAN (bukan dihapus, bisa diaktifkan lagi manual). Pastikan file ini benar-benar berisi SELURUH katalog toko, bukan sebagian.'
                : '')
        )) return;
        // Gap-closure "Stok Baru selalu 0 tanpa peringatan" -- lihat JavaDoc kolomImporTidakDitemukan.
        // Konfirmasi KEDUA yg terpisah & lebih tegas (bukan cuma banner di layar yg bisa lewat tak
        // dibaca) SEBELUM benar2 menimpa data -- klik "Cancel" di sini membatalkan simpan sepenuhnya.
        if (kolomImporTidakDitemukan.length && !confirm(
            '⚠️ PERINGATAN: kolom ' + kolomImporTidakDitemukan.join(', ') + ' TIDAK ditemukan di file Excel ini.\n\n'
            + 'SEMUA baris akan menyimpan 0 utk kolom itu -- ini KEMUNGKINAN BESAR akan MENGHAPUS data stok/harga asli produk yang sudah ada.\n\n'
            + 'Yakin tetap ingin melanjutkan? Klik "Cancel" utk membatalkan dan memeriksa ulang file Excel Anda (nama header kolom mungkin tidak dikenali).'
        )) return;

        elBtnReviewSimpan.disabled = true;
        elBtnReviewBatal.disabled = true;
        if (elChkNonaktifkanTakDitemukan) elChkNonaktifkanTakDitemukan.disabled = true;
        elBtnReviewSimpan.textContent = 'Menyimpan...';
        elReviewSimpanProgressWrap.style.display = 'block';
        elReviewSimpanProgressTeks.style.display = 'inline';
        elReviewSimpanProgressBar.style.width = '0%';
        elReviewSimpanProgressTeks.textContent = '0 / ' + reviewRows.length + ' baris';
        const waktuProses = new Date().toLocaleString('id-ID');
        try {
            const r = await window.electronAPI.posAPI.produk.komitExcel({ baris: reviewRows, nonaktifkanTakDitemukan: nonaktifkanTakDitemukan });

            if (r.offline) {
                tampilkanToast('info', 'Offline -- data katalog tersimpan di perangkat ini, akan dikirim otomatis ke server begitu online.'
                    + (nonaktifkanTakDitemukan ? ' "Nonaktifkan produk yang tidak ada di file ini" akan ikut dijalankan begitu batch ini benar-benar tersinkron.' : ''));
                tampilkanLaporanImpor({ status: 'offline', pesan: r.pesan, idLokal: r.idLokal, barisInput: reviewRows, waktuProses: waktuProses });
                tutupReviewImpor();
                return;
            }
            if (!r.ok) {
                tampilkanLaporanImpor({ status: 'gagal', pesan: r.pesan || 'Penyebab tidak diketahui.', idLokal: r.idLokal, barisInput: reviewRows, waktuProses: waktuProses });
                window.PesanDetail.tampilkanDariHasil(r);
                return;
            }

            const d = r.data;
            tampilkanToast('success',
                'Selesai: ' + d.dibuat + ' produk baru, ' + d.diperbarui + ' diperbarui'
                + (d.stokDiopname ? ', ' + d.stokDiopname + ' stok diopname' : '')
                + (d.dilewati ? ', ' + d.dilewati + ' dilewati' : '')
                + (d.kategoriBaru || d.pemasokBaru || d.satuanBaru
                    ? ' (kategori baru: ' + d.kategoriBaru + ', pemasok baru: ' + d.pemasokBaru + ', satuan baru: ' + d.satuanBaru + ')'
                    : '')
                + (d.dinonaktifkan != null ? ', ' + d.dinonaktifkan + ' produk lama dinonaktifkan (tidak ada di file ini)' : ''));
            if (d.error && d.error.length) console.warn('Baris gagal saat impor katalog:', d.error);
            tampilkanLaporanImpor({ status: 'sinkron', idLokal: r.idLokal, ringkasan: d, barisHasil: d.baris || [], barisInput: reviewRows, waktuProses: waktuProses });
            tutupReviewImpor();
            muatDaftarProduk(elCariProduk.value.trim());
        } catch (e) {
            tampilkanToast('error', 'Gagal menyimpan katalog: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnReviewSimpan.disabled = false;
            elBtnReviewBatal.disabled = false;
            if (elChkNonaktifkanTakDitemukan) elChkNonaktifkanTakDitemukan.disabled = false;
            elBtnReviewSimpan.textContent = 'Simpan';
            elReviewSimpanProgressWrap.style.display = 'none';
            elReviewSimpanProgressTeks.style.display = 'none';
        }
    });

    // Progress bar "Simpan" (gap-closure) -- lihat JavaDoc pos:produk-komit-excel di main.js. Dipasang
    // sekali di init (bukan di dalam handler klik di atas) krn event ini bisa datang kapan saja selama
    // permintaan berjalan; elemen progress sendiri sudah disembunyikan lagi di blok `finally` di atas
    // begitu proses selesai/gagal/offline, jadi aman terpasang permanen.
    if (window.electronAPI && window.electronAPI.posAPI && window.electronAPI.posAPI.produk.onImportProgress) {
        window.electronAPI.posAPI.produk.onImportProgress((payload) => {
            const total = (payload && payload.total) || 0;
            const diproses = (payload && payload.diproses) || 0;
            const persen = total > 0 ? Math.round((diproses / total) * 100) : 0;
            elReviewSimpanProgressBar.style.width = persen + '%';
            elReviewSimpanProgressTeks.textContent = diproses + ' / ' + total + ' baris (' + persen + '%)';
        });
    }

    elBtnReviewUnduhExcel.addEventListener('click', async () => {
        if (!reviewRows.length) return;
        elBtnReviewUnduhExcel.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.produk.eksporGridExcel({ baris: reviewRows });
            if (!r.ok) { window.PesanDetail.tampilkanDariHasil(r); return; }
            const simpan = await window.electronAPI.posAPI.produk.simpanExcel({
                fileBase64: r.data.fileBase64,
                namaBerkas: r.data.namaFile || 'katalog-review.xlsx'
            });
            if (simpan.dibatalkan) return;
            if (!simpan.ok) { tampilkanToast('error', simpan.pesan || 'Gagal menyimpan berkas.'); return; }
            tampilkanToast('success', 'Diunduh ke ' + simpan.path);
        } catch (e) {
            tampilkanToast('error', 'Gagal mengunduh: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnReviewUnduhExcel.disabled = false;
        }
    });

    elBtnReviewCetakPdf.addEventListener('click', () => {
        if (!reviewRows.length) return;
        const baris = reviewRows.map((r) => {
            const selisih = (Number(r.stokBaru) || 0) - (Number(r.stokLama) || 0);
            const nilaiTotal = (Number(r.stokBaru) || 0) * (Number(r.hargaBeli) || 0);
            return '<tr>'
                + '<td>' + r.no + '</td><td>' + escapeHtmlLokal(r.kode) + '</td><td>' + escapeHtmlLokal(r.barcode || '') + '</td>'
                + '<td>' + escapeHtmlLokal(r.nama) + '</td><td>' + escapeHtmlLokal(r.kategoriNama || '') + '</td>'
                + '<td>' + escapeHtmlLokal(r.pemasokNama || '') + '</td>'
                + '<td class="num">' + r.stokBaru + '</td><td class="num">' + r.stokLama + '</td><td class="num">' + selisih + '</td>'
                + '<td>' + escapeHtmlLokal(r.satuanNama || '') + '</td>'
                + '<td class="num">' + formatRupiah(r.hargaJual) + '</td><td class="num">' + formatRupiah(r.hargaBeli) + '</td>'
                + '<td class="num">' + formatRupiah(nilaiTotal) + '</td></tr>';
        }).join('');
        const html = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Review Impor Katalog</title><style>'
            + 'body{font-family:Arial,sans-serif;font-size:9px;margin:14px;color:#000;}'
            + 'h2{margin:0 0 4px;font-size:14px;}p{margin:0 0 10px;color:#555;font-size:10px;}'
            + 'table{width:100%;border-collapse:collapse;}th,td{border:1px solid #999;padding:3px 5px;text-align:left;}'
            + 'th{background:#eee;font-size:8.5px;text-transform:uppercase;}td.num,th.num{text-align:right;}'
            + '@media print{body{margin:6px;}}'
            + '</style></head><body>'
            + '<h2>Review Impor Katalog Barang</h2><p>' + reviewRows.length + ' baris -- ' + new Date().toLocaleString('id-ID') + '</p>'
            + '<table><thead><tr><th>No</th><th>Kode</th><th>Barcode</th><th>Nama</th><th>Kategori</th><th>Pemasok</th>'
            + '<th class="num">Stok Baru</th><th class="num">Stok Lama</th><th class="num">Selisih</th><th>Satuan</th>'
            + '<th class="num">Harga Jual</th><th class="num">Nilai Barang</th><th class="num">Nilai Total</th></tr></thead>'
            + '<tbody>' + baris + '</tbody></table></body></html>';
        const w = window.open('', 'reviewImporCetak', 'width=900,height=700');
        if (!w) { tampilkanToast('error', 'Popup dicetak diblokir browser. Izinkan popup untuk aplikasi ini lalu coba lagi.'); return; }
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch (e) { /* jendela mungkin sudah ditutup pengguna -- abaikan */ } }, 600);
    });

    elBtnSimpanProduk.addEventListener('click', async () => {
        const kode = elFormProdukKode.value.trim();
        const nama = elFormProdukNama.value.trim();
        if (!kode) { tampilkanToast('error', 'Kode produk wajib diisi.'); elFormProdukKode.focus(); return; }
        if (!nama) { tampilkanToast('error', 'Nama produk wajib diisi.'); elFormProdukNama.focus(); return; }

        const payload = {
            kode: kode,
            barcode: elFormProdukBarcode.value.trim(),
            nama: nama,
            keterangan: elFormProdukKeterangan.value.trim(),
            harga_beli: parseFloat(elFormProdukHargaBeli.value) || 0,
            harga_jual: parseFloat(elFormProdukHargaJual.value) || 0,
            stok: parseFloat(elFormProdukStok.value) || 0,
            izinkan_jual_minus_stok: elFormProdukIzinkanMinus.checked,
            aktif: elFormProdukAktif.checked,
            kategori_id: elFormProdukKategori.value || null,
            bahan_baku: bahanBakuList
        };
        if (idSedangDiubah) payload.id = idSedangDiubah;

        elBtnSimpanProduk.disabled = true;
        elBtnSimpanProduk.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.produk.simpan(payload);
            if (r.ok) {
                tampilkanToast('success', (idSedangDiubah ? 'Produk diperbarui.' : 'Produk baru ditambahkan.'));
                elOverlayFormProduk.className = 'overlay';
                muatDaftarProduk(elCariProduk.value.trim());
                muatStatistikProduk();
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSimpanProduk.disabled = false;
            elBtnSimpanProduk.textContent = 'Simpan';
        }
    });

    // Batch impor katalog yg tadinya offline (lihat elBtnReviewSimpan) berhasil tersinkron di latar
    // oleh main.js (sinkronkanImporKatalogPending, berkala tiap 30 detik) -- muat ulang daftar produk
    // supaya angka Stok yg baru langsung terlihat TANPA supervisor perlu klik apa pun. Laporan lengkap
    // batch itu sendiri tetap bisa dibuka lagi kapan saja lewat window.electronAPI.posAPI.produk.
    // importStatus(idLokal) memakai idLokal yg sudah ditampilkan di laporan "menunggu koneksi"
    // sebelumnya (dicatat kasir/supervisor dari layar itu bila perlu ditelusuri ulang).
    if (window.electronAPI.posAPI.produk.onImportKatalogTersinkron) {
        window.electronAPI.posAPI.produk.onImportKatalogTersinkron(() => {
            tampilkanToast('success', 'Impor katalog yang tadi tertunda offline sudah berhasil dikirim & diproses server.');
            muatDaftarProduk(elCariProduk.value.trim());
        });
    }

    // =====================================================================
    // ==== Cetak Price Tag / POP (gap-closure), padanan JSP barang/pricetag.jsp -- toko/produk sama
    // persis dgn Katalog di atas, tapi tata-letak label (barcode via JsBarcode + grid halaman
    // A2/A4/A5, 1/2/4 label per halaman) dibangun 100% di sini, BUKAN diminta dari server -- server
    // (aksi price_tag_list_produk) murni sumber data id/kode/nama/hargaJual, sama seperti
    // PriceTagUtil.listProduk yg dipakai JSP/ZK. Hasil akhir dikirim ke main.js sbg HTML SIAP CETAK
    // (barcode SVG sudah baked-in) lewat jendela pratinjau+toolbar yg sama polanya dgn Cetak Struk.
    // =====================================================================
    const elBtnCetakPriceTag = document.getElementById('btnCetakPriceTag');
    const elOverlayPriceTag = document.getElementById('overlayPriceTag');
    const elBtnTutupPriceTag = document.getElementById('btnTutupPriceTag');
    const elPtCariProduk = document.getElementById('ptCariProduk');
    const elPtPilihSemua = document.getElementById('ptPilihSemua');
    const elPtJumlahDipilih = document.getElementById('ptJumlahDipilih');
    const elPtDaftarProduk = document.getElementById('ptDaftarProduk');
    const elPtJenisCetak = document.getElementById('ptJenisCetak');
    const elPtOpsiPop = document.getElementById('ptOpsiPop');
    const elPtUkuranBtns = document.querySelectorAll('.pt-ukuran-btn');
    const elPtLabelPerHalaman = document.getElementById('ptLabelPerHalaman');
    const elPtCopies = document.getElementById('ptCopies');
    const elPtPromo = document.getElementById('ptPromo');
    const elPtTampilBarcode = document.getElementById('ptTampilBarcode');
    const elPtTampilKode = document.getElementById('ptTampilKode');
    const elPtTampilToko = document.getElementById('ptTampilToko');
    const elBtnPratinjauCetakPriceTag = document.getElementById('btnPratinjauCetakPriceTag');

    let daftarProdukPriceTag = [];
    let idTerpilihPriceTag = new Set();
    let ukuranTerpilihPriceTag = 'A4';

    async function bukaModalPriceTag() {
        elOverlayPriceTag.classList.add('tampil');
        elPtDaftarProduk.innerHTML = '<div class="daftar-kosong">Memuat...</div>';
        idTerpilihPriceTag = new Set();
        elPtPilihSemua.checked = false;
        try {
            const r = await window.electronAPI.posAPI.priceTag.listProduk({});
            if (!r.ok) {
                window.PesanDetail ? window.PesanDetail.tampilkanDariHasil(r) : tampilkanToast('error', r.pesan || 'Gagal memuat produk.');
                elPtDaftarProduk.innerHTML = '<div class="daftar-kosong">Gagal memuat.</div>';
                return;
            }
            daftarProdukPriceTag = (r.data && r.data.data) || [];
            renderDaftarPriceTag();
        } catch (e) {
            elPtDaftarProduk.innerHTML = '<div class="daftar-kosong">Gagal memuat: ' + escapeHtmlLokal(e && e.message ? e.message : e) + '</div>';
        }
    }
    elBtnCetakPriceTag.addEventListener('click', bukaModalPriceTag);
    elBtnTutupPriceTag.addEventListener('click', () => elOverlayPriceTag.classList.remove('tampil'));

    function daftarPriceTagTerfilter() {
        const kw = elPtCariProduk.value.trim().toLowerCase();
        if (!kw) return daftarProdukPriceTag;
        return daftarProdukPriceTag.filter((p) => p.nama.toLowerCase().indexOf(kw) >= 0 || p.kode.toLowerCase().indexOf(kw) >= 0);
    }

    function renderDaftarPriceTag() {
        const tampil = daftarPriceTagTerfilter();
        if (tampil.length === 0) {
            elPtDaftarProduk.innerHTML = '<div class="daftar-kosong">Tidak ada produk yang cocok.</div>';
        } else {
            elPtDaftarProduk.innerHTML = tampil.map((p) => (
                '<div class="pt-item" data-id="' + p.id + '"><input type="checkbox" ' + (idTerpilihPriceTag.has(p.id) ? 'checked' : '') + '>'
                + '<span class="nama">' + escapeHtmlLokal(p.nama) + '</span><span class="harga">' + formatRupiah(p.hargaJual) + '</span></div>'
            )).join('');
            elPtDaftarProduk.querySelectorAll('.pt-item').forEach((el) => {
                el.addEventListener('click', () => {
                    const id = Number(el.getAttribute('data-id'));
                    if (idTerpilihPriceTag.has(id)) idTerpilihPriceTag.delete(id); else idTerpilihPriceTag.add(id);
                    renderDaftarPriceTag();
                });
            });
        }
        elPtJumlahDipilih.textContent = idTerpilihPriceTag.size + ' dipilih';
        elPtPilihSemua.checked = tampil.length > 0 && tampil.every((p) => idTerpilihPriceTag.has(p.id));
    }
    elPtCariProduk.addEventListener('input', renderDaftarPriceTag);
    elPtPilihSemua.addEventListener('change', () => {
        const tampil = daftarPriceTagTerfilter();
        if (elPtPilihSemua.checked) tampil.forEach((p) => idTerpilihPriceTag.add(p.id));
        else tampil.forEach((p) => idTerpilihPriceTag.delete(p.id));
        renderDaftarPriceTag();
    });

    elPtUkuranBtns.forEach((btn) => btn.addEventListener('click', () => {
        elPtUkuranBtns.forEach((b) => b.classList.remove('aktif'));
        btn.classList.add('aktif');
        ukuranTerpilihPriceTag = btn.getAttribute('data-ukuran');
    }));

    // "Ukuran Kertas"/"Label per Halaman" HANYA relevan utk template "pop" (A2/A4/A5 + 1/2/4-per-hal)
    // -- "sticker" (selalu A4, 40/lembar) dan "textlabel" (selalu A4, 2 kolom mengalir) tidak punya
    // konsep ukuran/label-per-halaman sama sekali, sama persis perilaku ptTplChange() JSP pricetag.jsp.
    elPtJenisCetak.addEventListener('change', () => {
        elPtOpsiPop.style.display = elPtJenisCetak.value === 'pop' ? 'block' : 'none';
    });

    /** @param {string} kode @return {string} markup SVG barcode CODE128, atau string kosong bila kode tak valid dibuat barcode (mis. kosong). */
    function bangunBarcodeSvg(kode) {
        if (!kode || typeof JsBarcode === 'undefined') return '';
        try {
            const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            JsBarcode(svgEl, kode, { format: 'CODE128', displayValue: false, margin: 0, height: 50 });
            return svgEl.outerHTML;
        } catch (e) {
            return ''; // kode mengandung karakter yg tak valid utk CODE128 -- lewati, teks kode tetap tampil terpisah
        }
    }

    const PT_SIZE_SCALE = { A2: 2.0, A4: 1.0, A5: 0.6 };
    const PT_PER_SCALE = { 1: 1.0, 2: 0.62, 4: 0.46 };
    const PT_PER_COLS = { 1: '1fr', 2: '1fr', 4: '1fr 1fr' };
    const PT_PAPER_MM = { A2: { w: 420, h: 594 }, A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };

    /** Bangun HTML lembar cetak PENUH (siap dikirim ke jendela pratinjau) sesuai produk+pengaturan terpilih. */
    function bangunHtmlPriceTag(produkList, opsi) {
        const skala = PT_SIZE_SCALE[opsi.ukuran] * PT_PER_SCALE[opsi.perHalaman];
        const fH = Math.round(30 * skala), fN = Math.round(20 * skala), fT = Math.round(13 * skala), fP = Math.round(15 * skala), bcH = Math.round(46 * skala);
        const kertas = PT_PAPER_MM[opsi.ukuran];

        const semuaTag = [];
        produkList.forEach((p) => { for (let i = 0; i < opsi.copies; i++) semuaTag.push(p); });

        const arrTagHtml = semuaTag.map((p) => {
            let isi = '';
            if (opsi.tampilToko && tokoNamaSaatIni) isi += '<div class="t-toko" style="font-size:' + fT + 'px;">' + escapeHtmlLokal(tokoNamaSaatIni.toUpperCase()) + '</div>';
            if (opsi.promo) isi += '<div class="t-promo" style="font-size:' + fP + 'px;">' + escapeHtmlLokal(opsi.promo) + '</div>';
            isi += '<div class="t-nama" style="font-size:' + fN + 'px;">' + escapeHtmlLokal(p.nama) + '</div>';
            isi += '<div class="t-harga" style="font-size:' + fH + 'px;">' + formatRupiah(p.hargaJual) + '</div>';
            if (opsi.tampilBarcode || opsi.tampilKode) {
                isi += '<div class="t-bc">';
                if (opsi.tampilBarcode) isi += '<div style="height:' + bcH + 'px;max-width:100%;">' + bangunBarcodeSvg(p.kode) + '</div>';
                if (opsi.tampilKode) isi += '<div class="t-kode" style="font-size:' + fT + 'px;">' + escapeHtmlLokal(p.kode) + '</div>';
                isi += '</div>';
            }
            return '<div class="tag">' + isi + '</div>';
        });

        let halamanHtml = '';
        for (let i = 0; i < arrTagHtml.length; i += opsi.perHalaman) {
            halamanHtml += '<div class="page">' + arrTagHtml.slice(i, i + opsi.perHalaman).join('') + '</div>';
        }

        const style = '<style>'
            + '@page{size:' + opsi.ukuran + ';margin:8mm;}'
            + '*{box-sizing:border-box;}'
            + '.page{width:' + kertas.w + 'mm;min-height:' + (kertas.h - 16) + 'mm;display:grid;grid-template-columns:' + PT_PER_COLS[opsi.perHalaman] + ';gap:6mm;page-break-after:always;margin:0 auto 8mm;background:#fff;}'
            + '.page:last-child{page-break-after:auto;}'
            + '.tag{border:3px dashed #cbd5e1;border-radius:10px;padding:5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2mm;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow:hidden;}'
            + '.t-toko{font-weight:700;color:#64748b;letter-spacing:.05em;}'
            + '.t-promo{background:#dc2626;color:#fff;font-weight:800;padding:3px 12px;border-radius:999px;}'
            + '.t-nama{font-weight:700;color:#1e293b;}'
            + '.t-harga{font-weight:800;color:#2563eb;}'
            + '.t-bc{display:flex;flex-direction:column;align-items:center;gap:1mm;width:100%;}'
            + '.t-bc svg{max-width:90%;}'
            + '.t-kode{color:#64748b;font-family:ui-monospace,monospace;}'
            + '</style>';

        return style + halamanHtml;
    }

    /**
     * Template "Stiker Label Warna A4" (gap-closure) -- padanan PERSIS {@code cetakSticker()} di
     * {@code webapp/js/ais_pricetag_print.js}: grid 5 kolom x 8 baris = 40 stiker/lembar A4, bar atas
     * merah (promo kiri, pil putih "Rp" kanan), pita nama produk kuning, harga biru, footer
     * barcode+kode. TIDAK ada nama toko sama sekali di template ini (sesuai JSP asli). "Ukuran
     * kertas"/"Label per halaman" diabaikan -- selalu A4/40-per-lembar.
     */
    function bangunHtmlPriceTagSticker(produkList, opsi) {
        const semuaTag = [];
        produkList.forEach((p) => { for (let i = 0; i < opsi.copies; i++) semuaTag.push(p); });
        const PER_LEMBAR = 40;

        const arrTagHtml = semuaTag.map((p) => {
            let isi = '<div class="lbl-top"><span>' + escapeHtmlLokal(opsi.promo || 'PROMO') + '</span><span class="lbl-rp">Rp</span></div>';
            isi += '<div class="lbl-nama">' + escapeHtmlLokal(p.nama) + '</div>';
            isi += '<div class="lbl-harga"><span class="rp">Rp</span><b>' + Math.round(p.hargaJual || 0).toLocaleString('id-ID') + '</b><span class="pcs">/pcs</span></div>';
            if (opsi.tampilBarcode || opsi.tampilKode) {
                isi += '<div class="lbl-foot">';
                if (opsi.tampilBarcode) isi += '<span class="bc">' + bangunBarcodeSvg(p.kode) + '</span>';
                if (opsi.tampilKode) isi += '<span class="kode">KODE : ' + escapeHtmlLokal(p.kode) + '</span>';
                isi += '</div>';
            }
            return '<div class="lbl">' + isi + '</div>';
        });

        let halamanHtml = '';
        for (let i = 0; i < arrTagHtml.length; i += PER_LEMBAR) {
            halamanHtml += '<div class="sheet">' + arrTagHtml.slice(i, i + PER_LEMBAR).join('') + '</div>';
        }

        const style = '<style>'
            + '@page{size:A4;margin:4mm;}*{box-sizing:border-box;}'
            + 'body{font-family:Arial,Helvetica,sans-serif;}'
            + '.sheet{display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(8,1fr);gap:1.2mm;page-break-after:always;}'
            + '.sheet:last-child{page-break-after:auto;}'
            + '.lbl{border:1px solid #d1d5db;border-radius:3px;font-size:7px;display:flex;flex-direction:column;overflow:hidden;}'
            + '.lbl-top{background:#e11d2a;color:#fff;font-weight:800;display:flex;justify-content:space-between;align-items:center;padding:1px 3px;}'
            + '.lbl-rp{background:#fff;color:#e11d2a;border-radius:2px;padding:0 2px;font-size:6px;}'
            + '.lbl-nama{background:#ffd400;color:#000;font-weight:800;font-size:8px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 2px;}'
            + '.lbl-harga{flex:1;display:flex;align-items:center;justify-content:center;gap:1px;color:#0033a0;}'
            + '.lbl-harga .rp{font-size:7px;}.lbl-harga b{font-size:15px;}.lbl-harga .pcs{font-size:6px;align-self:flex-end;}'
            + '.lbl-foot{display:flex;justify-content:space-between;align-items:center;padding:1px 3px;gap:2px;}'
            + '.lbl-foot .bc{height:14px;max-width:60%;overflow:hidden;}.lbl-foot .bc svg{height:14px;}'
            + '.lbl-foot .kode{font-size:6px;font-weight:800;white-space:nowrap;}'
            + '</style>';
        return style + halamanHtml;
    }

    /**
     * Template "Label Teks Sederhana" (gap-closure) -- padanan PERSIS {@code cetakTextLabel()} di
     * {@code ais_pricetag_print.js}: grid 2 kolom A4 margin 12mm, font serif, daftar teks polos tanpa
     * warna/latar apa pun ("Nama Produk : X", "Harga : Rp Y", "Barcode : [gambar]", "Kode : Z"),
     * masing-masing baris digerbang checkbox show*-nya sendiri. "Ukuran kertas"/"Label per halaman"
     * diabaikan -- selalu A4, mengalir sebanyak baris yg dibutuhkan (bukan halaman tetap).
     */
    function bangunHtmlPriceTagTextLabel(produkList, opsi) {
        const semuaTag = [];
        produkList.forEach((p) => { for (let i = 0; i < opsi.copies; i++) semuaTag.push(p); });

        const arrTagHtml = semuaTag.map((p) => {
            let isi = '';
            if (opsi.tampilToko && tokoNamaSaatIni) isi += '<div class="tl-toko">' + escapeHtmlLokal(tokoNamaSaatIni.toUpperCase()) + '</div>';
            isi += '<div>Nama Produk : <span class="tl-v">' + escapeHtmlLokal(p.nama) + '</span></div>';
            isi += '<div class="tl-harga">Harga : Rp <span class="tl-v">' + Math.round(p.hargaJual || 0).toLocaleString('id-ID') + '</span></div>';
            if (opsi.tampilBarcode) isi += '<div class="tl-bc">Barcode : ' + bangunBarcodeSvg(p.kode) + '</div>';
            if (opsi.tampilKode) isi += '<div>Kode : <span class="tl-v">' + escapeHtmlLokal(p.kode) + '</span></div>';
            return '<div class="tl">' + isi + '</div>';
        }).join('');

        const style = '<style>'
            + '@page{size:A4;margin:12mm;}*{box-sizing:border-box;}'
            + 'body{font-family:"Times New Roman",Georgia,serif;}'
            + '.grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm 14mm;}'
            + '.tl{font-size:12px;line-height:1.5;page-break-inside:avoid;}'
            + '.tl-toko{font-weight:700;font-size:13px;margin-bottom:2px;}'
            + '.tl-harga{font-weight:600;}.tl-v{font-weight:600;}'
            + '.tl-bc .bc-svg{height:16px;vertical-align:middle;}'
            + '</style>';
        return style + '<div class="grid">' + arrTagHtml + '</div>';
    }

    elBtnPratinjauCetakPriceTag.addEventListener('click', async () => {
        const produkTerpilih = daftarProdukPriceTag.filter((p) => idTerpilihPriceTag.has(p.id));
        if (produkTerpilih.length === 0) {
            tampilkanToast('error', 'Pilih minimal satu produk terlebih dahulu.');
            return;
        }
        const jenis = elPtJenisCetak.value;
        const opsi = {
            ukuran: ukuranTerpilihPriceTag,
            perHalaman: Number(elPtLabelPerHalaman.value),
            copies: Math.max(1, Math.min(50, Number(elPtCopies.value) || 1)),
            promo: elPtPromo.value.trim(),
            tampilBarcode: elPtTampilBarcode.checked,
            tampilKode: elPtTampilKode.checked,
            tampilToko: elPtTampilToko.checked
        };
        const semulaTeks = elBtnPratinjauCetakPriceTag.textContent;
        elBtnPratinjauCetakPriceTag.disabled = true;
        elBtnPratinjauCetakPriceTag.textContent = 'Menyiapkan...';
        try {
            const isi = jenis === 'sticker' ? bangunHtmlPriceTagSticker(produkTerpilih, opsi)
                : jenis === 'textlabel' ? bangunHtmlPriceTagTextLabel(produkTerpilih, opsi)
                : bangunHtmlPriceTag(produkTerpilih, opsi);
            const r = await window.electronAPI.posAPI.priceTag.cetakPreview({ isi });
            if (!r.ok && r.pesan !== 'Dibatalkan.') tampilkanToast('error', r.pesan || 'Gagal mencetak.');
        } catch (e) {
            tampilkanToast('error', 'Gagal menyiapkan pratinjau: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnPratinjauCetakPriceTag.disabled = false;
            elBtnPratinjauCetakPriceTag.textContent = semulaTeks;
        }
    });

    // ==== Inisialisasi ====
    (async function inisialisasi() {
        await segarkanStatus();
        await muatDaftarProduk('');
        muatStatistikProduk();
        muatRingkasanCacheProduk();
    })();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
