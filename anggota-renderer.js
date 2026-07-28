/**
 * anggota-renderer.js -- Layar "Customer/Anggota" (butir 12 spesifikasi "dashboard kasir": tombol
 * yang "fungsinya samakan dengan manajemen anggota yang ada di pos online (versi jsp)"). Versi
 * Desktop ini SENGAJA hanya mencakup subset field yang relevan utk kasir kantin (nama, kode
 * identitas, kontak, jenis keanggotaan, aktif) -- lihat JavaDoc lengkap {@code KantinHelper.anggotaSimpan}
 * (server) soal kenapa penautan "master sivitas" (mahasiswa/siswa/guru/dosen/pegawai) versi JSP
 * TIDAK direplikasi di sini. Semua data lewat window.electronAPI.posAPI.anggota.* (IPC ke proses
 * utama) -- tidak ada fetch()/XHR langsung dari renderer ini.
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    const elCariAnggota = document.getElementById('cariAnggota');
    const elBtnTambahAnggota = document.getElementById('btnTambahAnggota');
    const elBtnSinkronAnggotaCache = document.getElementById('btnSinkronAnggotaCache');
    const elInfoCacheAnggota = document.getElementById('infoCacheAnggota');
    const elTabelAnggota = document.getElementById('tabelAnggota');
    const elInfoPaginasiAnggota = document.getElementById('infoPaginasiAnggota');
    const elBtnHalSebelumnyaAnggota = document.getElementById('btnHalSebelumnyaAnggota');
    const elBtnHalBerikutnyaAnggota = document.getElementById('btnHalBerikutnyaAnggota');

    const elOverlayFormAnggota = document.getElementById('overlayFormAnggota');
    const elJudulFormAnggota = document.getElementById('judulFormAnggota');
    const elBtnTutupFormAnggota = document.getElementById('btnTutupFormAnggota');
    const elFormAnggotaNama = document.getElementById('formAnggotaNama');
    const elFormAnggotaKodeIdentitas = document.getElementById('formAnggotaKodeIdentitas');
    const elFormAnggotaJenis = document.getElementById('formAnggotaJenis');
    const elFormAnggotaHp = document.getElementById('formAnggotaHp');
    const elFormAnggotaTelp = document.getElementById('formAnggotaTelp');
    const elFormAnggotaEmail = document.getElementById('formAnggotaEmail');
    const elFormAnggotaKeterangan = document.getElementById('formAnggotaKeterangan');
    const elFormAnggotaAktif = document.getElementById('formAnggotaAktif');
    const elBtnSimpanAnggota = document.getElementById('btnSimpanAnggota');

    function formatWaktu(iso) {
        if (!iso) return '-';
        try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
        catch (e) { return iso; }
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    /**
     * Gerbang supervisor -- SAMA pola dgn produk-renderer.js (bolehKelolaProduk): kasir biasa (bukan
     * supervisor/admin) hanya boleh MELIHAT daftar anggota, tombol Tambah/Ubah disembunyikan. Gerbang
     * SEBENARNYA tetap ditegakkan server-side ({@code KantinHelper.anggotaSimpan}) -- ini murni UX
     * (jangan tampilkan aksi yang toh akan ditolak server).
     */
    let isAdminAkun = false;
    let supervisorPedagang = false;
    const bolehKelolaAnggota = () => isAdminAkun || supervisorPedagang;

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan -- panel status bukan jalur kritis */ }
        try {
            const cfg = await window.electronAPI.posAPI.konfigurasi();
            if (cfg.ok) {
                elNamaToko.textContent = cfg.data.tokoNama || (cfg.data.userId ? ('Kasir - ' + cfg.data.userId) : 'Kasir');
                isAdminAkun = !!cfg.data.isAdmin;
                supervisorPedagang = !!cfg.data.supervisorPedagang;
                elBtnTambahAnggota.style.display = bolehKelolaAnggota() ? 'inline-flex' : 'none';
                renderTabelAnggota(daftarAnggotaTerakhir);
            }
        } catch (e) { /* abaikan */ }
    }

    // ==== Daftar jenis keanggotaan (dropdown form) ====

    let daftarJenis = [];
    async function muatJenisAnggota() {
        try {
            const r = await window.electronAPI.posAPI.anggota.jenisList();
            daftarJenis = (r.ok && r.data && r.data.data) || [];
        } catch (e) { daftarJenis = []; }
        elFormAnggotaJenis.innerHTML = '<option value="">-- Tidak ditentukan --</option>';
        daftarJenis.forEach((j) => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.nama;
            elFormAnggotaJenis.appendChild(opt);
        });
    }

    // ==== Dasbor statistik + cache lokal (gap-closure paritas menu Produk) ====

    function buatBarHorizontalAnggota(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="daftar-kosong">Belum ada data.</div>'; return; }
        const maks = Math.max.apply(null, data.map((d) => d.jumlah)) || 1;
        data.forEach((d, i) => {
            const baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.jumlah / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = d.jumlah;
            container.appendChild(baris);
        });
    }

    async function muatStatistikAnggota() {
        try {
            const r = await window.electronAPI.posAPI.anggota.statistik();
            if (!r.ok || !r.data) return;
            const d = r.data;
            document.getElementById('kpiTotalAnggota').textContent = String(d.totalAnggota || 0);
            document.getElementById('kpiAnggotaAktif').textContent = String(d.totalAktif || 0);
            document.getElementById('kpiAnggotaNonaktif').textContent = String(d.totalNonaktif || 0);
            document.getElementById('kpiAnggotaWajibPin').textContent = String(d.totalWajibPin || 0);
            buatBarHorizontalAnggota(document.getElementById('barJenisAnggota'), d.byJenis || []);
        } catch (e) { /* dasbor statistik gagal muat bukan blocker */ }
    }

    function formatWaktuCacheAnggota(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    async function muatRingkasanCacheAnggota() {
        try {
            const r = await window.electronAPI.posAPI.anggotaCacheCari({ keyword: '', limit: 1 });
            if (!r.ok) return;
            const waktu = formatWaktuCacheAnggota(r.disinkronPada);
            elInfoCacheAnggota.textContent = (r.totalCache || 0) > 0
                ? ('\u{1F4E6} ' + r.totalCache + ' anggota tersimpan di cache lokal (dipakai picker member Kasir saat offline)' + (waktu ? ' -- terakhir disinkron ' + waktu : '.'))
                : '\u{1F4E6} Belum ada cache lokal -- klik "Sinkronkan" untuk menyimpan salinan data+foto anggota offline.';
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }

    if (elBtnSinkronAnggotaCache) {
        elBtnSinkronAnggotaCache.addEventListener('click', async () => {
            elBtnSinkronAnggotaCache.disabled = true;
            const teksAsli = elBtnSinkronAnggotaCache.innerHTML;
            elBtnSinkronAnggotaCache.innerHTML = '&#8987; Menyinkronkan...';
            const r = await window.electronAPI.posAPI.anggotaSync.mulai();
            if (!r || !r.ok) {
                elBtnSinkronAnggotaCache.disabled = false;
                elBtnSinkronAnggotaCache.innerHTML = teksAsli;
                tampilkanToast('error', (r && r.pesan) || 'Gagal memulai sinkronisasi data anggota.');
            }
            // Bila berhasil DIMULAI, tombol tetap disabled sampai event 'selesai'/'error' via onStatus.
        });
        window.electronAPI.posAPI.anggotaSync.onStatus((status) => {
            if (!status) return;
            const teksAsli = '&#128260; Sinkronkan';
            if (status.tipe === 'data') {
                elBtnSinkronAnggotaCache.innerHTML = '&#8987; Data... (' + (status.totalSejauhIni || 0) + ')';
            } else if (status.tipe === 'foto') {
                elBtnSinkronAnggotaCache.innerHTML = '&#8987; Foto... ' + (status.terproses || 0) + '/' + (status.totalFoto || 0);
            } else if (status.tipe === 'selesai') {
                elBtnSinkronAnggotaCache.disabled = false;
                elBtnSinkronAnggotaCache.innerHTML = teksAsli;
                tampilkanToast('success', 'Cache lokal diperbarui -- ' + (status.totalAnggota || 0) + ' anggota, ' + (status.fotoDiperbarui || 0) + ' foto diperbarui.');
                muatRingkasanCacheAnggota();
            } else if (status.tipe === 'error') {
                elBtnSinkronAnggotaCache.disabled = false;
                elBtnSinkronAnggotaCache.innerHTML = teksAsli;
                tampilkanToast('error', 'Sinkronisasi anggota gagal: ' + (status.pesan || ''));
            }
        });
    }

    // ==== Daftar/pencarian anggota ====

    const state = { keyword: '', page: 1, pageSize: 20, total: 0 };
    let cariTimer = null;

    let daftarAnggotaTerakhir = [];

    function renderTabelAnggota(daftar) {
        daftarAnggotaTerakhir = daftar || [];
        if (!daftar || daftar.length === 0) {
            elTabelAnggota.innerHTML = '<tr><td><div class="daftar-kosong"><span class="ico">&#128100;</span>Belum ada anggota yang cocok.</div></td></tr>';
            return;
        }
        const kelola = bolehKelolaAnggota();
        let html = '<thead><tr><th>Kode</th><th>Nama</th><th>Kode Identitas</th><th>No. HP</th><th>Jenis</th><th>Status</th>' + (kelola ? '<th></th>' : '') + '</tr></thead><tbody>';
        daftar.forEach((a) => {
            html += '<tr>'
                + '<td>' + escapeHtmlLokal(a.kode) + '</td>'
                + '<td' + (kelola ? ' class="nama-anggota" data-id="' + a.id + '" style="font-weight:700;cursor:pointer;"' : ' style="font-weight:700;"') + '>' + escapeHtmlLokal(a.nama) + '</td>'
                + '<td>' + escapeHtmlLokal(a.kodeIdentitas || '-') + '</td>'
                + '<td>' + escapeHtmlLokal(a.hp || '-') + '</td>'
                + '<td>' + escapeHtmlLokal(a.jenisNama || '-') + '</td>'
                + '<td>' + (a.aktif ? '<span class="badge hijau">Aktif</span>' : '<span class="badge abu">Non-Aktif</span>') + '</td>'
                + (kelola ? '<td><button type="button" class="btn-kecil ubah-anggota" data-id="' + a.id + '">Ubah</button></td>' : '')
                + '</tr>';
        });
        html += '</tbody>';
        elTabelAnggota.innerHTML = html;
        if (kelola) {
            elTabelAnggota.querySelectorAll('.ubah-anggota, .nama-anggota').forEach((el) => {
                el.addEventListener('click', () => bukaFormUbah(daftar.find((a) => String(a.id) === el.getAttribute('data-id'))));
            });
        }
    }

    function escapeHtmlLokal(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderPaginasiAnggota() {
        const totalHal = Math.max(1, Math.ceil(state.total / state.pageSize));
        elInfoPaginasiAnggota.textContent = 'Halaman ' + state.page + ' dari ' + totalHal + ' (' + state.total + ' anggota)';
        elBtnHalSebelumnyaAnggota.disabled = state.page <= 1;
        elBtnHalBerikutnyaAnggota.disabled = state.page >= totalHal;
    }

    async function muatDaftarAnggota() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.anggota.list({ keyword: state.keyword, page: state.page, page_size: state.pageSize });
            if (!r.ok) {
                window.PesanDetail.tampilkanDariHasil(r);
                renderTabelAnggota([]);
                return;
            }
            state.total = r.data.total || 0;
            renderTabelAnggota(r.data.data || []);
            renderPaginasiAnggota();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat daftar anggota: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elCariAnggota.addEventListener('input', () => {
        clearTimeout(cariTimer);
        cariTimer = setTimeout(() => { state.keyword = elCariAnggota.value.trim(); state.page = 1; muatDaftarAnggota(); }, 350);
    });
    elBtnHalSebelumnyaAnggota.addEventListener('click', () => { if (state.page > 1) { state.page--; muatDaftarAnggota(); } });
    elBtnHalBerikutnyaAnggota.addEventListener('click', () => { state.page++; muatDaftarAnggota(); });

    // ==== Form tambah/ubah ====

    let idSedangDiubah = null;

    function bukaFormTambah() {
        idSedangDiubah = null;
        elJudulFormAnggota.textContent = 'Tambah Anggota';
        elFormAnggotaNama.value = '';
        elFormAnggotaKodeIdentitas.value = '';
        elFormAnggotaJenis.value = '';
        elFormAnggotaHp.value = '';
        elFormAnggotaTelp.value = '';
        elFormAnggotaEmail.value = '';
        elFormAnggotaKeterangan.value = '';
        elFormAnggotaAktif.checked = true;
        elOverlayFormAnggota.className = 'overlay tampil';
        elFormAnggotaNama.focus();
    }

    function bukaFormUbah(a) {
        if (!a) return;
        idSedangDiubah = a.id;
        elJudulFormAnggota.textContent = 'Ubah Anggota: ' + a.nama;
        elFormAnggotaNama.value = a.nama || '';
        elFormAnggotaKodeIdentitas.value = a.kodeIdentitas || '';
        elFormAnggotaJenis.value = (a.jenisAnggotaKoperasiId == null) ? '' : String(a.jenisAnggotaKoperasiId);
        elFormAnggotaHp.value = a.hp || '';
        elFormAnggotaTelp.value = a.telp || '';
        elFormAnggotaEmail.value = a.email || '';
        elFormAnggotaKeterangan.value = a.keterangan || '';
        elFormAnggotaAktif.checked = a.aktif !== false;
        elOverlayFormAnggota.className = 'overlay tampil';
        elFormAnggotaNama.focus();
    }

    elBtnTambahAnggota.addEventListener('click', () => { if (bolehKelolaAnggota()) bukaFormTambah(); });
    elBtnTutupFormAnggota.addEventListener('click', () => { elOverlayFormAnggota.className = 'overlay'; });

    elBtnSimpanAnggota.addEventListener('click', async () => {
        if (!bolehKelolaAnggota()) return;
        const nama = elFormAnggotaNama.value.trim();
        if (!nama) { tampilkanToast('error', 'Nama anggota wajib diisi.'); elFormAnggotaNama.focus(); return; }

        const payload = {
            nama: nama,
            kode_identitas: elFormAnggotaKodeIdentitas.value.trim(),
            hp: elFormAnggotaHp.value.trim(),
            telp: elFormAnggotaTelp.value.trim(),
            email: elFormAnggotaEmail.value.trim(),
            keterangan: elFormAnggotaKeterangan.value.trim(),
            aktif: elFormAnggotaAktif.checked,
            jenis_anggota_koperasi_id: elFormAnggotaJenis.value || null
        };
        if (idSedangDiubah) payload.id = idSedangDiubah;

        elBtnSimpanAnggota.disabled = true;
        elBtnSimpanAnggota.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.anggota.simpan(payload);
            if (r.ok) {
                tampilkanToast('success', (idSedangDiubah ? 'Data anggota diperbarui.' : 'Anggota baru ditambahkan.') + ' Kode: ' + (r.data && r.data.kode || '-'));
                elOverlayFormAnggota.className = 'overlay';
                muatDaftarAnggota();
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSimpanAnggota.disabled = false;
            elBtnSimpanAnggota.textContent = 'Simpan';
        }
    });

    // ==== Inisialisasi ====
    segarkanStatus();
    muatJenisAnggota();
    muatDaftarAnggota();
    muatStatistikAnggota();
    muatRingkasanCacheAnggota();
    setInterval(segarkanStatus, 30000);
    // Auto-sync cache anggota tiap 10 menit (pola sama produk-renderer.js) -- HANYA jika sedang idle
    // (tombol tidak disabled), supaya tidak menabrak sinkron manual yg sedang berjalan.
    setInterval(() => {
        if (elBtnSinkronAnggotaCache && !elBtnSinkronAnggotaCache.disabled) {
            window.electronAPI.posAPI.anggotaSync.mulai();
        }
    }, 600000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
